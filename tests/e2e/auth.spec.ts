import { expect, test } from "@playwright/test"

test.describe("authentication", () => {
  test("offers username, password, magic-link, and recovery entry points", async ({ page }) => {
    await page.goto("/auth/sign-in")

    const accountAccess = page.getByRole("region", { name: "Account access" })
    await expect(accountAccess.getByLabel("Username")).toHaveAttribute(
      "placeholder",
      "Username or email",
    )
    await expect(accountAccess.getByLabel("Password")).toBeVisible()
    await expect(
      accountAccess.getByRole("link", { name: "Continue with Magic Link" }),
    ).toBeVisible()
    await expect(accountAccess.getByRole("link", { name: /forgot/i })).toBeVisible()

    await page.goto("/auth/magic-link")
    await expect(accountAccess.getByRole("button", { name: /send magic link/i })).toBeVisible()

    await page.goto("/auth/forgot-password")
    await expect(accountAccess.getByRole("button", { name: /send reset link/i })).toBeVisible()
  })

  test("renders a complete registration form with CAPTCHA", async ({ page }) => {
    await page.goto("/auth/sign-up")

    const accountAccess = page.getByRole("region", { name: "Account access" })
    await expect(accountAccess.getByLabel("Name", { exact: true })).toBeVisible()
    await expect(accountAccess.getByLabel("Username")).toBeVisible()
    await expect(accountAccess.getByLabel("Email")).toBeVisible()
    await expect(accountAccess.getByLabel("Password", { exact: true })).toBeVisible()
    await expect(accountAccess.getByLabel(/confirm password/i)).toBeVisible()
    await expect(accountAccess.getByRole("group", { name: "CAPTCHA verification" })).toBeVisible()
    await expect(accountAccess.getByRole("button", { name: "Sign Up" })).toBeVisible()
  })

  test("keeps auth responses out of public caches", async ({ request }) => {
    const response = await request.get("/api/auth/get-session")

    expect(response.headers()["cache-control"]).toContain("private")
    expect(response.headers()["cache-control"]).toContain("no-store")
    expect(response.headers().vary).toContain("Cookie")
  })
})
