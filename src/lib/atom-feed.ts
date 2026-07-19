import type { PublicAtomFeedRecord } from "@/db/atom-feed-read-model"

import { markdownToPlainText } from "./markdown"
import { SITE_DESCRIPTION, SITE_NAME, truncateDescription } from "./seo"

const EMPTY_FEED_UPDATED_AT = new Date(0)

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

function escapeXml(value: string) {
  return removeInvalidXmlCharacters(value.normalize("NFC"))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function absoluteXmlUrl(origin: string, path: string) {
  return escapeXml(new URL(path, `${origin}/`).toString())
}

function feedUpdatedAt(records: ReadonlyArray<PublicAtomFeedRecord>) {
  return records.reduce(
    (latest, record) => (record.updatedAt > latest ? record.updatedAt : latest),
    EMPTY_FEED_UPDATED_AT,
  )
}

function feedSummary(record: PublicAtomFeedRecord) {
  const text = record.textContent ? markdownToPlainText(record.textContent) : ""
  if (text) return truncateDescription(text, 400)
  const kind = record.type === "images" ? "Image post" : record.type === "video" ? "Video" : "Post"
  return `${kind} by ${record.author.name}.`
}

function feedEntry(origin: string, record: PublicAtomFeedRecord) {
  const postUrl = absoluteXmlUrl(origin, `/post/${encodeURIComponent(record.id)}`)
  const authorUrl = absoluteXmlUrl(
    origin,
    `/user/${encodeURIComponent(record.author.normalizedUsername)}`,
  )
  return `  <entry>
    <id>${postUrl}</id>
    <title type="text">${escapeXml(record.title)}</title>
    <link rel="alternate" type="text/html" href="${postUrl}" />
    <published>${record.publishedAt.toISOString()}</published>
    <updated>${record.updatedAt.toISOString()}</updated>
    <author>
      <name>${escapeXml(record.author.name)}</name>
      <uri>${authorUrl}</uri>
    </author>
    <summary type="text">${escapeXml(feedSummary(record))}</summary>
  </entry>`
}

export function buildAtomFeedXml(origin: string, records: ReadonlyArray<PublicAtomFeedRecord>) {
  const feedUrl = absoluteXmlUrl(origin, "/feed.xml")
  const siteUrl = absoluteXmlUrl(origin, "/")
  const entries = records.map((record) => feedEntry(origin, record)).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <id>${feedUrl}</id>
  <title type="text">${escapeXml(`${SITE_NAME} latest posts`)}</title>
  <subtitle type="text">${escapeXml(SITE_DESCRIPTION)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${feedUrl}" />
  <link rel="alternate" type="text/html" href="${siteUrl}" />
  <updated>${feedUpdatedAt(records).toISOString()}</updated>${entries ? `\n${entries}` : ""}
</feed>
`
}
