"use client"

import { useSession } from "@better-auth-ui/react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  Heart,
  History,
  type LucideIcon,
  MessageCircle,
  Reply,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react"
import { AnimatePresence, useReducedMotion, type Transition } from "motion/react"
import * as m from "motion/react-m"
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { ContentReportDialog } from "@/components/ContentReportDialog"
import { DateTime } from "@/components/DateTime"
import { CommentComposerSkeleton, DiscussionViewerSkeleton } from "@/components/LoadingStates"
import { MotionBoundary } from "@/components/MotionBoundary"
import { PostShareActions } from "@/components/post-share-actions"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAppForm } from "@/lib/forms/app-form"
import {
  observedVerticalPosition,
  shouldShowPostActionDock,
  type ObservedVerticalPosition,
} from "@/lib/post-action-dock"
import {
  discussionKeys,
  discussionQueryOptions,
  discussionViewerQueryOptions,
} from "@/lib/queries/social"
import {
  applyOptimisticReaction,
  optimisticReactionCounts,
  reactionTypes,
  type ReactionCounts,
  type ReactionType,
} from "@/lib/social-state"
import { cn } from "@/lib/utils"
import { createComment, deleteComment, getDiscussion, setReaction } from "@/server/social"

type DiscussionComment = Awaited<ReturnType<typeof getDiscussion>>["comments"][number]
type CommentPage = DiscussionComment & { optimistic?: boolean }
const reactionTypeSet = new Set<string>(reactionTypes)
const reactionDetails = [
  { type: "like", label: "Like", icon: ThumbsUp },
  { type: "dislike", label: "Dislike", icon: ThumbsDown },
  { type: "heart", label: "Heart", icon: Heart },
] satisfies ReadonlyArray<{ type: ReactionType; label: string; icon: LucideIcon }>
const quickActionTransition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition
const reactionTransition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition
const commentTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition

function AnimatedReactionCount({ count }: { readonly count: number }) {
  return (
    <span className="grid min-w-[1ch] overflow-hidden">
      <AnimatePresence initial={false}>
        <m.span
          key={count}
          className="col-start-1 row-start-1"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={reactionTransition}
        >
          {count}
        </m.span>
      </AnimatePresence>
    </span>
  )
}

function ReactionItem({
  type,
  label,
  icon: Icon,
  count,
  active,
  disabled,
}: {
  readonly type: ReactionType
  readonly label: string
  readonly icon: LucideIcon
  readonly count: number
  readonly active: boolean
  readonly disabled: boolean
}) {
  return (
    <ToggleGroupItem value={type} aria-label={label} disabled={disabled}>
      <m.span
        className={cn("inline-flex", active ? "text-primary" : undefined)}
        initial={false}
        animate={active ? { scale: [1, 1.16, 1] } : { scale: 1 }}
        transition={reactionTransition}
      >
        <Icon
          aria-hidden="true"
          data-icon="inline-start"
          className={cn(type === "heart" && active ? "fill-current" : undefined)}
        />
      </m.span>
      <AnimatedReactionCount count={count} />
    </ToggleGroupItem>
  )
}

function ReactionControls({
  active,
  counts,
  disabled,
  label,
  onValueChange,
  variant,
}: {
  readonly active: ReactionType[]
  readonly counts: ReactionCounts
  readonly disabled: boolean
  readonly label: string
  readonly onValueChange: (next: unknown[]) => void
  readonly variant: "default" | "outline"
}) {
  return (
    <ToggleGroup
      value={active}
      onValueChange={onValueChange}
      variant={variant}
      size="sm"
      aria-label={label}
    >
      {reactionDetails.map((reaction) => (
        <ReactionItem
          key={reaction.type}
          type={reaction.type}
          label={reaction.label}
          icon={reaction.icon}
          count={counts[reaction.type]}
          active={active.includes(reaction.type)}
          disabled={disabled}
        />
      ))}
    </ToggleGroup>
  )
}

function elementPosition(element: Element): ObservedVerticalPosition {
  const bounds = element.getBoundingClientRect()
  return observedVerticalPosition({
    isIntersecting: bounds.bottom > 0 && bounds.top < window.innerHeight,
    top: bounds.top,
    bottom: bounds.bottom,
  })
}

