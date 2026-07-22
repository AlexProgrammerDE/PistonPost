import { describe, expect, it } from "bun:test"

import { permanentRedirect } from "./permanent-redirects"

describe("permanentRedirect", () => {
  it.each([
    ["/account/post", "/account/posts/new"],
    ["/tos", "/terms"],
  ])("redirects %s to its canonical path", (source, destination) => {
    const response = permanentRedirect(
      new Request(`https://post.pistonmaster.net${source}?from=bookmark`),
    )

    expect(response?.status).toBe(308)
    expect(response?.headers.get("Location")).toBe(
      `https://post.pistonmaster.net${destination}?from=bookmark`,
    )
  })

  it("does not redirect mutations or canonical paths", () => {
    expect(
      permanentRedirect(
        new Request("https://post.pistonmaster.net/account/post", { method: "POST" }),
      ),
    ).toBeNull()
    expect(
      permanentRedirect(new Request("https://post.pistonmaster.net/account/posts/new")),
    ).toBeNull()
  })
})
