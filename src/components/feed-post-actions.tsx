"use client"

import { useSession } from "@better-auth-ui/react"
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Heart, MessageCircle } from "lucide-react"
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { CopyPostLinkButton } from "@/components/post-share-actions"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { batchFeedPostIds } from "@/lib/feed-heart-state"
import { discussionKeys, feedHeartStatesQueryOptions } from "@/lib/queries/social"
import { optimisticHeartCount } from "@/lib/social-state"
import { cn } from "@/lib/utils"
import { setHeart } from "@/server/social"

type FeedHeartState = {
  readonly viewerId: string | null
  readonly heartPostIds: ReadonlySet<string>
  readonly pending: boolean
}

const anonymousFeedHeartState: FeedHeartState = {
  viewerId: null,
  heartPostIds: new Set(),
  pending: false,
}

const FeedHeartStateContext = createContext<FeedHeartState>(anonymousFeedHeartState)
const feedActionClassName =
  "h-11 w-full min-w-0 overflow-hidden rounded-md px-1 text-muted-foreground hover:text-foreground sm:h-8 sm:w-auto sm:px-3"

export function FeedPostActionsProvider({
  postIds,
  children,
}: {
  readonly postIds: readonly string[]
  readonly children: ReactNode
}) {
  const session = useSession(authClient)
  const viewerId = session.data?.user.id ?? null
  const batches = batchFeedPostIds(postIds)
  const states = useQueries({
    queries: batches.map((batch) =>
      feedHeartStatesQueryOptions(
        batch,
        viewerId ?? "anonymous",
        viewerId !== null && !session.isPending,
      ),
    ),
  })
  const feedHeartState = useMemo<FeedHeartState>(
    () => ({
      viewerId,
      heartPostIds: new Set(states.flatMap((state) => state.data?.heartPostIds ?? [])),
      pending: session.isPending || (viewerId !== null && states.some((state) => state.isPending)),
    }),
    [session.isPending, states, viewerId],
  )

  return <FeedHeartStateContext value={feedHeartState}>{children}</FeedHeartStateContext>
}

function FeedHeartControl({
  postId,
  postTitle,
  heartCount,
}: {
  readonly postId: string
  readonly postTitle: string
  readonly heartCount: number
}) {
  const queryClient = useQueryClient()
  const { viewerId, heartPostIds, pending } = useContext(FeedHeartStateContext)
  const hasHeart = heartPostIds.has(postId)
  const [confirmedHeartCount, setConfirmedHeartCount] = useState(heartCount)
  const [optimisticHasHeart, setOptimisticHasHeart] = useOptimistic(
    hasHeart,
    (_current: boolean, next: boolean) => next,
  )

  useEffect(() => setConfirmedHeartCount(heartCount), [heartCount])

  const mutation = useMutation({
    mutationFn: (active: boolean) => setHeart({ data: { postId, active } }),
    onSuccess: async ({ heartCount: nextHeartCount }) => {
      setConfirmedHeartCount(nextHeartCount)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussionKeys.feedViewer() }),
        queryClient.invalidateQueries({ queryKey: discussionKeys.viewerPost(postId) }),
        queryClient.invalidateQueries({ queryKey: ["posts", "published", postId] }),
        queryClient.invalidateQueries({ queryKey: ["posts", "public-feed"] }),
        queryClient.invalidateQueries({ queryKey: ["posts", "following-feed"] }),
      ])
    },
    onError: () => toast.error("The heart could not be saved."),
  })
  const displayedHeartCount = optimisticHeartCount(
    confirmedHeartCount,
    hasHeart,
    optimisticHasHeart,
  )
  const content = (
    <>
      <Heart
        aria-hidden="true"
        data-icon="inline-start"
        className={cn(optimisticHasHeart ? "fill-current" : undefined)}
      />
      <span className="max-[359px]:sr-only">Heart</span>
      <span className="tabular-nums">{displayedHeartCount}</span>
    </>
  )

  if (!pending && !viewerId) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={feedActionClassName}
        nativeButton={false}
        render={
          <Link
            to="/auth/$authView"
            params={{ authView: "sign-in" }}
            aria-label={`Sign in to heart ${postTitle}`}
          />
        }
      >
        {content}
      </Button>
    )
  }

  function updateHeart(nextHasHeart: boolean) {
    if (!viewerId) return
    startTransition(async () => {
      setOptimisticHasHeart(nextHasHeart)
      try {
        await mutation.mutateAsync(nextHasHeart)
      } catch {
        // React restores the confirmed state when this transition settles.
      }
    })
  }

  return (
    <Toggle
      pressed={optimisticHasHeart}
      onPressedChange={updateHeart}
      variant="default"
      size="sm"
      className={cn(
        feedActionClassName,
        "aria-pressed:bg-primary/10 aria-pressed:text-primary dark:aria-pressed:bg-primary/15",
      )}
      aria-label="Heart"
      disabled={pending || mutation.isPending}
    >
      {content}
    </Toggle>
  )
}

export function FeedPostActions({
  postId,
  postTitle,
  heartCount,
  commentCount,
  onOpenPost,
}: {
  readonly postId: string
  readonly postTitle: string
  readonly heartCount: number
  readonly commentCount: number
  readonly onOpenPost: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <>
      <FeedHeartControl postId={postId} postTitle={postTitle} heartCount={heartCount} />
      <Button
        variant="ghost"
        size="sm"
        className={feedActionClassName}
        nativeButton={false}
        render={
          <Link to="/post/$postId" params={{ postId }} hash="discussion" onClick={onOpenPost} />
        }
      >
        <MessageCircle aria-hidden="true" data-icon="inline-start" />
        <span className="max-[359px]:sr-only">Comments</span>
        <span className="tabular-nums">{commentCount}</span>
      </Button>
      <CopyPostLinkButton postId={postId} compactOnNarrowScreens className={feedActionClassName} />
    </>
  )
}
