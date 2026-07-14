import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.describe("public reading experience", () => {
  test("renders the public feed at desktop and mobile widths", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { level: 1, name: "Latest" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await page.getByRole("button", { name: "Open navigation" }).click()
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Latest" })).toBeVisible()
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

    expect(await robots.text()).toContain("Disallow: /account/")
    expect(await sitemap.text()).not.toContain("/auth/")
    expect(await sitemap.text()).not.toContain("/account/")
  })

  test("explains how legacy accounts and degraded media are recovered", async ({ page }) => {
    await page.goto("/migration")

    await expect(
      page.getByRole("heading", { name: "Your archive is here. Sign in fresh." }),
    ).toBeVisible()
    await expect(page.getByText(/same email address/i)).toBeVisible()
    await expect(page.getByText(/controlled placeholder/i)).toBeVisible()
    await expect(page.getByText(/anyone holding the link/i)).toBeVisible()
    await expect(page.getByRole("link", { name: /sign in by magic link/i })).toHaveAttribute(
      "href",
      "/auth/magic-link",
    )
  })
})
