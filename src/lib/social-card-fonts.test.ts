import { afterEach, describe, expect, spyOn, test } from "bun:test"

import { socialCardFallbackFonts } from "./social-card-fonts"

const fonts = socialCardFallbackFonts("Outfit", 2)

/** The fonts Takumi would load for this text: those with a codepoint inside their ranges. */
function fontsFor(text: string) {
  const codepoints: number[] = []
  for (const character of text) codepoints.push(character.codePointAt(0) ?? 0)
  const names = fonts
    .filter((font) =>
      font.ranges.some(([start, end]) =>
        codepoints.some((codepoint) => codepoint >= start && codepoint <= end),
      ),
    )
    .map((font) => font.name)
  return [...new Set(names)]
}

describe("social card fallback fonts", () => {
  afterEach(() => {
    spyOn(globalThis, "fetch").mockRestore()
  })

  test("loads nothing extra for Latin text that Outfit covers", () => {
    expect(fontsFor("Paweł posted İstanbul café pics")).toEqual([])
  })

  test.each([
    ["Привет, мир", ["Noto Sans Cyrillic"]],
    ["Γειά σου", ["Noto Sans Greek"]],
    ["Xin chào thế giới", ["Noto Sans Vietnamese"]],
    ["नमस्ते", ["Noto Sans Devanagari"]],
    ["مرحبا بالعالم", ["Noto Sans Arabic"]],
    ["שלום", ["Noto Sans Hebrew"]],
    ["สวัสดี", ["Noto Sans Thai"]],
    ["你好，世界", ["Noto Sans SC"]],
    ["こんにちは世界", ["Noto Sans JP", "Noto Sans SC"]],
    ["안녕하세요", ["Noto Sans KR"]],
  ])("loads only the matching script fonts for %s", (text, expected) => {
    expect(fontsFor(text)).toEqual(expected)
  })

  test("ranks every fallback after the Outfit subsets, with Japanese before Chinese", () => {
    const ranks = fonts.map((font) => font.subsetRank)
    expect(Math.min(...ranks)).toBe(2)
    expect(new Set(fonts.map((font) => font.subsetOf))).toEqual(new Set(["Outfit"]))
    const rankOf = (name: string) => fonts.find((font) => font.name === name)?.subsetRank ?? -1
    expect(rankOf("Noto Sans JP")).toBeLessThan(rankOf("Noto Sans SC"))
  })

  test("retries a server error from the CDN before loading the font", async () => {
    const fetchSpy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("warming up", { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
    const greek = fonts.find((font) => font.name === "Noto Sans Greek")
    const data = await greek?.data()
    expect(data?.byteLength).toBe(3)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  test("rejects a failed font download so the next render can retry it", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }))
    const cyrillic = fonts.find((font) => font.name === "Noto Sans Cyrillic")
    if (!cyrillic) throw new Error("The Cyrillic fallback is missing.")
    const failure = await cyrillic.data().then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain("status 404")
  })
})
