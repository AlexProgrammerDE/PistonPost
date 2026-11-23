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
  // Outfit's Latin Extended file lacks many letters its subset name suggests, such as Azerbaijani
  // ə, Esperanto ĉ ĝ ĥ ĵ ŝ ŭ, Romanian ţ and the rupee sign. These ranges are exactly the codepoints
  // of the Noto Sans Latin Extended file that both Outfit files miss.
  {
    name: "Noto Sans Latin Extended",
    file: notoSans("latin-ext"),
    ranges: [
      [0x01_08, 0x01_09],
      [0x01_14, 0x01_15],
      [0x01_1c, 0x01_1d],
      [0x01_24, 0x01_25],
      [0x01_28, 0x01_29],
      [0x01_2c, 0x01_2d],
      [0x01_34, 0x01_35],
      [0x01_38, 0x01_38],
      [0x01_3f, 0x01_40],
      [0x01_49, 0x01_49],
      [0x01_4e, 0x01_4f],
      [0x01_5c, 0x01_5d],
      [0x01_62, 0x01_63],
      [0x01_66, 0x01_69],
      [0x01_7f, 0x01_cc],
      [0x01_cf, 0x02_17],
      [0x02_1c, 0x02_36],
      [0x02_38, 0x02_ba],
      [0x02_bd, 0x02_c5],
      [0x02_c8, 0x02_cc],
      [0x02_ce, 0x02_d7],
      [0x02_de, 0x02_ff],
      [0x03_09, 0x03_09],
      [0x03_23, 0x03_23],
      [0x03_29, 0x03_29],
      [0x1d_00, 0x1d_bf],
      [0x1e_00, 0x1e_7f],
      [0x1e_86, 0x1e_9d],
      [0x1e_9f, 0x1e_9f],
      [0x1e_f4, 0x1e_ff],
      [0x20_20, 0x20_20],
      [0x20_a0, 0x20_ab],
      [0x20_ad, 0x20_c0],
      [0x21_13, 0x21_13],
      [0x2c_60, 0x2c_7f],
      [0xa7_20, 0xa7_ca],
      [0xa7_d0, 0xa7_d1],
      [0xa7_d3, 0xa7_d3],
      [0xa7_d5, 0xa7_d9],
      [0xa7_f2, 0xa7_ff],
    ],
  },
  {
    name: "Noto Sans Cyrillic",
    file: notoSans("cyrillic"),
    // Noto Sans ships the numero sign with its Cyrillic subset.
    ranges: [
      [0x04_00, 0x04_5f],
      [0x21_16, 0x21_16],
    ],
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
