import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.describe("public reading experience", () => {
  test("renders the public feed at desktop and mobile widths", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible()
    await expect(page.getByRole("link", { name: "PistonPost home" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Legal" })).toBeVisible()

    const sidebar = page.getByRole("complementary", { name: "Application sidebar" })
    const brandLink = page.getByRole("link", { name: "PistonPost home" })
    const separatorInsets = await sidebar.evaluate((element) => {
      const panel = element.querySelector('[data-slot="sidebar-inner"]')
      if (!panel) throw new Error("Sidebar panel is missing")

      const panelRect = panel.getBoundingClientRect()

      return Array.from(element.querySelectorAll('[data-sidebar="separator"]')).map((separator) => {
        const separatorRect = separator.getBoundingClientRect()

        return {
          left: separatorRect.left - panelRect.left,
          right: panelRect.right - separatorRect.right,
        }
      })
    })

    expect(separatorInsets).toHaveLength(2)
    for (const inset of separatorInsets) {
      expect(Math.abs(inset.left)).toBeLessThan(0.5)
      expect(Math.abs(inset.right)).toBeLessThan(0.5)
    }
    await expect(brandLink).toHaveCSS("padding-left", "0px")
    await expect(brandLink).toHaveCSS("padding-right", "0px")

    await page.locator('[data-hydrated="true"]').waitFor()
    await sidebar.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(sidebar.locator('[data-sidebar="separator"]')).toHaveCount(2)
    await expect(sidebar.locator('[data-sidebar="separator"]').last()).toBeHidden()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()

    await expect(page.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible()
    await page.locator('[data-hydrated="true"]').waitFor()
    await page.getByRole("button", { name: "Open navigation" }).click()
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Post", exact: true })).toBeVisible()
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
