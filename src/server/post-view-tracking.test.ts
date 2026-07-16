import { describe, expect, it } from "bun:test"

import { recordPostView, type TrackablePost } from "./post-view-tracking"

const post: TrackablePost = {
  id: "post-1",
  type: "images",
  visibility: "public",
}

function setup(options: { limited?: boolean; publishedPost?: TrackablePost | null } = {}) {
  const rateLimitKeys: Array<string> = []
  const dataPoints: Array<AnalyticsEngineDataPoint | undefined> = []
  const incrementedPostIds: Array<string> = []
  const lookedUpPostIds: Array<string> = []

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
      async findPublishedPost(postId: string) {
        lookedUpPostIds.push(postId)
        return options.publishedPost === undefined ? post : options.publishedPost
      },
      async incrementViewCount(postId: string) {
        incrementedPostIds.push(postId)
        return incrementedPostIds.length
      },
      limiter: {
        async limit({ key }: RateLimitOptions) {
          rateLimitKeys.push(key)
          return { success: !options.limited }
        },
      },
    },
  }
}

describe("post view tracking", () => {
  it("records a privacy-safe event for a published post", async () => {
    const state = setup()

    const tracked = await recordPostView(state.dependencies, {
      address: "203.0.113.42",
      postId: post.id,
    })

    expect(tracked).toBe(1)
    expect(state.rateLimitKeys).toHaveLength(1)
    expect(state.rateLimitKeys[0]).toMatch(/^post-view:[a-f0-9]{64}$/)
    expect(state.rateLimitKeys[0]).not.toContain("203.0.113.42")
    expect(state.dataPoints).toEqual([
      {
        indexes: [post.id],
        blobs: ["post.view", post.id, post.type, post.visibility],
        doubles: [1],
      },
    ])
    expect(state.incrementedPostIds).toEqual([post.id])
  })

  it("drops limited views before querying the post", async () => {
    const state = setup({ limited: true })

    const tracked = await recordPostView(state.dependencies, {
      address: "203.0.113.42",
      postId: post.id,
    })

    expect(tracked).toBeNull()
    expect(state.lookedUpPostIds).toEqual([])
    expect(state.dataPoints).toEqual([])
    expect(state.incrementedPostIds).toEqual([])
  })

  it("does not record views for missing or unpublished posts", async () => {
    const state = setup({ publishedPost: null })

    const tracked = await recordPostView(state.dependencies, {
      address: "203.0.113.42",
      postId: "draft-post",
    })

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

    const tracked = await recordPostView(state.dependencies, {
      address: "203.0.113.42",
      postId: post.id,
    })

    expect(tracked).toBe(1)
    expect(state.incrementedPostIds).toEqual([post.id])
  })
})
