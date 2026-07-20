import type {
  PublicPostSitemapRecord,
  PublicProfileSitemapRecord,
  PublicTagSitemapRecord,
} from "@/db/public-read-model"

import { mediaImageUrl } from "./media-image"
import { VIDEO_PLAYER_CACHE_VERSION, VIDEO_THUMBNAIL_CACHE_VERSION } from "./video-thumbnail"

export const SITEMAP_PAGE_SIZE = 10_000

export type SitemapKind = "static" | "posts" | "profiles" | "tags"
export type SitemapCounts = Readonly<Record<Exclude<SitemapKind, "static">, number>>

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function absoluteXmlUrl(origin: string, path: string) {
  return escapeXml(new URL(path, `${origin}/`).toString())
}

function lastModifiedXml(value: Date) {
  return `\n    <lastmod>${value.toISOString()}</lastmod>`
}

function urlSetXml(entries: ReadonlyArray<string>, media = false) {
  const namespaces = media
    ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"'
    : ""
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${namespaces}>\n${entries.join("\n")}\n</urlset>\n`
}

function basicEntry(origin: string, path: string, updatedAt?: Date) {
  return `  <url>\n    <loc>${absoluteXmlUrl(origin, path)}</loc>${updatedAt ? lastModifiedXml(updatedAt) : ""}\n  </url>`
}

export function sitemapPageCount(count: number) {
  return Math.ceil(Math.max(0, count) / SITEMAP_PAGE_SIZE)
}

export function buildSitemapIndexXml(origin: string, counts: SitemapCounts) {
  const locations = ["/sitemaps/static/1"]
  for (const kind of ["posts", "profiles", "tags"] as const) {
    for (let page = 1; page <= sitemapPageCount(counts[kind]); page += 1) {
      locations.push(`/sitemaps/${kind}/${page.toString()}`)
    }
  }
  const entries = locations.map(
    (location) => `  <sitemap>\n    <loc>${absoluteXmlUrl(origin, location)}</loc>\n  </sitemap>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>\n`
}

export function buildStaticSitemapXml(origin: string) {
  return urlSetXml(
    ["/", "/cookie-policy", "/privacy", "/terms"].map((path) => basicEntry(origin, path)),
  )
}

export function buildPostSitemapXml(
  origin: string,
  records: ReadonlyArray<PublicPostSitemapRecord>,
) {
  return urlSetXml(
    records.map((post) => {
      const media = post.media
        .map((asset) => {
          if (asset.kind === "image") {
            return `\n    <image:image>\n      <image:loc>${absoluteXmlUrl(origin, mediaImageUrl(asset.id, "feed"))}</image:loc>\n    </image:image>`
          }
          if (asset.kind === "video") {
            const duration = asset.duration
              ? `\n      <video:duration>${Math.max(1, Math.round(asset.duration / 1_000)).toString()}</video:duration>`
              : ""
            return `\n    <video:video>\n      <video:thumbnail_loc>${absoluteXmlUrl(origin, `/media/video/${asset.id}/thumbnail?v=${VIDEO_THUMBNAIL_CACHE_VERSION.toString()}`)}</video:thumbnail_loc>\n      <video:title>${escapeXml(post.title)}</video:title>\n      <video:description>${escapeXml(`${post.title}, a video on PistonPost.`)}</video:description>\n      <video:player_loc allow_embed="yes">${absoluteXmlUrl(origin, `/media/video/${asset.id}/player?v=${VIDEO_PLAYER_CACHE_VERSION.toString()}`)}</video:player_loc>${duration}\n      <video:publication_date>${post.publishedAt.toISOString()}</video:publication_date>\n    </video:video>`
          }
          return ""
        })
        .join("")
      return `  <url>\n    <loc>${absoluteXmlUrl(origin, `/post/${encodeURIComponent(post.id)}`)}</loc>${lastModifiedXml(post.updatedAt)}${media}\n  </url>`
    }),
    true,
  )
}

export function buildProfileSitemapXml(
  origin: string,
  records: ReadonlyArray<PublicProfileSitemapRecord>,
) {
  return urlSetXml(
    records.map((profile) =>
      basicEntry(origin, `/user/${encodeURIComponent(profile.username)}`, profile.updatedAt),
    ),
  )
}

export function buildTagSitemapXml(origin: string, records: ReadonlyArray<PublicTagSitemapRecord>) {
  return urlSetXml(
    records.map((tag) => basicEntry(origin, `/tag/${encodeURIComponent(tag.tag)}`, tag.updatedAt)),
  )
}

export function buildRobotsTxt(origin: string, indexable: boolean) {
  if (!indexable) return "User-agent: *\nDisallow: /\n"
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /media/upload/",
    "Disallow: /_serverFn/",
    "",
    `Host: ${origin}`,
    `Sitemap: ${new URL("/sitemap.xml", `${origin}/`).toString()}`,
    "",
  ].join("\n")
}
