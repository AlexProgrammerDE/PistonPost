import { expect, test } from "@playwright/test"

test("activates without push permission and only caches the offline fallback", async ({
  page,
  context,
}) => {
  await page.goto("/posts/new")
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
  expect(await page.evaluate(() => Notification.permission)).not.toBe("granted")
  const paths = await page.evaluate(async () => {
    const cache = await caches.open("pistonpost-offline-v1")
    return (await cache.keys()).map((request) => new URL(request.url).pathname).toSorted()
  })
  expect(paths).toEqual(["/offline.css", "/offline.html", "/offline.js"])
  await context.setOffline(true)
  await page.goto("/posts/new")
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("heading", { name: "Make a post" })).toBeVisible()
})

test("receives a share locally and preserves its handoff through the sign-in link", async ({
  page,
}) => {
  await page.goto("/posts/new")
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
  await page.evaluate(() => {
    const form = document.createElement("form")
    form.action = "/share"
    form.method = "POST"
    form.enctype = "multipart/form-data"
    const text = document.createElement("input")
    text.name = "text"
    text.value = "A locally staged share"
    form.appendChild(text)
    document.body.appendChild(form)
    form.submit()
  })
  await expect(page).toHaveURL(/\/posts\/new\?shareId=/)
  const destination = new URL(page.url())
  const shareId = destination.searchParams.get("shareId")
  expect(shareId).not.toBeNull()
  await page.locator('[data-hydrated="true"]').waitFor()
  const cookieChoice = page.getByRole("button", { name: "Reject optional", exact: true })
  if (await cookieChoice.isVisible()) await cookieChoice.click()
  await page.getByRole("main").getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/\/auth\/sign-in\?redirectTo=/)
  expect(new URL(page.url()).searchParams.get("redirectTo")).toBe(
    destination.pathname + destination.search,
  )
})

test("rejects unsupported shared files", async ({ page }) => {
  await page.goto("/posts/new")
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)
  await page.evaluate(() => {
    const form = document.createElement("form")
    form.action = "/share"
    form.method = "POST"
    form.enctype = "multipart/form-data"
    const input = document.createElement("input")
    input.type = "file"
    input.name = "files"
    const transfer = new DataTransfer()
    transfer.items.add(new File(["unsupported"], "file.svg", { type: "image/svg+xml" }))
    input.files = transfer.files
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
  })
  await expect(page).toHaveURL(/shareError=unavailable/)
  await expect(page.getByText("The share could not be opened")).toBeVisible()
})
