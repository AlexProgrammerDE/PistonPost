import { expect, test } from "@playwright/test"

test.describe("authentication", () => {
  test("offers password, magic-link, username, and recovery entry points", async ({ page }) => {
    await page.goto("/auth/sign-in")

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByLabel("Password")).toBeVisible()
    await page.getByText("Other ways to sign in", { exact: true }).click()
    await expect(page.getByRole("link", { name: "Continue with Magic Link" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Continue with username" })).toBeVisible()
    await expect(page.getByRole("link", { name: /forgot/i })).toBeVisible()

    await page.getByRole("link", { name: "Continue with username" }).click()
    await expect(page).toHaveURL(/\/auth\/username$/)
    await expect(page.getByRole("heading", { name: "Sign in with your username" })).toBeVisible()
    await expect(page.getByLabel("Username")).toBeVisible()

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
