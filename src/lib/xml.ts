function isValidXmlCharacter(character: string) {
  const codePoint = character.codePointAt(0)
  if (codePoint === undefined) return false
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  )
}

function removeInvalidXmlCharacters(value: string) {
  return Array.from(value, (character) => (isValidXmlCharacter(character) ? character : "")).join(
    "",
  )
}

/** Escapes text for XML 1.0 and drops characters that XML 1.0 does not allow. */
export function escapeXml(value: string) {
  return removeInvalidXmlCharacters(value.normalize("NFC"))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}
