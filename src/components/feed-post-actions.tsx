"use client"

import { useSession } from "@better-auth-ui/react"
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query"
import { Link, useHydrated, useLocation } from "@tanstack/react-router"
import { Heart, MessageCircle, Pencil } from "lucide-react"
import {
  createContext,
  startTransition,
  useContext,
  useId,
  useMemo,
  useOptimistic,
  type MouseEvent,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { ButtonLink } from "@/components/ButtonLink"
import { PostLinkActions } from "@/components/post-share-actions"
import { Toggle } from "@/components/ui/toggle"
import { batchFeedPostIds } from "@/lib/feed-heart-state"
import {
  applyConfirmedHeart,
  cachedFeedHeartStates,
  feedHeartStatesQueryOptions,
} from "@/lib/queries/social"
import { userFacingServerMessage } from "@/lib/server-function-error"
import { heartCountLabel, optimisticHeartCount } from "@/lib/social-state"
import { cn } from "@/lib/utils"
import { setHeart } from "@/server/social"

type FeedHeartState = {
  readonly viewerId: string | null
  /** Each post whose heart state is known for the viewer, mapped to whether it has the heart. */
  readonly heartStates: ReadonlyMap<string, boolean>
  readonly sessionPending: boolean
}

const anonymousFeedHeartState: FeedHeartState = {
  viewerId: null,
  heartStates: new Map(),
  sessionPending: false,
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
  const queryClient = useQueryClient()
  // The server renders without a session, so keep the viewer pending until hydration finishes.
  const hydrated = useHydrated()
  const session = useSession(authClient)
  const sessionPending = !hydrated || session.isPending
  const viewerId = sessionPending ? null : (session.data?.user.id ?? null)
  const batches = useMemo(() => batchFeedPostIds(postIds), [postIds])
  const { states } = useQueries({
    queries: batches.map((batch) =>
      feedHeartStatesQueryOptions(batch, viewerId ?? "anonymous", viewerId !== null),
    ),
    combine: (results) => ({
      states: results.map(({ data, isError }) => ({ data, isError })),
    }),
  })
  const feedHeartState = useMemo<FeedHeartState>(() => {
    if (!viewerId) return { viewerId, heartStates: new Map(), sessionPending }
    // Start from every batch this viewer has loaded, then apply the current batches. A changed
    // batch key then only waits on posts that no earlier batch included.
    const heartStates = cachedFeedHeartStates(queryClient, viewerId)
    batches.forEach((batch, index) => {
      const state = states[index]
      if (!state) return
      if (state.data) {
        const heartPostIds = new Set(state.data.heartPostIds)
        for (const postId of batch) heartStates.set(postId, heartPostIds.has(postId))
      } else if (state.isError) {
        for (const postId of batch) if (!heartStates.has(postId)) heartStates.set(postId, false)
      }
    })
    return { viewerId, heartStates, sessionPending }
  }, [batches, queryClient, sessionPending, states, viewerId])

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
  const currentHref = useLocation({ select: (location) => location.href })
  const { viewerId, heartStates, sessionPending } = useContext(FeedHeartStateContext)
  const knownHasHeart = heartStates.get(postId)
  const pending = sessionPending || (viewerId !== null && knownHasHeart === undefined)
  const hasHeart = knownHasHeart ?? false
  const [optimisticHasHeart, setOptimisticHasHeart] = useOptimistic(
    hasHeart,
    (_current: boolean, next: boolean) => next,
  )

  const mutation = useMutation({
    mutationFn: (active: boolean) => setHeart({ data: { postId, active } }),
    onSuccess: async ({ heartCount: nextHeartCount }, active) => {
      if (!viewerId) return
      await applyConfirmedHeart(queryClient, {
        viewerId,
        postId,
        active,
        heartCount: nextHeartCount,
      })
    },
    onError: (error) =>
      toast.error(userFacingServerMessage(error) ?? "The heart could not be saved."),
  })
  const displayedHeartCount = optimisticHeartCount(heartCount, hasHeart, optimisticHasHeart)
  const countId = useId()
  const countDescription = (
    <span id={countId} hidden>
      {heartCountLabel(displayedHeartCount)}
    </span>
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
      <ButtonLink
        variant="ghost"
        size="sm"
        className={feedActionClassName}
        render={
          <Link
            to="/auth/$authView"
            params={{ authView: "sign-in" }}
            search={{ redirectTo: currentHref }}
            aria-label={`Sign in to heart ${postTitle}`}
            aria-describedby={countId}
          />
        }
      >
        {content}
        {countDescription}
      </ButtonLink>
    )
  }

  function updateHeart(nextHasHeart: boolean) {
    // Ignore presses while a change saves instead of disabling the toggle: a disabled button drops
    // keyboard focus to the page body.
    if (!viewerId || mutation.isPending) return
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
      aria-describedby={countId}
      aria-busy={mutation.isPending}
      disabled={pending}
    >
      {content}
      {countDescription}
    </Toggle>
  )
}

export function FeedPostActions({
  postId,
  postTitle,
  heartCount,
  commentCount,
  onOpenPost,
  canEdit = false,
}: {
  readonly postId: string
  readonly postTitle: string
  readonly heartCount: number
  readonly commentCount: number
  readonly onOpenPost: (event: MouseEvent<HTMLAnchorElement>) => void
  readonly canEdit?: boolean
}) {
  return (
    <>
      <FeedHeartControl postId={postId} postTitle={postTitle} heartCount={heartCount} />
      <ButtonLink
        variant="ghost"
        size="sm"
        className={feedActionClassName}
        render={
          <Link to="/post/$postId" params={{ postId }} hash="discussion" onClick={onOpenPost} />
        }
      >
        <MessageCircle aria-hidden="true" data-icon="inline-start" />
        <span className="max-[359px]:sr-only">Comments</span>
        <span className="tabular-nums">{commentCount}</span>
      </ButtonLink>
      <PostLinkActions postId={postId} compactOnNarrowScreens className={feedActionClassName} />
      {canEdit ? (
        <ButtonLink
          variant="ghost"
          size="sm"
          className={feedActionClassName}
          render={<Link to="/post/$postId/edit" params={{ postId }} />}
        >
          <Pencil aria-hidden="true" data-icon="inline-start" />
          Edit
        </ButtonLink>
      ) : null}
    </>
  )
}
