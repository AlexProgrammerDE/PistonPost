/**
 * Noto fallback fonts for scripts that Outfit does not cover.
 *
 * The CJK files are about 1 MB each, too large to inline into the Worker, so every fallback loads
 * lazily from the published fontsource packages on jsDelivr. Takumi skips a font when the card
 * text has no codepoint in its `ranges`, so a card only fetches the scripts it uses, and the
 * request carries no post content.
 * Takumi caches loaded fonts per isolate and retries a font whose fetch failed.
 */

const FONTSOURCE_CDN = "https://cdn.jsdelivr.net/npm"
const FETCH_ATTEMPTS = 3

type CodepointRange = [number, number]

type FallbackFace = {
  readonly name: string
  readonly file: string
  readonly ranges: CodepointRange[]
  readonly weight?: number
}

const notoSans = (subset: string) =>
  `@fontsource-variable/noto-sans@5.3.0/files/noto-sans-${subset}-wght-normal.woff2`

const fallbackFaces: readonly FallbackFace[] = [
  {
    name: "Noto Sans Cyrillic",
    file: notoSans("cyrillic"),
    ranges: [[0x0400, 0x045f]],
  },
  {
    name: "Noto Sans Cyrillic Extended",
    file: notoSans("cyrillic-ext"),
    ranges: [
      [0x0460, 0x052f],
      [0x1c80, 0x1c8a],
      [0x2de0, 0x2dff],
      [0xa640, 0xa69f],
    ],
  },
  {
    name: "Noto Sans Greek",
    file: notoSans("greek"),
    ranges: [[0x0370, 0x03ff]],
  },
  {
    name: "Noto Sans Greek Extended",
    file: notoSans("greek-ext"),
    ranges: [[0x1f00, 0x1fff]],
  },
  {
    name: "Noto Sans Vietnamese",
    file: notoSans("vietnamese"),
    ranges: [[0x1ea0, 0x1ef9]],
  },
  {
    name: "Noto Sans Devanagari",
    file: notoSans("devanagari"),
    ranges: [
      [0x0900, 0x097f],
      [0xa8e0, 0xa8ff],
    ],
  },
  {
    name: "Noto Sans Arabic",
    file: "@fontsource-variable/noto-sans-arabic@5.3.0/files/noto-sans-arabic-arabic-wght-normal.woff2",
    ranges: [
      [0x0600, 0x06ff],
      [0x0750, 0x077f],
      [0x0870, 0x08ff],
      [0xfb50, 0xfdff],
      [0xfe70, 0xfefc],
    ],
  },
  {
    name: "Noto Sans Hebrew",
    file: "@fontsource-variable/noto-sans-hebrew@5.3.0/files/noto-sans-hebrew-hebrew-wght-normal.woff2",
    ranges: [
      [0x0590, 0x05ff],
      [0xfb1d, 0xfb4f],
    ],
  },
  {
    name: "Noto Sans Thai",
    file: "@fontsource-variable/noto-sans-thai@5.3.0/files/noto-sans-thai-thai-wght-normal.woff2",
    ranges: [[0x0e01, 0x0e5b]],
  },
  // Kana marks Japanese text. Ranking Japanese before Chinese lets that text take its Han glyphs
  // from the Japanese font too, so one card does not mix two CJK designs.
  ...cjkFaces("Noto Sans JP", "@fontsource/noto-sans-jp@5.3.1/files/noto-sans-jp-japanese", [
    [0x3040, 0x30ff],
    [0x31f0, 0x31ff],
    [0xff65, 0xff9f],
  ]),
  ...cjkFaces("Noto Sans KR", "@fontsource/noto-sans-kr@5.3.1/files/noto-sans-kr-korean", [
    [0x1100, 0x11ff],
    [0x3130, 0x318f],
    [0xac00, 0xd7af],
  ]),
  ...cjkFaces(
    "Noto Sans SC",
    "@fontsource/noto-sans-sc@5.3.1/files/noto-sans-sc-chinese-simplified",
    [
      [0x3000, 0x303f],
      [0x3400, 0x4dbf],
      [0x4e00, 0x9fff],
      [0xf900, 0xfaff],
      [0xff01, 0xff60],
    ],
  ),
]

/** fontsource has no variable CJK file, so load the regular and bold weights the card uses. */
function cjkFaces(name: string, path: string, ranges: CodepointRange[]): FallbackFace[] {
  return [400, 700].map((weight) => ({
    name,
    file: `${path}-${weight}-normal.woff2`,
    ranges,
    weight,
  }))
}

/** The CDN can answer 503 while it fills its cache for a file, so retry server errors briefly. */
async function fetchFont(url: string, attempt = 1): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (response.ok) return response.arrayBuffer()
  if (response.status < 500 || attempt >= FETCH_ATTEMPTS) {
    throw new Error(`Font request failed with status ${response.status}.`)
  }
  await response.body?.cancel()
  await new Promise((resolve) => {
    setTimeout(resolve, 200 * attempt)
  })
  return fetchFont(url, attempt + 1)
}

/**
 * Lazy fallback fonts for the Outfit family, tried after the Outfit subsets.
 *
 * @param firstRank the subset rank after the last Outfit subset
 */
export function socialCardFallbackFonts(family: string, firstRank: number) {
  return fallbackFaces.map((face, index) => {
    const url = `${FONTSOURCE_CDN}/${face.file}`
    return {
      name: face.name,
      key: url,
      subsetOf: family,
      subsetRank: firstRank + index,
      ranges: face.ranges,
      weight: face.weight,
      data: () => fetchFont(url),
    }
  })
}
