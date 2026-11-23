"use client"

import { useSession } from "@better-auth-ui/react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query"
import { Link, useHydrated } from "@tanstack/react-router"
import { Heart, History, MessageCircle, Reply, Send, Trash2, TriangleAlert, X } from "lucide-react"
import { AnimatePresence, useReducedMotion, type Transition } from "motion/react"
import * as m from "motion/react-m"
import { startTransition, useEffect, useId, useOptimistic, useRef, useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { ButtonLink } from "@/components/ButtonLink"
import { ContentReportDialog } from "@/components/ContentReportDialog"
import { DateTime } from "@/components/DateTime"
import { CommentComposerSkeleton, DiscussionViewerSkeleton } from "@/components/LoadingStates"
import { MarkdownContent } from "@/components/MarkdownContent"
import { MotionBoundary } from "@/components/MotionBoundary"
import { PostShareActions } from "@/components/post-share-actions"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Toggle } from "@/components/ui/toggle"
import { avatarInitials } from "@/lib/avatar-initials"
import { useAppForm } from "@/lib/forms/app-form"
import {
  observedVerticalPosition,
  shouldShowPostActionDock,
  type ObservedVerticalPosition,
} from "@/lib/post-action-dock"
import { postQueryOptions } from "@/lib/queries/posts"
import {
  applyConfirmedHeart,
  discussionQueryOptions,
  discussionViewerQueryOptions,
  refreshAfterCommentChange,
} from "@/lib/queries/social"
import { userFacingServerMessage } from "@/lib/server-function-error"
import { heartCountLabel, optimisticHeartCount } from "@/lib/social-state"
import { threadComments } from "@/lib/thread-comments"
import { cn } from "@/lib/utils"
import type { getDiscussion } from "@/server/social"
import { createComment, deleteComment, setHeart } from "@/server/social"

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
  postId,
  count,
  hasHeart,
  disabled,
  signedOut,
  onPressedChange,
  busy,
}: {
  readonly postId: string
  readonly count: number
  readonly hasHeart: boolean
  readonly disabled: boolean
  readonly signedOut: boolean
  readonly onPressedChange: (pressed: boolean) => void
  readonly busy: boolean
}) {
  const countId = useId()
  const countDescription = (
    <span id={countId} hidden>
      {heartCountLabel(count)}
    </span>
  )

  if (signedOut) {
    return (
      <ButtonLink
        variant="ghost"
        size="sm"
        render={
          <Link
            to="/auth/$authView"
            params={{ authView: "sign-in" }}
            search={{ redirectTo: discussionRedirect(postId) }}
            aria-label="Sign in to add a heart"
            aria-describedby={countId}
          />
        }
      >
        <Heart aria-hidden="true" data-icon="inline-start" />
        <span className="tabular-nums">{count}</span>
        {countDescription}
      </ButtonLink>
    )
  }

  return (
    <Toggle
      pressed={hasHeart}
      onPressedChange={onPressedChange}
      size="sm"
      className="aria-pressed:bg-primary/10 aria-pressed:text-primary dark:aria-pressed:bg-primary/15"
      aria-label="Heart"
      aria-describedby={countId}
      aria-busy={busy}
      disabled={disabled}
    >
      <m.span
        className="inline-flex"
        initial={false}
        animate={hasHeart ? { scale: [1, 1.3, 1] } : { scale: 1 }}
        transition={heartTransition}
      >
        <Heart
          aria-hidden="true"
          data-icon="inline-start"
          className={cn(hasHeart ? "fill-current" : undefined)}
        />
      </m.span>
      <AnimatedHeartCount count={count} />
      {countDescription}
    </Toggle>
  )
}

/**
 * The action dock's comments link. Narrow screens hide the word visually but keep it in the
 * accessible name, so the link is not announced as a bare number.
 */
