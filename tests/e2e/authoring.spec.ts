import { readdir, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, test, type BrowserContext, type Page } from "@playwright/test"

const CAPTCHA_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"
const TEST_PASSWORD = "PistonPost-Test-2026!"

async function verificationUrlSince(startedAt: number) {
  const temporaryEntries = await readdir(tmpdir(), { withFileTypes: true })
  const messages = (
    await Promise.all(
      temporaryEntries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("miniflare-"))
        .map(async (entry) => {
          const emailDirectory = join(tmpdir(), entry.name, "email", "email-text")
          let emailFiles
          try {
            emailFiles = await readdir(emailDirectory, { withFileTypes: true })
          } catch {
            return []
          }
          return Promise.all(
            emailFiles
              .filter((emailFile) => emailFile.isFile() && emailFile.name.endsWith(".txt"))
              .map(async (emailFile) => {
                const path = join(emailDirectory, emailFile.name)
                const metadata = await stat(path)
                return metadata.mtimeMs < startedAt
                  ? null
                  : { modifiedAt: metadata.mtimeMs, content: await readFile(path, "utf8") }
              }),
          )
        }),
    )
  ).flatMap((group) => group.filter((message) => message !== null))

  for (const message of messages.toSorted((left, right) => right.modifiedAt - left.modifiedAt)) {
    const match = message.content.match(/https?:\/\/[^\s]+\/api\/auth\/verify-email\?[^\s]+/u)
    if (match) return match[0]
  }
  return null
}

async function createVerifiedSession(context: BrowserContext) {
  const stamp = Date.now().toString()
  const email = `author-${stamp}@example.com`
  const startedAt = Date.now() - 1_000
  const signUp = await context.request.post("/api/auth/sign-up/email", {
    headers: { Origin: "http://localhost:3000", "x-captcha-response": CAPTCHA_TEST_TOKEN },
    data: {
      email,
      password: TEST_PASSWORD,
      name: "Moss",
      username: `moss_${stamp}`,
    },
  })
  expect(signUp.status()).toBe(200)

  let verificationUrl: string | null = null
  await expect
    .poll(async () => {
      verificationUrl = await verificationUrlSince(startedAt)
      return verificationUrl
    })
    .not.toBeNull()
  if (!verificationUrl) throw new Error("The local verification email was not written.")

  const verification = await context.request.get(verificationUrl)
  expect(verification.status()).toBeLessThan(400)

  const signIn = await context.request.post("/api/auth/sign-in/email", {
    headers: { Origin: "http://localhost:3000", "x-captcha-response": CAPTCHA_TEST_TOKEN },
    data: { email, password: TEST_PASSWORD },
  })
  expect(signIn.status()).toBe(200)
}

async function selectFormat(page: Page, format: "Text" | "Images" | "Video") {
  await page.locator('[data-hydrated="true"]').waitFor()
  await page.getByLabel("Post type").click()
  await page.getByRole("option", { name: format, exact: true }).click()
}

async function fillPost(page: Page, title: string, tag: string) {
  await page.locator('[data-hydrated="true"]').waitFor()
  const titleInput = page.getByLabel("Title")
  const previewTitle = page.getByRole("region", { name: "Preview" }).locator("article h2")
  await titleInput.fill(title)
  await expect(previewTitle).toHaveText(title)
  const tags = page.getByLabel("Tags")
  await tags.fill(tag)
  await tags.press("Enter")
  await expect(page.getByRole("region", { name: "Preview" })).toContainText(`#${tag}`)
}

test.describe.serial("authenticated authoring", () => {
  test("posts text and images and recovers failed image and video uploads", async ({
    context,
    page,
  }) => {
    test.setTimeout(120_000)
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    const requestFailures: string[] = []
    const errorResponses: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("requestfailed", (request) =>
      requestFailures.push(`${request.url()}: ${request.failure()?.errorText ?? "unknown"}`),
    )
    page.on("response", async (response) => {
      if (response.status() < 400) return
      errorResponses.push(
        `${response.status().toString()} ${response.url()}: ${(await response.text()).slice(0, 500)}`,
      )
    })
    await createVerifiedSession(context)

    await page.goto("/account/posts/new")
    await expect(page.getByRole("heading", { name: "Make a post" })).toBeVisible()
    await page.waitForTimeout(1_000)
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
    expect(requestFailures).toEqual([])
    await fillPost(page, "look at this little guy", "art")
    await page.getByLabel("Text").fill("found this earlier and had to put it somewhere")
    await page.getByRole("button", { name: "Post it" }).click()
    await page.waitForTimeout(1_000)
    expect(errorResponses).toEqual([])
    await expect(page).toHaveURL(/\/post\/[a-z0-9]+$/u)
    await expect(page.getByRole("heading", { name: "look at this little guy" })).toBeVisible()

    await page.goto("/account/posts/new")
    await selectFormat(page, "Images")
    await fillPost(page, "two extremely important cats", "cats")
    const validPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    )
    await page.getByLabel("Choose images to upload").setInputFiles([
      { name: "cat-a.png", mimeType: "image/png", buffer: validPng },
      { name: "cat-b.png", mimeType: "image/png", buffer: validPng },
    ])
    const altTextInputs = page.getByLabel("Alt text")
    await altTextInputs.nth(0).fill("A small orange cat sitting on a blanket")
    await altTextInputs.nth(1).fill("A gray cat looking directly at the camera")
    await page.getByRole("button", { name: "Post it" }).click()
    await expect(page).toHaveURL(/\/post\/[a-z0-9]+$/u)
    await expect(page.getByRole("heading", { name: "two extremely important cats" })).toBeVisible()

    await page.goto("/account/posts/new")
    await selectFormat(page, "Images")
    await fillPost(page, "this upload should recover", "testing")
    await page.getByLabel("Choose images to upload").setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("this is not a PNG"),
    })
    await page.getByLabel("Alt text").fill("An intentionally invalid local test file")
    await page.getByRole("button", { name: "Post it" }).click()
    await expect(page.getByRole("alert").getByText("Couldn’t post this")).toBeVisible()
    await expect(page).toHaveURL(/\/account\/posts\/new$/u)

    await page.route("https://upload.videodelivery.net/**", (route) =>
      route.abort("connectionfailed"),
    )
    await page.goto("/account/posts/new")
    await selectFormat(page, "Video")
    await fillPost(page, "weekend video", "video")
    await page.getByLabel("Choose a video to upload").setInputFiles({
      name: "weekend.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex"),
    })
    await page.getByRole("button", { name: "Post it" }).click()
    await expect(page.getByRole("alert").getByText("Couldn’t post this")).toBeVisible({
      timeout: 30_000,
    })
    await expect(page).toHaveURL(/\/account\/posts\/new$/u)
  })
})
