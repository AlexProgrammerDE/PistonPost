import { expect, test } from "@playwright/test"

test.describe("authentication", () => {
  test("redirects protected settings before rendering and preserves the return path", async ({
    page,
  }) => {
    const response = await page.goto("/settings/security")

    const location = new URL(page.url())
    expect(location.pathname).toBe("/auth/sign-in")
    expect(location.searchParams.get("redirectTo")).toBe("/settings/security")

    const protectedRequest = response?.request().redirectedFrom()
    expect(protectedRequest && new URL(protectedRequest.url()).pathname).toBe("/settings/security")
    expect((await protectedRequest?.response())?.status()).toBe(307)
    await expect(page.getByRole("region", { name: "Account access" })).toBeVisible()
  })

  test("removes unsafe return destinations before rendering auth UI", async ({ page }) => {
    await page.goto("/auth/sign-in?redirectTo=https%3A%2F%2Fexample.com%2Faccount")

    const location = new URL(page.url())
    expect(location.pathname).toBe("/auth/sign-in")
    expect(location.searchParams.has("redirectTo")).toBe(false)
    await expect(page.getByRole("region", { name: "Account access" })).toBeVisible()
  })

  test("offers password, email-code, and recovery entry points", async ({ page }) => {
    await page.goto("/auth/sign-in")

    const accountAccess = page.getByRole("region", { name: "Account access" })
    await expect(accountAccess.getByLabel("Username or email")).toHaveAttribute(
      "placeholder",
      "your-name or you@example.com",
    )
    await expect(
      accountAccess.getByRole("textbox", { name: "Password", exact: true }),
    ).toBeVisible()
    await expect(
      accountAccess.getByRole("link", { name: "Continue with email code" }),
    ).toBeVisible()
    await expect(accountAccess.getByRole("link", { name: "Continue with Magic Link" })).toHaveCount(
      0,
    )
    await expect(accountAccess.getByRole("link", { name: /forgot/iu })).toBeVisible()

    await page.goto("/auth/email-otp")
    await expect(accountAccess.getByRole("button", { name: /send code/iu })).toBeVisible()

    await page.goto("/auth/forgot-password")
    await expect(accountAccess.getByRole("button", { name: /send code/iu })).toBeVisible()
  })

  test("renders a complete registration form with CAPTCHA", async ({ page }) => {
    await page.goto("/auth/sign-up")

    const accountAccess = page.getByRole("region", { name: "Account access" })
    await expect(accountAccess.getByLabel("Name", { exact: true })).toBeVisible()
    await expect(accountAccess.getByLabel("Username")).toBeVisible()
    await expect(accountAccess.getByLabel("Email")).toBeVisible()
    await expect(accountAccess.getByLabel("Password", { exact: true })).toBeVisible()
    await expect(accountAccess.getByLabel(/confirm password/iu)).toBeVisible()
    await expect(accountAccess.getByRole("group", { name: "Human verification" })).toBeVisible()
    await expect(accountAccess.getByRole("button", { name: "Sign up" })).toBeVisible()
  })

  test("keeps auth responses out of public caches", async ({ request }) => {
    const response = await request.get("/api/auth/get-session")

    expect(response.headers()["cache-control"]).toContain("private")
    expect(response.headers()["cache-control"]).toContain("no-store")
    expect(response.headers()["vary"]).toContain("Cookie")
  })
})
