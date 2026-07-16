import { expect, test } from "@playwright/test"

test("serves complete public metadata and discovery documents", async ({ page, request }) => {
  await page.goto("/")

  await expect(page).toHaveTitle("PistonPost")
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://post.pistonmaster.net/",
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://post.pistonmaster.net/og-default.png",
  )
  await expect(page.locator('meta[name="twitter:creator"]')).toHaveAttribute(
    "content",
    "@AlexProgrammer3",
  )
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  )
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1",
  )
  const structuredData = await page.locator('script[type="application/ld+json"]').textContent()
  expect(structuredData).toContain('"@type":"WebSite"')

  const image = await request.get("/og-default.png")
  expect(image.ok()).toBe(true)
  expect(image.headers()["content-type"]).toBe("image/png")

  const robots = await request.get("/robots.txt")
  expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n")

  const sitemap = await request.get("/sitemap.xml")
  expect(sitemap.headers()["content-type"]).toContain("application/xml")
  expect(await sitemap.text()).toContain("<loc>http://localhost:3000/migration</loc>")
})
