"use client"

import { useSession } from "@better-auth-ui/react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Heart, History, MessageCircle, Send, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react"
import { startTransition, useOptimistic, useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { CommentComposerSkeleton, DiscussionViewerSkeleton } from "@/components/LoadingStates"
import { PostShareActions } from "@/components/post-share-actions"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAppForm } from "@/lib/forms/app-form"
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
import { createComment, deleteComment, getDiscussion, setReaction } from "@/server/social"

type DiscussionComment = Awaited<ReturnType<typeof getDiscussion>>["comments"][number]
type CommentPage = DiscussionComment & { optimistic?: boolean }
const reactionTypeSet = new Set<string>(reactionTypes)

export function SocialPanel({
  postId,
  counts,
  imageCount,
}: {
  postId: string
  counts: ReactionCounts
  imageCount: number
}) {
  const queryClient = useQueryClient()
  const [confirmedCounts, setConfirmedCounts] = useState(counts)
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
    mutationFn: (content: string) => createComment({ data: { postId, content } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discussionKeys.public(postId) }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteComment({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discussionKeys.public(postId) }),
    onError: () => toast.error("The comment could not be deleted."),
  })

  const form = useAppForm({
    defaultValues: { content: "" },
    onSubmit: async ({ value }) => {
      const content = value.content.trim()
      if (!content || !viewerId) return
      const pendingId = `pending-${crypto.randomUUID()}`
      startTransition(async () => {
        addOptimisticComment({
          id: pendingId,
          content,
          createdAt: new Date(),
          updatedAt: new Date(),
          authorId: viewerId,
          authorName: "You",
          authorUsername: "you",
          authorImage: null,
          optimistic: true,
        })
        try {
          await commentMutation.mutateAsync(content)
          form.reset()
        } catch {
          toast.error("The comment could not be posted.")
        }
      })
    },
  })

  const displayedCounts = optimisticReactionCounts(confirmedCounts, active, optimisticActive)

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
    <section id="discussion" className="mx-auto mt-5 max-w-5xl" aria-labelledby="discussion-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <PostShareActions postId={postId} imageCount={imageCount} />
        {viewerPending ? (
          <DiscussionViewerSkeleton />
        ) : (
          <ToggleGroup
            value={optimisticActive}
            onValueChange={updateReactions}
            variant="outline"
            aria-label={viewerId ? "Your reaction" : "Reaction totals"}
          >
            <ToggleGroupItem value="like" aria-label="Like" disabled={!viewerId}>
              <ThumbsUp aria-hidden="true" /> {displayedCounts.like}
            </ToggleGroupItem>
            <ToggleGroupItem value="dislike" aria-label="Dislike" disabled={!viewerId}>
              <ThumbsDown aria-hidden="true" /> {displayedCounts.dislike}
            </ToggleGroupItem>
            <ToggleGroupItem value="heart" aria-label="Heart" disabled={!viewerId}>
              <Heart aria-hidden="true" /> {displayedCounts.heart}
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

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
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <form.AppForm>
              <form.AppField name="content">
                {(field) => (
                  <field.TextareaField
                    label="Add a comment"
                    placeholder="Write a comment…"
                    maxLength={250}
                    rows={3}
                  />
                )}
              </form.AppField>
              <div className="flex justify-end">
                <form.SubmitButton>
                  <Send aria-hidden="true" data-icon="inline-start" />
                  Post comment
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

        {optimisticComments.length === 0 ? (
          <Empty className="min-h-40 rounded-none border-y p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircle aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No comments yet</EmptyTitle>
              <EmptyDescription>Start the conversation.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-0">
            {optimisticComments.map((comment) => {
              const canDelete =
                !comment.optimistic && (comment.authorId === viewerId || viewerRole === "admin")
              return (
                <article
                  key={comment.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-5"
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
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{comment.authorName}</span>
                      <span className="text-xs text-muted-foreground">
                        @{comment.authorUsername}
                      </span>
                      {comment.optimistic ? (
                        <span className="text-xs text-muted-foreground">Sending…</span>
                      ) : null}
                      {canDelete ? (
                        <AlertDialog>
                          <AlertDialogTrigger
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
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The comment text will be removed from the discussion.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep comment</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(comment.id)}
                              >
                                <Trash2 aria-hidden="true" data-icon="inline-start" />
                                Delete comment
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-6 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                  <Separator className="col-span-2" />
                </article>
              )
            })}
          </div>
        )}

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
  )
}
