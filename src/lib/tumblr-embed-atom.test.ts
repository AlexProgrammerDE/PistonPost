import { afterAll, describe, expect, spyOn, test } from "bun:test"

import * as Effect from "effect/Effect"
import { AtomRegistry } from "effect/reactivity"

import { tumblrEmbedAtom } from "@/lib/tumblr-embed-atom"
import * as externalEmbeds from "@/server/external-embeds"

const getTumblrEmbed = spyOn(externalEmbeds, "getTumblrEmbed")

describe("tumblrEmbedAtom", () => {
  afterAll(() => {
    getTumblrEmbed.mockRestore()
  })

  test("falls back to the unavailable state when the lookup fails", async () => {
    getTumblrEmbed.mockRejectedValue(new Error("Network error"))
    const url = "https://example.tumblr.com/post/1"

    const result = await Effect.runPromise(
      AtomRegistry.getResult(AtomRegistry.make(), tumblrEmbedAtom(url)),
    )

    expect(result).toEqual({ status: "unavailable" })
    expect(getTumblrEmbed).toHaveBeenCalledWith({ data: { url } })
  })
})
