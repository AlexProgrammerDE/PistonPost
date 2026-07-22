"use client"

import { useSession } from "@better-auth-ui/react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Heart, History, MessageCircle, Reply, Send, Trash2, TriangleAlert, X } from "lucide-react"
import { AnimatePresence, useReducedMotion, type Transition } from "motion/react"
import * as m from "motion/react-m"
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { ContentReportDialog } from "@/components/ContentReportDialog"
import { DateTime } from "@/components/DateTime"
import { CommentComposerSkeleton, DiscussionViewerSkeleton } from "@/components/LoadingStates"
import { MarkdownContent } from "@/components/MarkdownContent"
import { MotionBoundary } from "@/components/MotionBoundary"
import { PostShareActions } from "@/components/post-share-actions"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Toggle } from "@/components/ui/toggle"
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
import { optimisticHeartCount } from "@/lib/social-state"
import { cn } from "@/lib/utils"
import { createComment, deleteComment, getDiscussion, setHeart } from "@/server/social"

type DiscussionComment = Awaited<ReturnType<typeof getDiscussion>>["comments"][number]
type CommentPage = DiscussionComment & { optimistic?: boolean }
const quickActionTransition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition
const heartTransition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition
const commentTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition

function AnimatedHeartCount({ count }: { readonly count: number }) {
  return (
    <span className="grid min-w-[1ch] overflow-hidden">
      <AnimatePresence initial={false}>
        <m.span
          key={count}
          className="col-start-1 row-start-1"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={heartTransition}
        >
          {count}
        </m.span>
      </AnimatePresence>
    </span>
  )
}

