import { Badge } from "@pistonpost/ui/components/badge"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { PostView } from "@/components/post-view"
import { SocialPanel } from "@/components/social-panel"
import { postQueryOptions } from "@/lib/queries/posts"

export const Route = createFileRoute("/post/$postId")({
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
  head: ({ loaderData, params }) => ({
    meta: [
      { title: loaderData ? `${loaderData.title} · PistonPost` : "Post · PistonPost" },
      {
        name: "description",
        content: loaderData?.textContent?.slice(0, 155) ?? "A PistonPost transmission.",
      },
      { property: "og:title", content: loaderData?.title ?? "PistonPost" },
      { property: "og:type", content: "article" },
      ...(loaderData?.visibility === "unlisted"
        ? [{ name: "robots", content: "noindex, nofollow" }]
        : []),
    ],
    links: [{ rel: "canonical", href: `/post/${params.postId}` }],
  }),
  component: PostDetail,
})

function PostDetail() {
  const { postId } = Route.useParams()
  const post = useSuspenseQuery(postQueryOptions(postId)).data
  if (!post) return null

  return (
    <main className="mx-auto w-full max-w-[94rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      {post.visibility === "unlisted" && (
        <div className="mx-auto mb-8 flex max-w-5xl items-center gap-3 border-y bg-muted/30 px-3 py-3 text-sm">
          <Badge variant="outline">Unlisted</Badge>
          <p>
            Anyone with this link can view this post. It is not private and does not appear in
            public feeds.
          </p>
        </div>
      )}
      <PostView post={post} detail />
      <SocialPanel postId={post.id} counts={post.reactions} />
    </main>
  )
}
