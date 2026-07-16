import { describe, expect, test } from "bun:test"

import { adminRowsKeys } from "./admin"
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
})
