import { Effect, Schema } from "effect"

import type { PostViewSurface } from "@/domain"

export type TrackablePost = {
  readonly id: string
  readonly type: "text" | "images" | "video"
  readonly visibility: "public" | "unlisted"
}

type PostViewTrackingDependencies = {
  readonly analytics: Pick<AnalyticsEngineDataset, "writeDataPoint">
  readonly findPublishedPost: (postId: string) => Promise<TrackablePost | null>
  readonly incrementViewCount: (postId: string) => Promise<number | null>
  readonly limiter: Pick<RateLimit, "limit">
}

type RecordPostViewInput = {
  readonly address: string
  readonly postId: string
  readonly surface: PostViewSurface
}

class PostViewTrackingError extends Schema.TaggedError<PostViewTrackingError>()(
  "PostViewTrackingError",
  {
    operation: Schema.Literal("fingerprint", "rate-limit", "find-post", "increment", "analytics"),
    cause: Schema.Defect,
  },
) {}

function trackingError(operation: PostViewTrackingError["operation"], cause: unknown) {
  return new PostViewTrackingError({ operation, cause })
}

async function createRateLimitKey(kind: "open" | "view", address: string, postId: string) {
  const input = new TextEncoder().encode(`${kind}\0${address}\0${postId}`)
  const digest = await crypto.subtle.digest("SHA-256", input)
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return `post-${kind}:${fingerprint}`
}

function writeAnalyticsEvent(
  dependencies: PostViewTrackingDependencies,
  post: TrackablePost,
  event: "post.impression" | "post.open",
  surface: PostViewSurface,
) {
  return Effect.try({
    try: () =>
      dependencies.analytics.writeDataPoint({
        indexes: [post.id],
        blobs: [event, post.id, post.type, post.visibility, surface],
        doubles: [1],
      }),
    catch: (cause) => trackingError("analytics", cause),
  }).pipe(Effect.ignore)
}

export const recordPostView = Effect.fn("PostView.record")(
  function* (dependencies: PostViewTrackingDependencies, input: RecordPostViewInput) {
    const viewKey = yield* Effect.tryPromise({
      try: () => createRateLimitKey("view", input.address, input.postId),
      catch: (cause) => trackingError("fingerprint", cause),
    })
    const viewRateLimit = yield* Effect.tryPromise({
      try: () => dependencies.limiter.limit({ key: viewKey }),
      catch: (cause) => trackingError("rate-limit", cause),
    })
    const openRateLimit =
      input.surface === "detail"
        ? yield* Effect.tryPromise({
            try: async () => {
              const key = await createRateLimitKey("open", input.address, input.postId)
              return dependencies.limiter.limit({ key })
            },
            catch: (cause) => trackingError("rate-limit", cause),
          })
        : null
    if (!viewRateLimit.success && !openRateLimit?.success) return null

    const post = yield* Effect.tryPromise({
      try: () => dependencies.findPublishedPost(input.postId),
      catch: (cause) => trackingError("find-post", cause),
    })
    if (!post) return null

    const viewCount = viewRateLimit.success
      ? yield* Effect.tryPromise({
          try: () => dependencies.incrementViewCount(post.id),
          catch: (cause) => trackingError("increment", cause),
        }).pipe(Effect.catchAll(() => Effect.succeed(null)))
      : null
    if (viewCount !== null) {
      yield* writeAnalyticsEvent(dependencies, post, "post.impression", input.surface)
    }
    if (openRateLimit?.success) {
      yield* writeAnalyticsEvent(dependencies, post, "post.open", input.surface)
    }

    return viewCount
  },
  Effect.catchAllCause(() => Effect.succeed(null)),
)
