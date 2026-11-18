import { describe, expect, test } from "bun:test"

import { threadComments } from "./thread-comments"

type TestComment = { readonly id: string; readonly parentId: string | null }

function ids(comments: readonly TestComment[]) {
  return threadComments(comments).map(({ comment, nested }) =>
    nested ? `  ${comment.id}` : comment.id,
  )
}

describe("threadComments", () => {
  test("places newer replies below their parent, oldest reply first", () => {
    // The discussion API returns comments newest first.
    expect(
      ids([
        { id: "reply-2", parentId: "first" },
        { id: "second", parentId: null },
        { id: "reply-1", parentId: "first" },
        { id: "first", parentId: null },
      ]),
    ).toEqual(["second", "first", "  reply-1", "  reply-2"])
  })

  test("keeps replies to unloaded comments in place without indentation", () => {
    expect(
      ids([
        { id: "orphan", parentId: "older-page" },
        { id: "top", parentId: null },
      ]),
    ).toEqual(["orphan", "top"])
  })
})
