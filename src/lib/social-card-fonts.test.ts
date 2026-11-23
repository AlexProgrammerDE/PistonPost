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
    ["Azərbaycan", ["Noto Sans Latin Extended"]],
    ["ĉiuĵaŭde ŝi manĝas", ["Noto Sans Latin Extended"]],
    ["Bucureşti, Timişoara, Constanţa", ["Noto Sans Latin Extended"]],
    ["Price: ₹500", ["Noto Sans Latin Extended"]],
    ["Issue № 5", ["Noto Sans Cyrillic"]],
    ["Բարեւ աշխարհ", ["Noto Sans Armenian"]],
    ["გამარჯობა", ["Noto Sans Georgian"]],
    ["ᲒᲐᲛᲐᲠᲯᲝᲑᲐ", ["Noto Sans Georgian"]],
    ["নমস্কার", ["Noto Sans Bengali"]],
    ["ਸਤ ਸ੍ਰੀ ਅਕਾਲ", ["Noto Sans Gurmukhi"]],
    ["નમસ્તે", ["Noto Sans Gujarati"]],
    ["வணக்கம்", ["Noto Sans Tamil"]],
    ["నమస్కారం", ["Noto Sans Telugu"]],
    ["ನಮಸ್ಕಾರ", ["Noto Sans Kannada"]],
    ["നമസ്കാരം", ["Noto Sans Malayalam"]],
    ["ආයුබෝවන්", ["Noto Sans Sinhala"]],
    ["ສະບາຍດີ", ["Noto Sans Lao"]],
    ["မင်္ဂလာပါ", ["Noto Sans Myanmar"]],
    ["សួស្តី", ["Noto Sans Khmer"]],
    ["ሰላም ልዑል", ["Noto Sans Ethiopic"]],
    // Bengali shares the Devanagari danda, which the Devanagari file covers.
    ["আমি ভাত খাই।", ["Noto Sans Devanagari", "Noto Sans Bengali"]],
  ])("loads only the matching script fonts for %s", (text, expected) => {
    expect(fontsFor(text)).toEqual(expected)
  })

  test("loads each script file from its own fontsource package", () => {
    const khmer = fonts.find((font) => font.name === "Noto Sans Khmer")
    expect(khmer?.key).toBe(
      "https://cdn.jsdelivr.net/npm/@fontsource-variable/noto-sans-khmer@5.3.0/files/noto-sans-khmer-khmer-wght-normal.woff2",
    )
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
