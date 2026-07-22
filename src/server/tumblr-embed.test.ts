import { describe, expect, mock, test } from "bun:test"

import { Effect, Exit } from "effect"

import { resolveTumblrEmbedHref } from "./tumblr-embed"

const sourceUrl =
  "https://staff.tumblr.com/post/699744158019190784/this-is-not-a-drill-our-new-user-guidelines"
const embedHref =
  "https://embed.tumblr.com/embed/post/t:0aY0xL2Fi1OFJg4YxpmegQ/699744158019190784/v2"

function oEmbedResponse(html: string, status = 200) {
  return new Response(JSON.stringify({ html }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("Tumblr embed resolver", () => {
  test("returns only the validated Tumblr embed href", async () => {
    const request = mock((_input: URL | RequestInfo, _init?: RequestInit) =>
      Promise.resolve(
        oEmbedResponse(
          `<div class="tumblr-post" data-href="${embedHref}"><a href="${sourceUrl}">Post</a></div><script src="https://assets.tumblr.com/post.js"></script>`,
        ),
      ),
    )

    expect(
      await Effect.runPromise(resolveTumblrEmbedHref({ url: sourceUrl, fetch: request })),
    ).toBe(embedHref)
    expect(request).toHaveBeenCalledTimes(1)
    const [input, init] = request.mock.calls[0] ?? []
    const requestedUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url
    expect(requestedUrl).toContain("https://www.tumblr.com/oembed/1.0?url=")
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json")
  })

  test("rejects mismatched posts and untrusted embed hosts", async () => {
    const responses = [
      oEmbedResponse(
        '<div data-href="https://embed.tumblr.com/embed/post/t:safe/123456789/v2"></div>',
      ),
      oEmbedResponse(
        '<div data-href="https://embed.tumblr.com.example/embed/post/t:safe/699744158019190784/v2"></div>',
      ),
    ]

    const exits = await Promise.all(
      responses.map((response) =>
        Effect.runPromiseExit(
          resolveTumblrEmbedHref({ url: sourceUrl, fetch: () => Promise.resolve(response) }),
        ),
      ),
    )
    for (const exit of exits) expect(Exit.isFailure(exit)).toBeTrue()
  })

  test("wraps invalid inputs and provider failures", async () => {
    const exits = await Promise.all([
      Effect.runPromiseExit(
        resolveTumblrEmbedHref({ url: "https://example.com/post/1", fetch: globalThis.fetch }),
      ),
      Effect.runPromiseExit(
        resolveTumblrEmbedHref({ url: sourceUrl, fetch: () => Promise.reject(new Error("nope")) }),
      ),
      Effect.runPromiseExit(
        resolveTumblrEmbedHref({
          url: sourceUrl,
          fetch: () => Promise.resolve(new Response("unavailable", { status: 503 })),
        }),
      ),
    ])

    for (const exit of exits) expect(Exit.isFailure(exit)).toBeTrue()
  })
})
