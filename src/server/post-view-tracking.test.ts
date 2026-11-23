import { describe, expect, it } from "bun:test"

import { Effect } from "effect"

import { recordPostView, type TrackablePost } from "./post-view-tracking"

const post: TrackablePost = {
  id: "post-1",
  type: "images",
  visibility: "public",
}

function setup(
  options: {
    limitedOpens?: boolean
    limitedViews?: boolean
    publishedPost?: TrackablePost | null
  } = {},
) {
  const rateLimitKeys: string[] = []
  const dataPoints: (AnalyticsEngineDataPoint | undefined)[] = []
  const incrementedPostIds: string[] = []
  const lookedUpPostIds: string[] = []

  return {
    dataPoints,
    incrementedPostIds,
    lookedUpPostIds,
    rateLimitKeys,
    dependencies: {
      analytics: {
        writeDataPoint(dataPoint?: AnalyticsEngineDataPoint) {
          dataPoints.push(dataPoint)
        },
      },
      findPublishedPost(postId: string) {
        lookedUpPostIds.push(postId)
        return Promise.resolve(options.publishedPost === undefined ? post : options.publishedPost)
      },
      incrementViewCount(postId: string) {
        incrementedPostIds.push(postId)
        return Promise.resolve(incrementedPostIds.length)
      },
      limiter: {
        limit({ key }: RateLimitOptions) {
          rateLimitKeys.push(key)
          const limited = key.startsWith("post-open:") ? options.limitedOpens : options.limitedViews
          return Promise.resolve({ success: !limited })
        },
      },
    },
  }
}

async function viewKey(address: string) {
  const state = setup()
  await Effect.runPromise(
    recordPostView(state.dependencies, { address, postId: post.id, surface: "timeline" }),
  )
  expect(state.rateLimitKeys).toHaveLength(1)
  const [key] = state.rateLimitKeys
  expect(key).toMatch(/^post-view:[a-f0-9]{64}$/u)
  return key
}

describe("post view tracking", () => {
  it("records a privacy-safe event for a published post", async () => {
    const state = setup()

    const tracked = await Effect.runPromise(
      recordPostView(state.dependencies, {
        address: "203.0.113.42",
        postId: post.id,
        surface: "timeline",
      }),
    )

    expect(tracked).toBe(1)
    expect(state.rateLimitKeys).toHaveLength(1)
    expect(state.rateLimitKeys[0]).toMatch(/^post-view:[a-f0-9]{64}$/u)
    expect(state.rateLimitKeys[0]).not.toContain("203.0.113.42")
    expect(state.dataPoints).toEqual([
      {
        indexes: [post.id],
        blobs: ["post.impression", post.id, post.type, post.visibility, "timeline"],
        doubles: [1],
      },
    ])
    expect(state.incrementedPostIds).toEqual([post.id])
  })

  it("drops limited views before querying the post", async () => {
    const state = setup({ limitedViews: true })

    const tracked = await Effect.runPromise(
      recordPostView(state.dependencies, {
        address: "203.0.113.42",
        postId: post.id,
        surface: "timeline",
      }),
    )

    expect(tracked).toBeNull()
    expect(state.lookedUpPostIds).toEqual([])
    expect(state.dataPoints).toEqual([])
    expect(state.incrementedPostIds).toEqual([])
  })

  it("does not record views for missing or unpublished posts", async () => {
    const state = setup({ publishedPost: null })

    const tracked = await Effect.runPromise(
      recordPostView(state.dependencies, {
        address: "203.0.113.42",
        postId: "draft-post",
        surface: "timeline",
      }),
    )

    expect(tracked).toBeNull()
    expect(state.lookedUpPostIds).toEqual(["draft-post"])
    expect(state.dataPoints).toEqual([])
    expect(state.incrementedPostIds).toEqual([])
  })

  it("keeps a counted view when Analytics Engine is unavailable", async () => {
    const state = setup()
    state.dependencies.analytics.writeDataPoint = () => {
      throw new Error("Analytics unavailable")
    }

    const tracked = await Effect.runPromise(
      recordPostView(state.dependencies, {
        address: "203.0.113.42",
        postId: post.id,
        surface: "timeline",
      }),
    )

    expect(tracked).toBe(1)
    expect(state.incrementedPostIds).toEqual([post.id])
  })

  it("records a separate open event for a detail view", async () => {
    const state = setup()

    const tracked = await Effect.runPromise(
      recordPostView(state.dependencies, {
        address: "203.0.113.42",
        postId: post.id,
        surface: "detail",
      }),
    )

    expect(tracked).toBe(1)
    expect(state.dataPoints).toEqual([
      {
        indexes: [post.id],
        blobs: ["post.impression", post.id, post.type, post.visibility, "detail"],
        doubles: [1],
      },
      {
        indexes: [post.id],
        blobs: ["post.open", post.id, post.type, post.visibility, "detail"],
        doubles: [1],
      },
    ])
  })

  it("records a detail open when the aggregate view is rate limited", async () => {
    const state = setup({ limitedViews: true })

    const tracked = await Effect.runPromise(
      recordPostView(state.dependencies, {
        address: "203.0.113.42",
        postId: post.id,
        surface: "detail",
      }),
    )

    expect(tracked).toBeNull()
    expect(state.rateLimitKeys).toHaveLength(2)
    expect(state.incrementedPostIds).toEqual([])
    expect(state.dataPoints).toEqual([
      {
        indexes: [post.id],
        blobs: ["post.open", post.id, post.type, post.visibility, "detail"],
        doubles: [1],
      },
    ])
  })

  describe("viewer address keys", () => {
    it("keeps distinct IPv4 addresses separate", async () => {
      expect(await viewKey("203.0.113.42")).not.toBe(await viewKey("203.0.113.43"))
    })

    it("shares one limit across addresses in the same IPv6 /64", async () => {
      const first = await viewKey("2001:db8:1234:5678::1")
      expect(await viewKey("2001:db8:1234:5678:abcd:ef01:2345:6789")).toBe(first)
      expect(await viewKey("2001:DB8:1234:5678:ffff::")).toBe(first)
    })

    it("treats compressed and expanded IPv6 forms as the same network", async () => {
      expect(await viewKey("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
        await viewKey("2001:db8::1"),
      )
      expect(await viewKey("2001:db8:0:0:1::")).toBe(await viewKey("2001:db8::1:0:0:0"))
    })

    it("keeps different IPv6 /64 networks separate", async () => {
      expect(await viewKey("2001:db8:1234:5678::1")).not.toBe(
        await viewKey("2001:db8:1234:5679::1"),
      )
    })

    it("keys IPv4-mapped IPv6 addresses as the IPv4 address", async () => {
      const ipv4 = await viewKey("203.0.113.42")
      expect(await viewKey("::ffff:203.0.113.42")).toBe(ipv4)
      expect(await viewKey("::FFFF:cb00:712a")).toBe(ipv4)
      expect(await viewKey("::ffff:203.0.113.43")).not.toBe(ipv4)
    })
  })
})
