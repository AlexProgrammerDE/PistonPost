const graphemeSegmenter = new Intl.Segmenter("en-US", { granularity: "grapheme" })

const letterOrNumber = /^[\p{L}\p{N}]/u
const casedLetter = /^[\p{Lu}\p{Ll}\p{Lt}]/u

function firstLetterOrNumber(word: string) {
  for (const { segment } of graphemeSegmenter.segment(word)) {
    if (letterOrNumber.test(segment)) return segment
  }
  return null
}

/**
 * Returns avatar fallback initials for a display name: the first letters of the first and last
 * words, such as "AM" for "Alice Moss" and "A" for "alice". Words without a letter or number, such
 * as a leading emoji, are skipped. Scripts without letter case, such as CJK, keep one character,
 * because two-character initials are not a convention there. A name with no letters falls back to
 * its first character, so an emoji-only name still shows that emoji. Splitting by grapheme keeps
 * emoji and combined characters whole, so the server and browser render the same text.
 */
export function avatarInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/u)
    .map((word) => firstLetterOrNumber(word))
    .filter((initial) => initial !== null)

  const first = initials[0]
  if (first === undefined) {
    for (const { segment } of graphemeSegmenter.segment(name.trim())) return segment
    return ""
  }
  const last = initials.length > 1 ? initials.at(-1) : undefined
  const pair =
    last !== undefined && casedLetter.test(first) && casedLetter.test(last) ? first + last : first
  return pair.toLocaleUpperCase("en-US")
}
