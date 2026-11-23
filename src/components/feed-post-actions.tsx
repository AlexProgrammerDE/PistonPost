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
  type ReactElement,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { ButtonLink } from "@/components/ButtonLink"
import { PostLinkActions } from "@/components/post-share-actions"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { batchFeedPostIds } from "@/lib/feed-heart-state"
import {
  applyConfirmedHeart,
  cachedFeedHeartStates,
  feedHeartStatesQueryOptions,
} from "@/lib/queries/social"
import { userFacingServerMessage } from "@/lib/server-function-error"
import { commentCountLabel, heartCountLabel, optimisticHeartCount } from "@/lib/social-state"
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
// Icon buttons keep a 44px touch target on phones and a quieter 32px target with a pointer.
const feedActionClassName =
  "h-11 min-w-11 rounded-md text-muted-foreground hover:text-foreground sm:h-8 sm:min-w-8"

/** An icon marked as inline-start gets less padding, which only suits an icon followed by a count. */
function feedActionIcon(count: number) {
  return count > 0 ? "inline-start" : undefined
}

/** Shows a count next to an action icon. A zero count adds noise, so it shows only the icon. */
function FeedActionCount({ count }: { readonly count: number }) {
  return count > 0 ? <span className="tabular-nums">{count}</span> : null
}

function FeedActionTooltip({
  label,
  trigger,
  children,
}: {
  readonly label: string
  readonly trigger: ReactElement
  readonly children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

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
        data-icon={feedActionIcon(displayedHeartCount)}
        className={cn(optimisticHasHeart ? "fill-current" : undefined)}
      />
      <FeedActionCount count={displayedHeartCount} />
    </>
  )

  if (!pending && !viewerId) {
    return (
      <FeedActionTooltip
        label="Sign in to heart"
        trigger={
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
          />
        }
      >
        {content}
        {countDescription}
      </FeedActionTooltip>
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
    <FeedActionTooltip
      label={optimisticHasHeart ? "Remove heart" : "Heart"}
      trigger={
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
        />
      }
    >
      {content}
      {countDescription}
    </FeedActionTooltip>
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
  const commentCountId = useId()

  return (
    <>
      <FeedHeartControl postId={postId} postTitle={postTitle} heartCount={heartCount} />
      <FeedActionTooltip
        label="Comments"
        trigger={
          <ButtonLink
            variant="ghost"
            size="sm"
            className={feedActionClassName}
            render={
              <Link
                to="/post/$postId"
                params={{ postId }}
                hash="discussion"
                onClick={onOpenPost}
                aria-label="Comments"
                aria-describedby={commentCountId}
              />
            }
          />
        }
      >
        <MessageCircle aria-hidden="true" data-icon={feedActionIcon(commentCount)} />
        <FeedActionCount count={commentCount} />
        <span id={commentCountId} hidden>
          {commentCountLabel(commentCount)}
        </span>
      </FeedActionTooltip>
      <PostLinkActions postId={postId} iconOnly className={feedActionClassName} />
      {canEdit ? (
        <FeedActionTooltip
          label="Edit post"
          trigger={
            <ButtonLink
              variant="ghost"
              size="sm"
              className={feedActionClassName}
              render={<Link to="/post/$postId/edit" params={{ postId }} aria-label="Edit post" />}
            />
          }
        >
          <Pencil aria-hidden="true" />
        </FeedActionTooltip>
      ) : null}
    </>
  )
}
