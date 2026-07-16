import { expect, test } from "@playwright/test"

test.describe("authentication", () => {
  test("offers username, password, magic-link, and recovery entry points", async ({ page }) => {
    await page.goto("/auth/sign-in")

    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel("Username")).toHaveAttribute("placeholder", "Username or email")
    await expect(page.getByLabel("Password")).toBeVisible()
    await expect(page.getByRole("link", { name: "Continue with Magic Link" })).toBeVisible()
    await expect(page.getByRole("link", { name: /forgot/i })).toBeVisible()

    await page.goto("/auth/magic-link")
    await expect(page.getByRole("heading", { name: /magic link/i })).toBeVisible()

    await page.goto("/auth/forgot-password")
    await expect(page.getByRole("heading", { name: /forgot password/i })).toBeVisible()
  })

  test("renders a complete registration form with CAPTCHA", async ({ page }) => {
    await page.goto("/auth/sign-up")

    await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible()
    await expect(page.getByLabel("Name", { exact: true })).toBeVisible()
    await expect(page.getByLabel("Username")).toBeVisible()
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible()
    await expect(page.getByLabel(/confirm password/i)).toBeVisible()
    await expect(page.getByRole("group", { name: "CAPTCHA verification" })).toBeVisible()
  })

  test("keeps auth responses out of public caches", async ({ request }) => {
    const response = await request.get("/api/auth/get-session")

    expect(response.headers()["cache-control"]).toContain("private")
    expect(response.headers()["cache-control"]).toContain("no-store")
    expect(response.headers().vary).toContain("Cookie")
  })
})