function HeartControl({
  count,
  hasHeart,
  disabled,
  onPressedChange,
  variant,
}: {
  readonly count: number
  readonly hasHeart: boolean
  readonly disabled: boolean
  readonly onPressedChange: (pressed: boolean) => void
  readonly variant: "default" | "outline"
}) {
  return (
    <Toggle
      pressed={hasHeart}
      onPressedChange={onPressedChange}
      variant={variant}
      size="sm"
      aria-label="Heart"
      disabled={disabled}
    >
      <m.span
        className={cn("inline-flex", hasHeart ? "text-primary" : undefined)}
        initial={false}
        animate={hasHeart ? { scale: [1, 1.16, 1] } : { scale: 1 }}
        transition={heartTransition}
      >
        <Heart
          aria-hidden="true"
          data-icon="inline-start"
          className={cn(hasHeart ? "fill-current" : undefined)}
        />
      </m.span>
      <AnimatedHeartCount count={count} />
    </Toggle>
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
  heartCount,
  commentCount,
  imageCount,
}: {
  postId: string
  heartCount: number
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
  const [confirmedHeartCount, setConfirmedHeartCount] = useState(heartCount)
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
  const hasHeart = viewer.data?.viewerHasHeart ?? false
  const [optimisticHasHeart, setOptimisticHasHeart] = useOptimistic(
    hasHeart,
    (_current: boolean, next: boolean) => next,
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

  const heartMutation = useMutation({
    mutationFn: (active: boolean) => setHeart({ data: { postId, active } }),
    onSuccess: async ({ heartCount: nextHeartCount }) => {
      setConfirmedHeartCount(nextHeartCount)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussionKeys.viewerPost(postId) }),
        queryClient.invalidateQueries({ queryKey: ["posts", "published", postId] }),
      ])
    },
    onError: () => toast.error("The heart could not be saved."),
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

  const displayedHeartCount = optimisticHeartCount(
    confirmedHeartCount,
    hasHeart,
    optimisticHasHeart,
  )
  const showActionDock = shouldShowPostActionDock(contentStartPosition, footerActionsPosition)

  function updateHeart(nextHasHeart: boolean) {
    if (!viewerId) {
      toast.error("Sign in to add a heart.")
      return
    }
    startTransition(async () => {
      setOptimisticHasHeart(nextHasHeart)
      try {
        await heartMutation.mutateAsync(nextHasHeart)
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
                <HeartControl
                  count={displayedHeartCount}
                  hasHeart={optimisticHasHeart}
                  disabled={viewerPending || !viewerId}
                  onPressedChange={updateHeart}
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
          <ButtonGroup aria-label="Share and report actions">
            <PostShareActions postId={postId} imageCount={imageCount} />
            <ContentReportDialog target={{ type: "post", id: postId }} variant="outline" />
          </ButtonGroup>
          {viewerPending ? (
            <DiscussionViewerSkeleton />
          ) : (
            <HeartControl
              count={displayedHeartCount}
              hasHeart={optimisticHasHeart}
              disabled={!viewerId}
              onPressedChange={updateHeart}
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
                  <Alert role="status">
                    <AlertDescription className="min-w-0 truncate">
                      Replying to{" "}
                      <bdi className="font-medium text-foreground">
                        @{replyingTo.authorUsername}
                      </bdi>
                    </AlertDescription>
                    <AlertAction>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Cancel reply"
                        onClick={() => setReplyingTo(null)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </AlertAction>
                  </Alert>
                ) : null}
                <form.AppField name="content">
                  {(field) => (
                    <field.ComposerTextareaField
                      label={replyingTo ? "Add a reply" : "Add a comment"}
                      placeholder={replyingTo ? "Write a reply…" : "Write a comment…"}
                      description="Markdown formatting is supported."
                      maxLength={250}
                      rows={3}
                      actions={
                        <form.SubmitInputGroupButton size="sm" variant="default">
                          <Send aria-hidden="true" data-icon="inline-start" />
                          {replyingTo ? "Post reply" : "Post comment"}
                        </form.SubmitInputGroupButton>
                      }
                    />
                  )}
                </form.AppField>
              </form.AppForm>
            </form>
          ) : sessionUserId ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Discussion controls unavailable</AlertTitle>
              <AlertDescription>
                Your comment and heart controls could not be loaded. Try refreshing the page.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link to="/auth/$authView" params={{ authView: "sign-in" }} className="underline">
                Sign in
              </Link>{" "}
              to add a heart or comment.
            </p>
          )}

          {optimisticComments.length > 0 ? (
            <ItemGroup className="gap-0 border-y">
              <AnimatePresence initial={false}>
                {optimisticComments.map((comment) => {
                  const canDelete =
                    !comment.optimistic && (comment.authorId === viewerId || viewerRole === "admin")
                  return (
                    <m.div
                      key={comment.id}
                      id={`comment-${comment.id}`}
                      className={cn(
                        "min-w-0 overflow-hidden wrap-anywhere [&:last-child>[data-slot=item]]:border-b-0",
                        comment.parentId && "ml-8 border-l pl-4 sm:ml-12",
                      )}
                      role="listitem"
                      initial={
                        comment.optimistic
                          ? { height: reduceMotion ? "auto" : 0, opacity: 0 }
                          : false
                      }
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: reduceMotion ? "auto" : 0, opacity: 0 }}
                      transition={commentTransition}
                    >
                      <Item
                        render={<article />}
                        variant="outline"
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-start rounded-none border-x-0 border-t-0 px-0 py-5"
                      >
                        <ItemMedia className="row-span-3">
                          <Avatar>
                            {comment.authorImage ? (
                              <ResponsiveAvatarImage
                                src={comment.authorImage}
                                sizes="2rem"
                                alt=""
                              />
                            ) : null}
                            <AvatarFallback className="text-foreground">
                              {comment.authorName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </ItemMedia>
                        <ItemHeader className="col-start-2 min-w-0 basis-auto items-start">
                          <div className="min-w-0">
                            <ItemTitle className="line-clamp-none min-w-0 flex-wrap">
                              <bdi className="min-w-0 truncate">{comment.authorName}</bdi>
                              <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
                                @{comment.authorUsername}
                              </span>
                            </ItemTitle>
                            <ItemDescription className="line-clamp-none text-xs">
                              {comment.optimistic ? (
                                "Sending…"
                              ) : (
                                <DateTime value={comment.createdAt} />
                              )}
                            </ItemDescription>
                          </div>
                          {!comment.optimistic ? (
                            <ItemActions>
                              <ContentReportDialog
                                target={{ type: "comment", id: comment.id }}
                                size="xs"
                              />
                              {canDelete ? (
                                <AlertDialog>
                                  <AlertDialogTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="Delete comment"
                                      />
                                    }
                                  >
                                    <Trash2 aria-hidden="true" />
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        The comment text will be removed from the discussion.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel disabled={deleteMutation.isPending}>
                                        Keep comment
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        variant="destructive"
                                        disabled={deleteMutation.isPending}
                                        onClick={() => deleteMutation.mutate(comment.id)}
                                      >
                                        {deleteMutation.isPending ? (
                                          <Spinner aria-hidden="true" data-icon="inline-start" />
                                        ) : (
                                          <Trash2 aria-hidden="true" data-icon="inline-start" />
                                        )}
                                        Delete comment
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              ) : null}
                            </ItemActions>
                          ) : null}
                        </ItemHeader>
                        <ItemContent className="col-start-2 min-w-0">
                          <MarkdownContent variant="comment">{comment.content}</MarkdownContent>
                        </ItemContent>
                        {!comment.optimistic && !comment.parentId && viewerId ? (
                          <ItemFooter className="col-start-2 basis-auto justify-start">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
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
                          </ItemFooter>
                        ) : null}
                      </Item>
                    </m.div>
                  )
                })}
              </AnimatePresence>
            </ItemGroup>
          ) : null}
          <div>
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
