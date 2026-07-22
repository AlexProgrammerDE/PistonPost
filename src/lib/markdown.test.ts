import { describe, expect, test } from "bun:test"

import {
  commentMarkdownToPlainText,
  externalImageProxyUrl,
  isProxyableExternalImageUrl,
  markdownContainsImageUrl,
  postMarkdownToPlainText,
} from "./markdown"
import { parseMarkdownEmbed } from "./markdown-embeds"

describe("Markdown boundaries", () => {
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

  test("uses a stable versioned cache key for external images", () => {
    expect(externalImageProxyUrl("post one", "https://cdn.example.com/image.png?size=large")).toBe(
      "/media/external-image/post%20one?v=1&source=https%3A%2F%2Fcdn.example.com%2Fimage.png%3Fsize%3Dlarge",
    )
  })

  test("matches authorized Markdown images exactly", () => {
    const source = "https://cdn.example.com/image.png?size=large"
    expect(markdownContainsImageUrl(`![A picture](${source})`, source)).toBe(true)
    expect(markdownContainsImageUrl(`![A picture](<${source}> "Caption")`, source)).toBe(true)
    expect(markdownContainsImageUrl(`![A picture][photo]\n\n[photo]: ${source}`, source)).toBe(true)
    expect(markdownContainsImageUrl(`[Not an image](${source})`, source)).toBe(false)
    expect(markdownContainsImageUrl(`![Another image](${source}-different)`, source)).toBe(false)
  })

  test("derives readable plain text for metadata", () => {
    expect(
      postMarkdownToPlainText(
        "## Release notes\n\n- [x] **Safe Markdown**\n- [ ] [Embeds](https://example.com)",
      ),
    ).toBe("Release notes Safe Markdown Embeds")
  })

  test("uses directive labels and destinations in post metadata", () => {
    expect(
      postMarkdownToPlainText(
        '::embed[Demo video]{url="https://youtu.be/M7lc1UVf-VE"}\n\n::card{url="https://example.com"}',
      ),
    ).toBe("Demo video https://example.com/")
  })

  test("keeps directive syntax literal in comments", () => {
    expect(commentMarkdownToPlainText('Try ::card{url="https://example.com"}')).toBe(
      'Try ::card{url="https://example.com"}',
    )
  })
})
