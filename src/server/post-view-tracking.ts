export type TrackablePost = {
  readonly id: string
  readonly type: "text" | "images" | "video"
  readonly visibility: "public" | "unlisted"
}

type PostViewTrackingDependencies = {
  readonly analytics: Pick<AnalyticsEngineDataset, "writeDataPoint">
  readonly findPublishedPost: (postId: string) => Promise<TrackablePost | null>
  readonly limiter: Pick<RateLimit, "limit">
}

type RecordPostViewInput = {
  readonly address: string
  readonly postId: string
}

async function createRateLimitKey(address: string, postId: string) {
  const input = new TextEncoder().encode(`${address}\0${postId}`)
  const digest = await crypto.subtle.digest("SHA-256", input)
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return `post-view:${fingerprint}`
}

export async function recordPostView(
  dependencies: PostViewTrackingDependencies,
  input: RecordPostViewInput,
) {
  try {
    const key = await createRateLimitKey(input.address, input.postId)
    const rateLimit = await dependencies.limiter.limit({ key })
    if (!rateLimit.success) return false

    const post = await dependencies.findPublishedPost(input.postId)
    if (!post) return false

    dependencies.analytics.writeDataPoint({
      indexes: [post.id],
      blobs: ["post.view", post.id, post.type, post.visibility],
      doubles: [1],
    })
    return true
  } catch {
    return false
  }
}
