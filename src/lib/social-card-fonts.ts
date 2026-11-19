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
    ranges: [[0x04_00, 0x04_5f]],
  },
  {
    name: "Noto Sans Cyrillic Extended",
    file: notoSans("cyrillic-ext"),
    ranges: [
      [0x04_60, 0x05_2f],
      [0x1c_80, 0x1c_8a],
      [0x2d_e0, 0x2d_ff],
      [0xa6_40, 0xa6_9f],
    ],
  },
  {
    name: "Noto Sans Greek",
    file: notoSans("greek"),
    ranges: [[0x03_70, 0x03_ff]],
  },
  {
    name: "Noto Sans Greek Extended",
    file: notoSans("greek-ext"),
    ranges: [[0x1f_00, 0x1f_ff]],
  },
  {
    name: "Noto Sans Vietnamese",
    file: notoSans("vietnamese"),
    ranges: [[0x1e_a0, 0x1e_f9]],
  },
  {
    name: "Noto Sans Devanagari",
    file: notoSans("devanagari"),
    ranges: [
      [0x09_00, 0x09_7f],
      [0xa8_e0, 0xa8_ff],
    ],
  },
  {
    name: "Noto Sans Arabic",
    file: "@fontsource-variable/noto-sans-arabic@5.3.0/files/noto-sans-arabic-arabic-wght-normal.woff2",
    ranges: [
      [0x06_00, 0x06_ff],
      [0x07_50, 0x07_7f],
      [0x08_70, 0x08_ff],
      [0xfb_50, 0xfd_ff],
      [0xfe_70, 0xfe_fc],
    ],
  },
  {
    name: "Noto Sans Hebrew",
    file: "@fontsource-variable/noto-sans-hebrew@5.3.0/files/noto-sans-hebrew-hebrew-wght-normal.woff2",
    ranges: [
      [0x05_90, 0x05_ff],
      [0xfb_1d, 0xfb_4f],
    ],
  },
  {
    name: "Noto Sans Thai",
    file: "@fontsource-variable/noto-sans-thai@5.3.0/files/noto-sans-thai-thai-wght-normal.woff2",
    ranges: [[0x0e_01, 0x0e_5b]],
  },
  // Kana marks Japanese text. Ranking Japanese before Chinese lets that text take its Han glyphs
  // from the Japanese font too, so one card does not mix two CJK designs.
  ...cjkFaces("Noto Sans JP", "@fontsource/noto-sans-jp@5.3.1/files/noto-sans-jp-japanese", [
    [0x30_40, 0x30_ff],
    [0x31_f0, 0x31_ff],
    [0xff_65, 0xff_9f],
  ]),
  ...cjkFaces("Noto Sans KR", "@fontsource/noto-sans-kr@5.3.1/files/noto-sans-kr-korean", [
    [0x11_00, 0x11_ff],
    [0x31_30, 0x31_8f],
    [0xac_00, 0xd7_af],
  ]),
  ...cjkFaces(
    "Noto Sans SC",
    "@fontsource/noto-sans-sc@5.3.1/files/noto-sans-sc-chinese-simplified",
    [
      [0x30_00, 0x30_3f],
      [0x34_00, 0x4d_bf],
      [0x4e_00, 0x9f_ff],
      [0xf9_00, 0xfa_ff],
      [0xff_01, 0xff_60],
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
