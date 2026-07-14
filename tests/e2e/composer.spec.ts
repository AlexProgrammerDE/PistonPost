import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.describe("composer and media boundaries", () => {
  test("requires an account before exposing the composer", async ({ page }) => {
    await page.goto("/account/posts/new")

    await expect(page.getByRole("heading", { name: "Make a post" })).toBeVisible()
    await expect(
      page.getByRole("alert").getByText("Sign in to post", { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations).toEqual([])
  })

  test("rejects unsigned webhooks and unauthorized media", async ({ request }) => {
    const mediaId = "19c7ba79-47b2-4ff3-8bbf-d15af9b85219"
    const upload = await request.put(`/media/upload/${mediaId}`, {
      data: Buffer.from([0xff]),
      headers: {
        "Content-Type": "image/jpeg",
        Origin: "http://localhost:3000",
      },
    })
    expect(upload.status()).toBe(401)
    expect(upload.headers()["cache-control"]).toContain("no-store")

    const image = await request.get(`/media/image/${mediaId}/feed`)
    expect(image.status()).toBe(404)

    const webhook = await request.post("/api/stream/webhook", {
      data: { uid: "untrusted" },
    })
    expect(webhook.status()).toBe(403)
  })
})
