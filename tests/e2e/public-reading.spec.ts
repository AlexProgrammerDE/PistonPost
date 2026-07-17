import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.describe("public reading experience", () => {
  test("renders the public feed at desktop and mobile widths", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible()
    await expect(page.getByRole("link", { name: "PistonPost home" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Legal" })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()

    await expect(page.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible()
    await page.locator('[data-hydrated="true"]').waitFor()
    await page.getByRole("button", { name: "Open navigation" }).click()
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible()
    await expect(page.getByRole("link", { name: "New post" })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto("/")
    const results = await new AxeBuilder({ page }).analyze()

    expect(results.violations).toEqual([])
  })

  test("exposes discovery controls without account routes", async ({ request }) => {
    const [robots, sitemap] = await Promise.all([
      request.get("/robots.txt"),
      request.get("/sitemap.xml"),
    ])

    expect(await robots.text()).toContain("Disallow: /")
    expect(await sitemap.text()).not.toContain("/auth/")
    expect(await sitemap.text()).not.toContain("/account/")
  })
})
