import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Link2 } from "lucide-react"
import { Suspense, useEffect, useRef } from "react"
import { z } from "zod"

import { DiscussionSkeleton, PostDetailSkeleton } from "@/components/LoadingStates"
import { PostView } from "@/components/post-view"
import { SocialPanel } from "@/components/social-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { galleryLayouts } from "@/lib/gallery-layout"
import { createPostSeoHead } from "@/lib/post-seo"
import { postQueryOptions } from "@/lib/queries/posts"
import { discussionQueryOptions } from "@/lib/queries/social"
import { createSeoHead } from "@/lib/seo"
import { trackPostView } from "@/server/posts"

const postSearchSchema = z.object({
  image: z.coerce.number().int().min(0).max(149).optional().catch(undefined),
  layout: z.enum(galleryLayouts).optional().catch(undefined),
})

export const Route = createFileRoute("/post/$postId")({
  validateSearch: postSearchSchema,
  loader: async ({ context, params }) => {
    const postId = z.string().trim().min(1).max(64).parse(params.postId)
    const post = await context.queryClient.ensureQueryData(postQueryOptions(postId))
    if (!post) throw notFound()
    void context.queryClient.prefetchInfiniteQuery(discussionQueryOptions(postId))
    return post
  },
  headers: ({ loaderData }) => ({
    "Cache-Control":
      loaderData?.visibility === "public"
        ? "public, max-age=0, s-maxage=120, stale-while-revalidate=600"
        : "private, no-store",
  }),
  head: ({ loaderData, match }) =>
    loaderData
      ? createPostSeoHead(loaderData, match.search.image ?? 0)
      : createSeoHead({
          title: "Post · PistonPost",
          description: "A post on PistonPost.",
          path: match.pathname,
          twitterCard: "summary",
          indexing: "noindex",
        }),
  component: PostDetail,
  pendingComponent: PostDetailSkeleton,
})

function PostDetail() {
  const { postId } = Route.useParams()
  const { image, layout } = Route.useSearch()
  const post = useSuspenseQuery(postQueryOptions(postId)).data
  const queryClient = useQueryClient()
  const trackedPostId = useRef<string | null>(null)
  const visiblePostId = post?.id

  useEffect(() => {
    if (!visiblePostId || trackedPostId.current === visiblePostId) return
    trackedPostId.current = visiblePostId
    void trackPostView({ data: { id: visiblePostId } })
      .then(({ viewCount }) => {
        if (viewCount === null) return
        queryClient.setQueryData(postQueryOptions(visiblePostId).queryKey, (current) =>
          current && current.viewCount < viewCount ? { ...current, viewCount } : current,
        )
      })
      .catch(() => undefined)
  }, [queryClient, visiblePostId])

  if (!post) return null

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      {post.visibility === "unlisted" && (
        <Alert className="mb-8">
          <Link2 aria-hidden="true" />
          <AlertTitle>Unlisted post</AlertTitle>
          <AlertDescription>
            Anyone with this link can view this post. It is not private and does not appear in
            public feeds.
          </AlertDescription>
        </Alert>
      )}
      <PostView post={post} detail selectedImageIndex={image} galleryLayout={layout} />
      <Suspense fallback={<DiscussionSkeleton />}>
        <SocialPanel
          postId={post.id}
          counts={post.reactions}
          imageCount={post.media.filter((media) => media.kind === "image").length}
        />
      </Suspense>
    </main>
  )
}
