import { useSession } from "@better-auth-ui/react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound, useHydrated } from "@tanstack/react-router"
import { Schema, SchemaGetter, Effect, SchemaIssue, Option } from "effect"
import { Link2 } from "lucide-react"
import { Suspense, useEffect, useRef } from "react"

import { authClient } from "@/auth/client"
import { DiscussionSkeleton, PostDetailSkeleton } from "@/components/LoadingStates"
import { ModeratedPostTombstone } from "@/components/ModeratedPostTombstone"
import { PostView } from "@/components/post-view"
import { SocialPanel } from "@/components/social-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { PublicPostRead } from "@/db/public-read-model"
import { galleryLayouts } from "@/lib/gallery-layout"
import { postQueryOptions } from "@/lib/queries/posts"
import { discussionQueryOptions } from "@/lib/queries/social"
import { createSeoHead } from "@/lib/seo"
import { getModeratedPost, trackPostViews } from "@/server/posts"

const postSearchSchema = Schema.Struct({
  image: Schema.optional(
    Schema.Unknown.pipe(
      Schema.decodeTo(Schema.Finite, {
        decode: SchemaGetter.transformEffect((value) =>
          Effect.try({
            try: () => Number(value),
            catch: () => new SchemaIssue.InvalidValue({ message: "Invalid number" }),
          }),
        ),
        encode: SchemaGetter.passthrough(),
      }),
    )
      .check(Schema.isInt())
      .check(Schema.isGreaterThanOrEqualTo(0))
      .check(Schema.isLessThanOrEqualTo(149)),
  ).pipe(Schema.catchDecoding(() => Effect.sync(() => Option.some(undefined)))),
  layout: Schema.optional(Schema.Literals(galleryLayouts)).pipe(
    Schema.catchDecoding(() => Effect.sync(() => Option.some(undefined))),
  ),
})

const decodePostIdParam = Schema.decodeUnknownOption(
  Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
)

export const Route = createFileRoute("/post/$postId")({
  validateSearch: Schema.toStandardSchemaV1(postSearchSchema, { parseOptions: { errors: "all" } }),
  loader: async ({ context, params }) => {
    const decodedPostId = decodePostIdParam(params.postId)
    if (Option.isNone(decodedPostId)) throw notFound()
    const postId = decodedPostId.value
    // oxlint-disable-next-line typescript/no-deprecated -- RouterQueryClient overrides ensureQueryData to stop loader retries; query() would skip that policy.
    const post = await context.queryClient.ensureQueryData(postQueryOptions(postId))
    if (post) {
      void context.queryClient.infiniteQuery(discussionQueryOptions(postId)).catch(() => undefined)
      return { kind: "post" as const, post }
    }
    // The tombstone depends on the session, so it stays out of the shared post query cache.
    const tombstone = await getModeratedPost({ data: { id: postId } })
    if (!tombstone) throw notFound()
    return tombstone
  },
  headers: ({ loaderData }) => ({
    "Cache-Control":
      loaderData?.kind === "post" && loaderData.post.visibility === "public"
        ? "no-cache"
        : "private, no-store",
  }),
  // Route heads ship in the client entry. Import the post helper here so its Markdown parser loads
  // with the post page instead of on every route.
  head: async ({ loaderData, match }) =>
    loaderData?.kind === "post"
      ? (await import("@/lib/post-seo")).createPostSeoHead(loaderData.post, match.search.image)
      : createSeoHead({
          title: loaderData ? "Hidden post · PistonPost" : "Post · PistonPost",
          description: "A post on PistonPost.",
          path: match.pathname,
          twitterCard: "summary",
          indexing: "noindex",
        }),
  component: PostDetail,
  pendingComponent: PostDetailSkeleton,
})

// TanStack head() keeps one meta tag per property, so repeated tag properties render here.
// React hoists these meta elements into the document head.
function PostTagMeta({ post }: { readonly post: PublicPostRead }) {
  const property = post.type === "video" ? "video:tag" : "article:tag"
  return post.tags.map((tag) => <meta key={tag.slug} property={property} content={tag.name} />)
}

function PostDetail() {
  const loaderData = Route.useLoaderData()
  if (loaderData.kind === "moderated") {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <ModeratedPostTombstone tombstone={loaderData} />
      </main>
    )
  }
  return <PublishedPostDetail />
}

function PublishedPostDetail() {
  const session = useSession(authClient)
  // The server renders without a session. Wait for hydration before showing author controls, or a
  // session the client already loaded would not match the server HTML.
  const hydrated = useHydrated()
  const viewer = hydrated ? session.data?.user : undefined
  const { postId } = Route.useParams()
  const { image, layout } = Route.useSearch()
  const post = useSuspenseQuery(postQueryOptions(postId)).data
  const queryClient = useQueryClient()
  const trackedPostId = useRef<string | null>(null)
  const visiblePostId = post?.id

  useEffect(() => {
    if (!visiblePostId || trackedPostId.current === visiblePostId) return
    trackedPostId.current = visiblePostId
    void (async () => {
      const { views } = await trackPostViews({
        data: { postIds: [visiblePostId], surface: "detail" },
      })
      const trackedView = views.find((view) => view.postId === visiblePostId)
      if (!trackedView) return
      queryClient.setQueryData(postQueryOptions(visiblePostId).queryKey, (current) =>
        current && current.viewCount < trackedView.viewCount
          ? { ...current, viewCount: trackedView.viewCount }
          : current,
      )
    })().catch(() => undefined)
  }, [queryClient, visiblePostId])

  if (!post) return null

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <PostTagMeta post={post} />
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
      <PostView
        post={post}
        detail
        selectedImageIndex={image}
        galleryLayout={layout}
        canEdit={viewer?.id === post.author.id || viewer?.role === "admin"}
      />
      <Suspense fallback={<DiscussionSkeleton />}>
        <SocialPanel
          postId={post.id}
          heartCount={post.heartCount}
          commentCount={post.commentCount}
          imageCount={post.media.filter((media) => media.kind === "image").length}
        />
      </Suspense>
    </main>
  )
}
