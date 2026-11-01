import { describe, expect, test } from "bun:test"

import { ComponentType } from "discord-api-types/v10"

import { createDiscordEmbed, discordEmbedScript, serializeDiscordEmbed } from "./discord-embed"

describe("Discord component embeds", () => {
  test("keeps compact image cards to a small linked heading and media", () => {
    const card = createDiscordEmbed({
      title: "Gallery",
      description: "@alice · Image 1 of 70",
      url: "https://example.com/post/42?image=0",
      images: ["https://example.com/art.jpg"],
      layout: "compact",
    })
    expect(card?.components.map((component) => component.type)).toEqual([
      ComponentType.TextDisplay,
      ComponentType.MediaGallery,
    ])
    const text = card?.components[0]
    expect(text?.type === ComponentType.TextDisplay && text.content).toBe(
      "**[Gallery](https://example.com/post/42?image=0)**\n@alice · Image 1 of 70",
    )
  })

  test("omits repeated text and actions from image-only continuation links", () => {
    const card = createDiscordEmbed({
      title: "Gallery",
      description: "This should not repeat",
      url: "https://example.com/post/42?image=1",
      images: ["https://example.com/second.jpg"],
      links: [{ label: "Author", url: "https://example.com/alice" }],
      layout: "media",
    })
    expect(card?.components).toEqual([
      {
        type: ComponentType.MediaGallery,
        items: [{ media: { url: "https://example.com/second.jpg" } }],
      },
    ])
    expect(
      createDiscordEmbed({ title: "Empty", url: "https://example.com", layout: "media" }),
    ).toBeUndefined()
    expect(
      createDiscordEmbed({
        title: "Invalid",
        url: "https://example.com",
        images: ["javascript:alert(1)"],
        layout: "media",
      }),
    ).toBeUndefined()
  })

  test("renders current page data and link-only actions", () => {
    const scripts = discordEmbedScript({
      title: "A new post",
      description: "By Alice",
      url: "https://example.com/post/42",
      links: [{ label: "Author", url: "https://example.com/user/alice" }],
      images: ["https://example.com/art.png"],
    })
    const payload = JSON.parse(scripts[0]?.children ?? "")
    expect(payload.component.type).toBe(ComponentType.Container)
    expect(payload.component.components[0].content).toContain("A new post")
    expect(payload.component.components[0].content).toContain("By Alice")
    expect(payload.component.components[1].items[0].media.url).toBe("https://example.com/art.png")
    expect(payload.component.components.at(-1).components).toEqual([
      { type: 2, style: 5, label: "View page", url: "https://example.com/post/42" },
      { type: 2, style: 5, label: "Author", url: "https://example.com/user/alice" },
    ])
  })

  test("escapes script terminators without changing the JSON data", () => {
    const [script] = discordEmbedScript({
      title: "</script><script>alert(1)</script>",
      url: "https://example.com",
    })
    expect(script?.children ?? "").not.toContain("<")
    expect(JSON.parse(script?.children ?? "").component.components[0].content).toContain("script")
  })

  test("keeps Unicode and long media URLs within the serialized byte limit", () => {
    const card = createDiscordEmbed({
      title: "🌍".repeat(200),
      description: "🌍</script>".repeat(1000),
      url: "https://example.com",
      images: Array.from(
        { length: 20 },
        (_, index) => `https://example.com/${index}/${"x".repeat(1900)}.png`,
      ),
      links: Array.from({ length: 5 }, (_, index) => ({
        label: "🌍".repeat(80),
        url: `https://example.com/${index}/${"x".repeat(450)}`,
      })),
    })
    expect(card).toBeDefined()
    if (!card) throw new Error("Expected a component embed")
    expect(new TextEncoder().encode(serializeDiscordEmbed(card)).byteLength).toBeLessThanOrEqual(
      3000,
    )
    const gallery = card.components.find(
      (component) => component.type === ComponentType.MediaGallery,
    )
    if (gallery?.type === ComponentType.MediaGallery)
      expect(gallery.items.length).toBeLessThanOrEqual(4)
  })

  test("rejects unsafe URLs and omits invalid media and buttons", () => {
    expect(discordEmbedScript({ title: "Private", url: "javascript:alert(1)" })).toEqual([])
    expect(
      discordEmbedScript({ title: "Private", url: "https://user:password@example.com" }),
    ).toEqual([])
    const [script] = discordEmbedScript({
      title: "Safe",
      url: "https://example.com",
      images: ["file:///tmp/image.png"],
      links: [{ label: "Bad", url: "javascript:alert(1)" }],
    })
    expect(JSON.parse(script?.children ?? "").component.components).toHaveLength(2)
  })
})