export function QuickCommentsLink({
  postId,
  commentCount,
}: {
  readonly postId: string
  readonly commentCount: number
}) {
  return (
    <ButtonLink
      variant="ghost"
      size="sm"
      render={<Link to="/post/$postId" params={{ postId }} hash="discussion" />}
    >
      <MessageCircle aria-hidden="true" data-icon="inline-start" />
      <span className="max-sm:sr-only">Comments</span>
      <span className="tabular-nums">{commentCount}</span>
    </ButtonLink>
  )
}

function discussionRedirect(postId: string) {
  return `/post/${encodeURIComponent(postId)}#discussion`
}

function focusCommentComposer(scroll?: { readonly reduceMotion: boolean | null }) {
  if (scroll) {
    document.querySelector("#comment-composer")?.scrollIntoView({
      behavior: scroll.reduceMotion ? "auto" : "smooth",
      block: "center",
    })
  }
  document.querySelector<HTMLTextAreaElement>("#comment-composer textarea")?.focus({
    preventScroll: true,
  })
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
  const [replyingTo, setReplyingTo] = useState<DiscussionComment | null>(null)
  const discussion = useSuspenseInfiniteQuery(discussionQueryOptions(postId))
  const session = useSession(authClient)
  // The server renders without a session. Keep the viewer pending until hydration finishes, or an
  // early session result inside this streamed boundary would not match the server HTML.
  const hydrated = useHydrated()
  const sessionPending = !hydrated || session.isPending
  const sessionUserId = sessionPending ? null : (session.data?.user.id ?? null)
  const viewer = useQuery({
    ...discussionViewerQueryOptions(postId, sessionUserId ?? "anonymous"),
    enabled: sessionUserId !== null,
  })
  const postAuthorId = useQuery({
    ...postQueryOptions(postId),
    select: (post) => post?.author.id ?? null,
  }).data
  // Text posts have no media between the metadata row and these actions, so the rows join.
  const postType = useQuery({
    ...postQueryOptions(postId),
    select: (post) => post?.type ?? null,
  }).data
  const viewerPending = sessionPending || (sessionUserId !== null && viewer.isPending)
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
    const contentStart = document.querySelector(`#${CSS.escape(`post-engagement-start-${postId}`)}`)
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
    return () => {
      observer.disconnect()
    }
  }, [postId])

  const heartMutation = useMutation({
    mutationFn: (active: boolean) => setHeart({ data: { postId, active } }),
    onSuccess: async ({ heartCount: nextHeartCount }, active) => {
      if (!sessionUserId) return
      await applyConfirmedHeart(queryClient, {
        viewerId: sessionUserId,
        postId,
        active,
        heartCount: nextHeartCount,
      })
    },
    onError: (error) =>
      toast.error(userFacingServerMessage(error) ?? "The heart could not be saved."),
  })

  const commentMutation = useMutation({
    mutationFn: (input: { content: string; parentCommentId?: string }) =>
      createComment({ data: { postId, ...input } }),
    onSuccess: () => refreshAfterCommentChange(queryClient, postId),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteComment({ data: { id } }),
    onSuccess: async () => {
      toast.success("Comment deleted.")
      await refreshAfterCommentChange(queryClient, postId)
    },
    onError: (error) =>
      toast.error(userFacingServerMessage(error) ?? "The comment could not be deleted."),
  })

  const form = useAppForm({
    defaultValues: { content: "" },
    onSubmit: async ({ value }) => {
      const content = value.content.trim()
      if (!content || !viewerId) return
      const parentCommentId = replyingTo?.id
      const pendingId = `pending-${crypto.randomUUID()}`
      // Keep the form submitting until the comment settles so a second click cannot post it twice.
      await new Promise<void>((resolve) => {
        startTransition(async () => {
          addOptimisticComment({
            id: pendingId,
            content,
            createdAt: new Date(),
            updatedAt: new Date(),
            authorId: viewerId,
            parentId: parentCommentId ?? null,
            authorName: "You",
            // The handle is unknown until the comment saves, so the row shows no handle.
            authorUsername: "",
            authorImage: null,
            optimistic: true,
          })
          try {
            await commentMutation.mutateAsync({ content, parentCommentId })
            form.reset()
            setReplyingTo(null)
          } catch (error) {
            toast.error(userFacingServerMessage(error) ?? "The comment could not be posted.")
          } finally {
            resolve()
          }
        })
      })
    },
  })

  const displayedHeartCount = optimisticHeartCount(heartCount, hasHeart, optimisticHasHeart)
  // Comments waiting on the server are not in the post's count yet.
  const displayedCommentCount =
    commentCount + optimisticComments.filter((comment) => comment.optimistic).length
  const showActionDock = shouldShowPostActionDock(contentStartPosition, footerActionsPosition)

  function updateHeart(nextHasHeart: boolean) {
    if (!viewerId || heartMutation.isPending) return
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
        className={cn("mx-auto max-w-5xl", postType !== "text" && "mt-5")}
        aria-labelledby="discussion-title"
      >
        <AnimatePresence initial={false}>
          {showActionDock ? (
            <m.nav
              key="quick-post-actions"
              className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-safe md:left-(--sidebar-width) md:group-has-data-[collapsible=icon]/sidebar-wrapper:left-(--sidebar-width-icon)"
              aria-label="Quick post actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={quickActionTransition}
            >
              <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-4 sm:px-6">
                <HeartControl
                  postId={postId}
                  count={displayedHeartCount}
                  hasHeart={optimisticHasHeart}
                  disabled={viewerPending || !viewerId}
                  signedOut={!viewerPending && sessionUserId === null}
                  onPressedChange={updateHeart}
                  busy={heartMutation.isPending}
                />
                <QuickCommentsLink postId={postId} commentCount={displayedCommentCount} />
                <div className="ml-auto">
                  <PostShareActions postId={postId} imageCount={imageCount} variant="ghost" />
                </div>
              </div>
            </m.nav>
          ) : null}
        </AnimatePresence>

        <nav
          ref={footerActionsRef}
          className="flex flex-wrap items-center gap-1 border-y py-2"
          aria-label="Post actions"
        >
          {viewerPending ? (
            <DiscussionViewerSkeleton />
          ) : (
            <HeartControl
              postId={postId}
              count={displayedHeartCount}
              hasHeart={optimisticHasHeart}
              disabled={!viewerId}
              signedOut={sessionUserId === null}
              onPressedChange={updateHeart}
              busy={heartMutation.isPending}
            />
          )}
          {viewerId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setReplyingTo(null)
                focusCommentComposer({ reduceMotion })
              }}
            >
              <MessageCircle aria-hidden="true" data-icon="inline-start" />
              Comment
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <PostShareActions postId={postId} imageCount={imageCount} variant="ghost" />
            <ContentReportDialog target={{ type: "post", id: postId }} authorId={postAuthorId} />
          </div>
        </nav>

        <div className="mt-6 grid gap-5">
          <h2
            id="discussion-title"
            className="flex items-baseline gap-2 font-heading text-lg font-semibold"
          >
            Comments
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              {displayedCommentCount}
            </span>
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
                        onClick={() => {
                          setReplyingTo(null)
                          focusCommentComposer()
                        }}
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
                      placeholder={
                        replyingTo ? "Write a reply…" : "Say something nice, or at least funny…"
                      }
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
              <Link
                to="/auth/$authView"
                params={{ authView: "sign-in" }}
                search={{ redirectTo: discussionRedirect(postId) }}
                className="underline"
              >
                Sign in
              </Link>{" "}
              to add a heart or comment.
            </p>
          )}

          {optimisticComments.length > 0 ? (
            <ItemGroup className="gap-0 border-y">
              <AnimatePresence initial={false}>
                {threadComments(optimisticComments).map(({ comment, nested }) => {
                  const canDelete =
                    !comment.optimistic && (comment.authorId === viewerId || viewerRole === "admin")
                  return (
                    <m.div
                      key={comment.id}
                      id={`comment-${comment.id}`}
                      className={cn(
                        "min-w-0 overflow-hidden wrap-anywhere [&:last-child>[data-slot=item]]:border-b-0",
                        nested && "ml-4 border-l pl-4",
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
                        <ItemMedia>
                          <Avatar>
                            {comment.authorImage ? (
                              <ResponsiveAvatarImage
                                src={comment.authorImage}
                                sizes="2rem"
                                alt=""
                              />
                            ) : null}
                            <AvatarFallback className="text-foreground">
                              {avatarInitials(comment.authorName)}
                            </AvatarFallback>
                          </Avatar>
                        </ItemMedia>
                        {/* One column keeps the name, text, and Reply close together beside the avatar. */}
                        <div className="grid min-w-0 gap-1">
                          {/* min-h-8 matches the avatar, so the name line sits level with it. */}
                          <ItemHeader className="min-h-8 min-w-0 basis-auto">
                            <ItemTitle className="line-clamp-none min-w-0">
                              {/* line-clamp-none makes the title a block, so the row needs its own flex. */}
                              <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                                <bdi className="min-w-0 truncate">{comment.authorName}</bdi>
                                {comment.authorUsername ? (
                                  <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
                                    @{comment.authorUsername}
                                  </span>
                                ) : null}
                                {/* The dot stays with the time, so a wrap never leaves it alone. */}
                                <span className="flex gap-x-1.5 text-xs font-normal whitespace-nowrap text-muted-foreground">
                                  <span aria-hidden="true">·</span>
                                  {comment.optimistic ? (
                                    "Sending…"
                                  ) : (
                                    <DateTime value={comment.createdAt} />
                                  )}
                                </span>
                              </span>
                            </ItemTitle>
                            {!comment.optimistic ? (
                              <ItemActions>
                                <ContentReportDialog
                                  target={{ type: "comment", id: comment.id }}
                                  authorId={comment.authorId}
                                  size="xs"
                                />
                                {canDelete ? (
                                  <Credenza>
                                    <CredenzaTrigger
                                      render={
                                        <Button
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
                                        <CredenzaClose
                                          render={<Button variant="outline" />}
                                          disabled={deleteMutation.isPending}
                                        >
                                          Keep comment
                                        </CredenzaClose>
                                        <Button
                                          variant="destructive"
                                          disabled={deleteMutation.isPending}
                                          onClick={() => {
                                            deleteMutation.mutate(comment.id)
                                          }}
                                        >
                                          {deleteMutation.isPending ? (
                                            <Spinner aria-hidden="true" data-icon="inline-start" />
                                          ) : (
                                            <Trash2 aria-hidden="true" data-icon="inline-start" />
                                          )}
                                          Delete comment
                                        </Button>
                                      </CredenzaFooter>
                                    </CredenzaContent>
                                  </Credenza>
                                ) : null}
                              </ItemActions>
                            ) : null}
                          </ItemHeader>
                          <ItemContent className="min-w-0">
                            <MarkdownContent variant="comment">{comment.content}</MarkdownContent>
                          </ItemContent>
                          {!comment.optimistic && !comment.parentId && viewerId ? (
                            <ItemFooter className="basis-auto justify-start">
                              {/* The negative margin lines the Reply label up with the comment text. */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="-ml-2 text-muted-foreground"
                                onClick={() => {
                                  setReplyingTo(comment)
                                  focusCommentComposer({ reduceMotion })
                                }}
                              >
                                <Reply aria-hidden="true" data-icon="inline-start" />
                                Reply
                              </Button>
                            </ItemFooter>
                          ) : null}
                        </div>
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
                      {/* Signed-out viewers already see the sign-in prompt above. */}
                      {viewerId ? (
                        <EmptyDescription>Be the first to say something.</EmptyDescription>
                      ) : null}
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
              onClick={() => void discussion.fetchNextPage()}
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
