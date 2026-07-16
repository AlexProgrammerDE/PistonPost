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
  const lookedUpPostIds: Array<string> = []

  return {
    dataPoints,
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

    expect(tracked).toBe(true)
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
  })

  it("drops limited views before querying the post", async () => {
    const state = setup({ limited: true })

    const tracked = await recordPostView(state.dependencies, {
      address: "203.0.113.42",
      postId: post.id,
    })

    expect(tracked).toBe(false)
    expect(state.lookedUpPostIds).toEqual([])
    expect(state.dataPoints).toEqual([])
  })

  it("does not record views for missing or unpublished posts", async () => {
    const state = setup({ publishedPost: null })

    const tracked = await recordPostView(state.dependencies, {
      address: "203.0.113.42",
      postId: "draft-post",
    })

    expect(tracked).toBe(false)
    expect(state.lookedUpPostIds).toEqual(["draft-post"])
    expect(state.dataPoints).toEqual([])
  })
})
