import { describe, expect, test } from "bun:test"

import { adminRowsKeys } from "./admin"
import { followKeys } from "./follows"
import { discussionKeys } from "./social"

describe("server-state query keys", () => {
  test("keeps public discussion data separate from each viewer", () => {
    expect(discussionKeys.public("post-one")).toEqual(["discussion", "public", "post-one"])
    expect(discussionKeys.viewer("post-one", "user-one")).toEqual([
      "discussion",
      "viewer",
      "post-one",
      "user-one",
    ])
    expect(discussionKeys.viewer("post-one", "user-one")).not.toEqual(
      discussionKeys.viewer("post-one", "user-two"),
    )
    expect(discussionKeys.feedViewerBatch("user-one", ["post-one", "post-two"])).toEqual([
      "discussion",
      "feed-viewer",
      "user-one",
      ["post-one", "post-two"],
    ])
    expect(discussionKeys.feedViewerBatch("user-one", ["post-one"])).not.toEqual(
      discussionKeys.feedViewerBatch("user-two", ["post-one"]),
    )
  })

  test("includes every server-side administration filter", () => {
    const input = {
      section: "posts" as const,
      query: "gallery",
      cursor: "next-page",
      direction: "desc" as const,
    }

    expect(adminRowsKeys.list(input)).toEqual(["admin", "rows", input])
    expect(adminRowsKeys.list({ ...input, query: "video" })).not.toEqual(adminRowsKeys.list(input))
  })

  test("keeps follow state separate for each viewer and target", () => {
    const target = { kind: "user" as const, username: "author" }

    expect(followKeys.state("viewer-one", target)).toEqual([
      "follows",
      "state",
      "viewer-one",
      target,
    ])
    expect(followKeys.state("viewer-one", target)).not.toEqual(
      followKeys.state("viewer-two", target),
    )
    expect(followKeys.state("viewer-one", target)).not.toEqual(
      followKeys.state("viewer-one", { kind: "tag", tag: "art" }),
    )
  })
})
