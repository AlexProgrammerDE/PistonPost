import type { PublicSitemapRecord } from "@pistonpost/db/public-read-model"

const MAX_SITEMAP_URLS = 50_000

type SitemapEntry = {
  readonly path: string
  readonly lastModified?: Date
  readonly changeFrequency: "daily" | "weekly" | "monthly"
  readonly priority: number
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function newestDate(current: Date | undefined, candidate: Date) {
  return !current || candidate > current ? candidate : current
}

function publicEntries(records: ReadonlyArray<PublicSitemapRecord>) {
  const posts = new Map<string, Date>()
  const profiles = new Map<string, Date>()
  const tags = new Map<string, Date>()

  for (const record of records) {
    posts.set(record.postId, newestDate(posts.get(record.postId), record.postUpdatedAt))
    profiles.set(
      record.username,
      newestDate(profiles.get(record.username), record.profileUpdatedAt),
    )
    if (record.tag) {
      tags.set(record.tag, newestDate(tags.get(record.tag), record.postUpdatedAt))
    }
  }

  return [
    ...[...posts].map<SitemapEntry>(([postId, lastModified]) => ({
      path: `/post/${encodeURIComponent(postId)}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
    ...[...profiles].map<SitemapEntry>(([username, lastModified]) => ({
      path: `/user/${encodeURIComponent(username)}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    })),
    ...[...tags].map<SitemapEntry>(([tag, lastModified]) => ({
      path: `/tag/${encodeURIComponent(tag)}`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.6,
    })),
  ]
}

function renderEntry(origin: string, entry: SitemapEntry) {
  const location = new URL(entry.path, `${origin}/`).toString()
  const lastModified = entry.lastModified
    ? `\n    <lastmod>${entry.lastModified.toISOString()}</lastmod>`
    : ""
  return `  <url>\n    <loc>${escapeXml(location)}</loc>${lastModified}\n    <changefreq>${entry.changeFrequency}</changefreq>\n    <priority>${entry.priority.toFixed(1)}</priority>\n  </url>`
}

export function buildSitemapXml(origin: string, records: ReadonlyArray<PublicSitemapRecord>) {
  const entries: ReadonlyArray<SitemapEntry> = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/migration", changeFrequency: "monthly", priority: 0.3 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.2 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.2 },
    ...publicEntries(records),
  ]
  const urls = entries.slice(0, MAX_SITEMAP_URLS).map((entry) => renderEntry(origin, entry))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
}

export function buildRobotsTxt(origin: string, indexable: boolean) {
  if (!indexable) return "User-agent: *\nDisallow: /\n"
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /account/",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /auth/",
    "Disallow: /media/upload/",
    "Disallow: /_serverFn/",
    "",
    `Host: ${origin}`,
    `Sitemap: ${new URL("/sitemap.xml", `${origin}/`).toString()}`,
    "",
  ].join("\n")
}
