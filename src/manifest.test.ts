import { describe, expect, it } from "bun:test"

import manifest from "../public/manifest.json"

describe("web manifest", () => {
  it("uses the PistonPost product identity", () => {
    expect(manifest.name).toBe("PistonPost")
    expect(manifest.short_name).toBe("PistonPost")
    expect(manifest.description).toBe(
      "Posts, pictures, videos, and whatever else is worth passing around.",
    )
    expect(manifest.lang).toBe("en")
    expect(manifest.dir).toBe("ltr")
    expect(manifest.categories).toEqual(["social", "entertainment"])
  })

  it("keeps its installed identity and navigation rooted at the site", () => {
    expect(manifest.id).toBe("/")
    expect(manifest.start_url).toBe("/")
    expect(manifest.scope).toBe("/")
    expect(manifest.display).toBe("standalone")
    expect(manifest.theme_color).toBe(manifest.background_color)
  })

  it("provides separate regular and maskable icon artwork", () => {
    expect(manifest.icons).toEqual([
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ])
  })

  it("links its composer shortcut to the existing post route", () => {
    expect(manifest.shortcuts).toEqual([
      {
        name: "New post",
        short_name: "New post",
        description: "Make a new post.",
        url: "/posts/new",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ])
  })
})
