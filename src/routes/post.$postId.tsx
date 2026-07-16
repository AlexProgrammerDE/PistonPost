import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"

import { DiscussionSkeleton, PostDetailSkeleton } from "@/components/LoadingStates"
import { PostView } from "@/components/post-view"
import { SocialPanel } from "@/components/social-panel"
import { Badge } from "@/components/ui/badge"
import { galleryLayouts } from "@/lib/gallery-layout"
import { createPostSeoHead } from "@/lib/post-seo"
import { postQueryOptions } from "@/lib/queries/posts"
import { discussionQueryOptions } from "@/lib/queries/social"
import { createSeoHead } from "@/lib/seo"

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
  if (!post) return null

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      {post.visibility === "unlisted" && (
        <div className="mx-auto mb-8 flex max-w-5xl items-center gap-3 border-y bg-muted/30 px-3 py-3 text-sm">
          <Badge variant="outline">Unlisted</Badge>
          <p>
            Anyone with this link can view this post. It is not private and does not appear in
            public feeds.
          </p>
        </div>
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