export function SocialPanel({
  postId,
  counts,
  commentCount,
  imageCount,
}: {
  postId: string
  counts: ReactionCounts
  commentCount: number
  imageCount: number
}) {
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()
  const footerActionsRef = useRef<HTMLElement | null>(null)
  const [contentStartPosition, setContentStartPosition] =
    useState<ObservedVerticalPosition>("visible")
  const [footerActionsPosition, setFooterActionsPosition] =
    useState<ObservedVerticalPosition>("below")
  const [confirmedCounts, setConfirmedCounts] = useState(counts)
  const [replyingTo, setReplyingTo] = useState<DiscussionComment | null>(null)
  const discussion = useSuspenseInfiniteQuery(discussionQueryOptions(postId))
  const session = useSession(authClient)
  const sessionUserId = session.data?.user.id ?? null
  const viewer = useQuery({
    ...discussionViewerQueryOptions(postId, sessionUserId ?? "anonymous"),
    enabled: sessionUserId !== null && !session.isPending,
  })
  const viewerPending = session.isPending || (sessionUserId !== null && viewer.isPending)
  const viewerId = viewer.data?.viewerId ?? null
  const viewerRole = viewer.data?.viewerRole ?? null
  const active = viewer.data?.viewerReactions ?? []
  const [optimisticActive, setOptimisticActive] = useOptimistic(
    active,
    (current: ReactionType[], update: { type: ReactionType; active: boolean }) =>
      applyOptimisticReaction(current, update),
  )
  const comments: CommentPage[] = discussion.data.pages.flatMap((page) =>
    page.comments.map((comment) => ({ ...comment })),
  )
  const [optimisticComments, addOptimisticComment] = useOptimistic(
    comments,
    (current, pending: CommentPage) => [pending, ...current],
  )

  useEffect(() => {
    const contentStart = document.getElementById("post-engagement-start")
    const footerActions = footerActionsRef.current
    if (!contentStart || !footerActions || typeof IntersectionObserver === "undefined") {
      return undefined
    }

    setContentStartPosition(elementPosition(contentStart))
    setFooterActionsPosition(elementPosition(footerActions))

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const position = observedVerticalPosition({
          isIntersecting: entry.isIntersecting,
          top: entry.boundingClientRect.top,
          bottom: entry.boundingClientRect.bottom,
        })
        if (entry.target === contentStart) setContentStartPosition(position)
        if (entry.target === footerActions) setFooterActionsPosition(position)
      }
    })

    observer.observe(contentStart)
    observer.observe(footerActions)
    return () => observer.disconnect()
  }, [postId])

  const reactionMutation = useMutation({
    mutationFn: (input: { type: ReactionType; active: boolean }) =>
      setReaction({ data: { postId, ...input } }),
    onSuccess: async (nextCounts) => {
      setConfirmedCounts({
        like: nextCounts.like ?? 0,
        dislike: nextCounts.dislike ?? 0,
        heart: nextCounts.heart ?? 0,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussionKeys.viewerPost(postId) }),
        queryClient.invalidateQueries({ queryKey: ["posts", "published", postId] }),
      ])
    },
    onError: () => toast.error("The reaction could not be saved."),
  })

  const commentMutation = useMutation({
    mutationFn: (input: { content: string; parentCommentId?: string }) =>
      createComment({ data: { postId, ...input } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussionKeys.public(postId) }),
        queryClient.invalidateQueries({ queryKey: ["posts", "published", postId] }),
      ])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteComment({ data: { id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussionKeys.public(postId) }),
        queryClient.invalidateQueries({ queryKey: ["posts", "published", postId] }),
      ])
    },
    onError: () => toast.error("The comment could not be deleted."),
  })

  const form = useAppForm({
    defaultValues: { content: "" },
    onSubmit: async ({ value }) => {
      const content = value.content.trim()
      if (!content || !viewerId) return
      const parentCommentId = replyingTo?.id
      const pendingId = `pending-${crypto.randomUUID()}`
      startTransition(async () => {
        addOptimisticComment({
          id: pendingId,
          content,
          createdAt: new Date(),
          updatedAt: new Date(),
          authorId: viewerId,
          parentId: parentCommentId ?? null,
          authorName: "You",
          authorUsername: "you",
          authorImage: null,
          optimistic: true,
        })
        try {
          await commentMutation.mutateAsync({ content, parentCommentId })
          form.reset()
          setReplyingTo(null)
        } catch {
          toast.error("The comment could not be posted.")
        }
      })
    },
  })

  const displayedCounts = optimisticReactionCounts(confirmedCounts, active, optimisticActive)
  const showActionDock = shouldShowPostActionDock(contentStartPosition, footerActionsPosition)

  function updateReactions(next: unknown[]) {
    if (!viewerId) {
      toast.error("Sign in to react.")
      return
    }
    const selected = new Set(
      next.filter(
        (value): value is ReactionType => typeof value === "string" && reactionTypeSet.has(value),
      ),
    )
    const type = reactionTypes.find(
      (candidate) => selected.has(candidate) !== optimisticActive.includes(candidate),
    )
    if (!type) return
    const isActive = selected.has(type)
    startTransition(async () => {
      setOptimisticActive({ type, active: isActive })
      try {
        await reactionMutation.mutateAsync({ type, active: isActive })
      } catch {
        // React restores the confirmed state when this transition settles.
      }
    })
  }

  return (
    <MotionBoundary>
      <section
        id="discussion"
        className="mx-auto mt-5 max-w-5xl"
        aria-labelledby="discussion-title"
      >
        <AnimatePresence initial={false}>
          {showActionDock ? (
            <m.nav
              key="quick-post-actions"
              className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)]"
              aria-label="Quick post actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={quickActionTransition}
            >
              <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
                <PostShareActions postId={postId} imageCount={imageCount} variant="ghost" />
                <ReactionControls
                  active={optimisticActive}
                  counts={displayedCounts}
                  disabled={viewerPending || !viewerId}
                  label={viewerId ? "Your quick reactions" : "Quick reaction totals"}
                  onValueChange={updateReactions}
                  variant="default"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<Link to="/post/$postId" params={{ postId }} hash="discussion" />}
                >
                  <MessageCircle aria-hidden="true" data-icon="inline-start" />
                  <span className="hidden sm:inline">Comments</span>
                  {commentCount}
                </Button>
              </div>
            </m.nav>
          ) : null}
        </AnimatePresence>

        <nav
          ref={footerActionsRef}
          className="flex flex-wrap items-center justify-between gap-3 border-y py-3"
          aria-label="Post actions"
        >
          <div className="flex items-center gap-1">
            <PostShareActions postId={postId} imageCount={imageCount} />
            <ContentReportDialog target={{ type: "post", id: postId }} />
          </div>
          {viewerPending ? (
            <DiscussionViewerSkeleton />
          ) : (
            <ReactionControls
              active={optimisticActive}
              counts={displayedCounts}
              disabled={!viewerId}
              label={viewerId ? "Your reaction" : "Reaction totals"}
              onValueChange={updateReactions}
              variant="outline"
            />
          )}
        </nav>

        <div className="mt-10 grid gap-8">
          <h2
            id="discussion-title"
            className="flex items-center gap-2 font-heading text-2xl font-bold"
          >
            <MessageCircle aria-hidden="true" className="size-5 text-muted-foreground" />
            Comments
          </h2>
          {viewerPending ? (
            <CommentComposerSkeleton />
          ) : viewerId ? (
            <form
              id="comment-composer"
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
              }}
            >
              <form.AppForm>
                {replyingTo ? (
                  <div className="flex items-center justify-between gap-3 border-l-2 border-primary px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-muted-foreground">
                      Replying to{" "}
                      <bdi className="font-medium text-foreground">
                        @{replyingTo.authorUsername}
                      </bdi>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Cancel reply"
                      onClick={() => setReplyingTo(null)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
                <form.AppField name="content">
                  {(field) => (
                    <field.TextareaField
                      label={replyingTo ? "Add a reply" : "Add a comment"}
                      placeholder={replyingTo ? "Write a reply…" : "Write a comment…"}
                      maxLength={250}
                      rows={3}
                    />
                  )}
                </form.AppField>
                <div className="flex justify-end">
                  <form.SubmitButton>
                    <Send aria-hidden="true" data-icon="inline-start" />
                    {replyingTo ? "Post reply" : "Post comment"}
                  </form.SubmitButton>
                </div>
              </form.AppForm>
            </form>
          ) : sessionUserId ? (
            <p className="text-sm text-muted-foreground" role="status">
              Your comment and reaction controls could not be loaded. Try refreshing the page.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link to="/auth/$authView" params={{ authView: "sign-in" }} className="underline">
                Sign in
              </Link>{" "}
              to react or comment.
            </p>
          )}

          <div className="grid gap-0">
            <AnimatePresence initial={false}>
              {optimisticComments.map((comment) => {
                const canDelete =
                  !comment.optimistic && (comment.authorId === viewerId || viewerRole === "admin")
                return (
                  <m.article
                    key={comment.id}
                    id={`comment-${comment.id}`}
                    className={cn(
                      "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 overflow-hidden py-5 wrap-anywhere",
                      comment.parentId && "ml-8 border-l pl-4 sm:ml-12",
                    )}
                    initial={
                      comment.optimistic ? { height: reduceMotion ? "auto" : 0, opacity: 0 } : false
                    }
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: reduceMotion ? "auto" : 0, opacity: 0 }}
                    transition={commentTransition}
                  >
                    <Avatar>
                      {comment.authorImage ? (
                        <ResponsiveAvatarImage src={comment.authorImage} sizes="2rem" alt="" />
                      ) : null}
                      <AvatarFallback className="text-foreground">
                        {comment.authorName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 text-sm">
                        <bdi className="min-w-0 truncate font-semibold">{comment.authorName}</bdi>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          @{comment.authorUsername}
                        </span>
                        {comment.optimistic ? (
                          <span className="text-xs text-muted-foreground">Sending…</span>
                        ) : (
                          <DateTime
                            value={comment.createdAt}
                            className="shrink-0 text-xs text-muted-foreground"
                          />
                        )}
                        {!comment.optimistic ? (
                          <span className="ml-auto flex items-center gap-1">
                            <ContentReportDialog
                              target={{ type: "comment", id: comment.id }}
                              size="xs"
                            />
                            {canDelete ? (
                              <Credenza>
                                <CredenzaTrigger
                                  render={
                                    <Button
                                      className="ml-auto"
                                      variant="ghost"
                                      size="icon-xs"
                                      aria-label="Delete comment"
                                    />
                                  }
                                >
                                  <Trash2 aria-hidden="true" />
                                </CredenzaTrigger>
                                <CredenzaContent>
                                  <CredenzaHeader>
                                    <CredenzaTitle>Delete this comment?</CredenzaTitle>
                                    <CredenzaDescription>
                                      The comment text will be removed from the discussion.
                                    </CredenzaDescription>
                                  </CredenzaHeader>
                                  <CredenzaFooter>
                                    <CredenzaClose render={<Button variant="outline" />}>
                                      Keep comment
                                    </CredenzaClose>
                                    <Button
                                      variant="destructive"
                                      disabled={deleteMutation.isPending}
                                      onClick={() => deleteMutation.mutate(comment.id)}
                                    >
                                      <Trash2 aria-hidden="true" data-icon="inline-start" />
                                      Delete comment
                                    </Button>
                                  </CredenzaFooter>
                                </CredenzaContent>
                              </Credenza>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      <p
                        dir="auto"
                        className="mt-1 overflow-hidden text-sm leading-6 whitespace-pre-wrap"
                      >
                        {comment.content}
                      </p>
                      {!comment.optimistic && !comment.parentId && viewerId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="mt-2"
                          onClick={() => {
                            setReplyingTo(comment)
                            document
                              .getElementById("comment-composer")
                              ?.scrollIntoView({ behavior: "smooth", block: "center" })
                          }}
                        >
                          <Reply aria-hidden="true" data-icon="inline-start" />
                          Reply
                        </Button>
                      ) : null}
                    </div>
                    <Separator className="col-span-2" />
                  </m.article>
                )
              })}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {optimisticComments.length === 0 ? (
                <m.div
                  key="empty-comments"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={commentTransition}
                >
                  <Empty className="min-h-40 rounded-none border-y p-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <MessageCircle aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No comments yet</EmptyTitle>
                      <EmptyDescription>Start the conversation.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </m.div>
              ) : null}
            </AnimatePresence>
          </div>

          {discussion.hasNextPage ? (
            <Button
              variant="outline"
              disabled={discussion.isFetchingNextPage}
              onClick={() => discussion.fetchNextPage()}
            >
              {discussion.isFetchingNextPage ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <History aria-hidden="true" data-icon="inline-start" />
              )}
              {discussion.isFetchingNextPage ? "Loading…" : "Load earlier comments"}
            </Button>
          ) : null}
        </div>
      </section>
    </MotionBoundary>
  )
}
