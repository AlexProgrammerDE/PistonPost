import { Effect, Schema } from "effect"

import type { PostViewSurface } from "@/domain/post-view"

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

class PostViewTrackingError extends Schema.TaggedError<
  PostViewTrackingError,
  { readonly brand: unique symbol }
>()("PostViewTrackingError", {
  operation: Schema.Literals(["fingerprint", "rate-limit", "find-post", "increment", "analytics"]),
  cause: Schema.Defect(),
}) {}

function trackingError(operation: PostViewTrackingError["operation"], cause: unknown) {
  return PostViewTrackingError.make({ operation, cause })
}

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/u
const HEXTET_PATTERN = /^[\da-f]{1,4}$/u

function parseIpv4(address: string) {
  if (!IPV4_PATTERN.test(address)) return null
  const octets = address.split(".").map(Number)
  return octets.every((octet) => octet <= 255) ? octets : null
}

function splitHextets(part: string) {
  return part === "" ? [] : part.split(":")
}

function expandIpv6(address: string) {
  const [head = "", tail, ...rest] = address.toLowerCase().split("::")
  if (rest.length > 0) return null
  const headParts = splitHextets(head)
  const tailParts = tail === undefined ? [] : splitHextets(tail)
  const parts = [...headParts, ...tailParts]

  const last = parts.at(-1)
  const embeddedIpv4 = last?.includes(".") ? parseIpv4(last) : null
  if (last?.includes(".") && !embeddedIpv4) return null
  const hextets = embeddedIpv4 ? parts.slice(0, -1) : parts
  if (!hextets.every((part) => HEXTET_PATTERN.test(part))) return null

  const values = hextets.map((part) => Number.parseInt(part, 16))
  if (embeddedIpv4) {
    const [a = 0, b = 0, c = 0, d = 0] = embeddedIpv4
    values.push(a * 256 + b, c * 256 + d)
  }
  if (tail === undefined) return values.length === 8 ? values : null
  const missing = 8 - values.length
  if (missing < 1) return null
  const headCount = headParts.length
  return [
    ...values.slice(0, headCount),
    ...Array.from({ length: missing }, () => 0),
    ...values.slice(headCount),
  ]
}

/**
 * One subscriber usually controls a whole IPv6 /64, so per-address limits
 * would let a client rotate addresses to inflate view counts. IPv4 keeps the
 * full address, and IPv4-mapped IPv6 collapses to the IPv4 address it carries.
 */
function viewerNetworkKey(address: string) {
  if (parseIpv4(address)) return address
  const hextets = address.includes(":") ? expandIpv6(address.split("%", 1)[0] ?? "") : null
  if (!hextets) return address

  const isIpv4Mapped = hextets.slice(0, 5).every((value) => value === 0) && hextets[5] === 0xff_ff
  if (isIpv4Mapped) {
    const [high = 0, low = 0] = hextets.slice(6)
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".")
  }

  return `${hextets
    .slice(0, 4)
    .map((value) => value.toString(16))
    .join(":")}::/64`
}

async function createRateLimitKey(kind: "open" | "view", address: string, postId: string) {
  const network = viewerNetworkKey(address)
  const input = new TextEncoder().encode(`${kind}\0${network}\0${postId}`)
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
    try: () => {
      dependencies.analytics.writeDataPoint({
        indexes: [post.id],
        blobs: [event, post.id, post.type, post.visibility, surface],
        doubles: [1],
      })
    },
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
        }).pipe(Effect.orElseSucceed(() => null))
      : null
    if (viewCount !== null) {
      yield* writeAnalyticsEvent(dependencies, post, "post.impression", input.surface)
    }
    if (openRateLimit?.success) {
      yield* writeAnalyticsEvent(dependencies, post, "post.open", input.surface)
    }

    return viewCount
  },
  Effect.catchCause(() => Effect.succeed(null)),
)
