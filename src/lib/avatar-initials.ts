const graphemeSegmenter = new Intl.Segmenter("en-US", { granularity: "grapheme" })

/**
 * Returns the first two user-perceived characters of a name for an avatar fallback. Splitting by
 * grapheme keeps emoji and combined characters whole, so the server and browser render the same
 * text.
 */
export function avatarInitials(name: string) {
  let initials = ""
  let count = 0
  for (const { segment } of graphemeSegmenter.segment(name.trim())) {
    initials += segment
    count += 1
    if (count === 2) break
  }
  return initials.toLocaleUpperCase("en-US")
}
