import { describe, expect, it } from "bun:test"

import { render } from "takumi-js"

import { SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_WIDTH } from "@/lib/seo"

import { TextPostSocialCard } from "./TextPostSocialCard"

describe("TextPostSocialCard", () => {
  it("renders a complete PNG with safely bounded user text", async () => {
    const image = await render(
      <TextPostSocialCard
        title={`A <tiny> post ${"a".repeat(100)}`}
        excerpt="This should stay useful without looking like a marketing banner."
        authorName="Alex & friends"
        authorUsername="alex"
        publishedAt={new Date("2026-07-15T12:00:00.000Z")}
      />,
      { width: SOCIAL_IMAGE_WIDTH, height: SOCIAL_IMAGE_HEIGHT },
    )

    expect(image.byteLength).toBeGreaterThan(10_000)
    expect(Array.from(image.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })
})
