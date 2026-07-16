import { describe, expect, test } from "bun:test"

import {
  isExternalMarkdownUrl,
  isProxyableExternalImageUrl,
  markdownContainsImageUrl,
  markdownToPlainText,
  parseMarkdownEmbed,
  safeMarkdownUrl,
} from "./markdown"

describe("Markdown boundaries", () => {
  test("keeps safe destinations and drops executable URL schemes", () => {
    expect(safeMarkdownUrl("/post/example")).toBe("/post/example")
    expect(safeMarkdownUrl("https://example.com/page")).toBe("https://example.com/page")
    expect(safeMarkdownUrl("mailto:hello@example.com")).toBe("mailto:hello@example.com")
    expect(safeMarkdownUrl("javascript:alert(1)")).toBe("")
    expect(safeMarkdownUrl("data:text/html,unsafe")).toBe("")

    expect(isExternalMarkdownUrl("/post/example")).toBe(false)
    expect(isExternalMarkdownUrl("https://example.com/page")).toBe(true)
  })

  test("recognizes only strict YouTube and Spotify embed destinations", () => {
    expect(parseMarkdownEmbed("https://youtu.be/M7lc1UVf-VE?t=30")).toMatchObject({
      provider: "youtube",
      videoId: "M7lc1UVf-VE",
    })
    expect(parseMarkdownEmbed("https://www.youtube.com/watch?v=M7lc1UVf-VE")).toMatchObject({
      provider: "youtube",
      videoId: "M7lc1UVf-VE",
    })
    expect(
      parseMarkdownEmbed("https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"),
    ).toMatchObject({
      provider: "spotify",
      entityType: "track",
      entityId: "4iV5W9uYEdYUVa79Axb7Rh",
    })

    expect(parseMarkdownEmbed("http://youtu.be/M7lc1UVf-VE")).toBeNull()
    expect(parseMarkdownEmbed("https://youtube.com.example/shorts/M7lc1UVf-VE")).toBeNull()
    expect(
      parseMarkdownEmbed("https://open.spotify.com.example/track/4iV5W9uYEdYUVa79Axb7Rh"),
    ).toBeNull()
  })

  test("allows image proxying only from public HTTPS hostnames", () => {
    expect(isProxyableExternalImageUrl("https://cdn.example.com/image.png")).toBe(true)
    expect(isProxyableExternalImageUrl("http://cdn.example.com/image.png")).toBe(false)
    expect(isProxyableExternalImageUrl("https://localhost/image.png")).toBe(false)
    expect(isProxyableExternalImageUrl("https://localhost./image.png")).toBe(false)
    expect(isProxyableExternalImageUrl("https://internal/image.png")).toBe(false)
    expect(isProxyableExternalImageUrl("https://127.0.0.1/image.png")).toBe(false)
    expect(isProxyableExternalImageUrl("https://[::1]/image.png")).toBe(false)
    expect(isProxyableExternalImageUrl("https://user@example.com/image.png")).toBe(false)
    expect(isProxyableExternalImageUrl("https://cdn.example.com:8443/image.png")).toBe(false)
  })

  test("matches authorized Markdown images exactly", () => {
    const source = "https://cdn.example.com/image.png?size=large"
    expect(markdownContainsImageUrl(`![A picture](${source})`, source)).toBe(true)
    expect(markdownContainsImageUrl(`![A picture](<${source}> "Caption")`, source)).toBe(true)
    expect(markdownContainsImageUrl(`[Not an image](${source})`, source)).toBe(false)
    expect(markdownContainsImageUrl(`![Another image](${source}-different)`, source)).toBe(false)
  })

  test("derives readable plain text for metadata", () => {
    expect(
      markdownToPlainText(
        "## Release notes\n\n- [x] **Safe Markdown**\n- [ ] [Embeds](https://example.com)",
      ),
    ).toBe("Release notes Safe Markdown Embeds")
  })
})
