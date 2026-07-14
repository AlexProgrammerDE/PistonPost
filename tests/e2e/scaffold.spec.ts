import { expect, test } from "@playwright/test"

test("serves PistonPost metadata", async ({ page }) => {
  await page.goto("/")

  await expect(page).toHaveTitle("PistonPost")
})
