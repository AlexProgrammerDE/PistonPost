import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { PostView } from "@/components/post-view"
import { SocialPanel } from "@/components/social-panel"
import { Badge } from "@/components/ui/badge"
import { createPostSeoHead } from "@/lib/post-seo"
import { postQueryOptions } from "@/lib/queries/posts"
import { createSeoHead } from "@/lib/seo"

const postSearchSchema = z.object({
  image: z.coerce.number().int().min(0).max(149).optional().catch(undefined),
})

export const Route = createFileRoute("/post/$postId")({
  validateSearch: postSearchSchema,
  loader: async ({ context, params }) => {
    const postId = z.string().trim().min(1).max(64).parse(params.postId)
    const post = await context.queryClient.ensureQueryData(postQueryOptions(postId))
    if (!post) throw notFound()
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
          noIndex: true,
        }),
  component: PostDetail,
})

function PostDetail() {
  const { postId } = Route.useParams()
  const { image = 0 } = Route.useSearch()
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
      <PostView post={post} detail selectedImageIndex={image} />
      <SocialPanel
        postId={post.id}
        counts={post.reactions}
        imageCount={post.media.filter((media) => media.kind === "image").length}
      />
    </main>
  )
}
