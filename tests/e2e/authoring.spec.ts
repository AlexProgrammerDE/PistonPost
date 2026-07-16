import { readdir, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, test, type BrowserContext, type Page } from "@playwright/test"

import { generateN } from "../../src/lib/generate-n"

const CAPTCHA_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"
const TEST_PASSWORD = "PistonPost-Test-2026!"
const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
)

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
  await page.getByRole("button", { name: format, exact: true }).click()
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
  test("uploads, serves, and deletes a managed avatar", async ({ context, page }) => {
    await createVerifiedSession(context)
    await page.goto("/account/settings/profile")
    await page.locator('[data-hydrated="true"]').waitFor()

    await page.getByLabel("Avatar").setInputFiles({
      name: "moss-avatar.png",
      mimeType: "image/png",
      buffer: VALID_PNG,
    })
    await expect(page.getByText("Avatar changed successfully")).toBeVisible()

    const avatar = page.locator('img[src*="/media/image/"][src$="/avatar"]').first()
    await expect(avatar).toBeVisible()
    const avatarSource = await avatar.getAttribute("src")
    expect(avatarSource).not.toBeNull()
    if (!avatarSource) throw new Error("The managed avatar URL was not rendered.")

    const avatarResponse = await context.request.get(`${avatarSource}?width=96`)
    expect(avatarResponse.status()).toBe(200)
    expect(avatarResponse.headers()["content-type"]).toContain("image/webp")

    await page.getByRole("button", { name: "Change avatar" }).click()
    await page.getByRole("menuitem", { name: "Delete avatar" }).click()
    await expect(page.getByText("Avatar deleted successfully")).toBeVisible()
    await expect.poll(async () => (await context.request.get(avatarSource)).status()).toBe(404)
  })

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
    await page.getByLabel("Choose images to upload").setInputFiles([
      { name: "cat-a.png", mimeType: "image/png", buffer: VALID_PNG },
      { name: "cat-b.png", mimeType: "image/png", buffer: VALID_PNG },
    ])
    const altTextInputs = page.getByLabel("Alt text")
    await altTextInputs.nth(0).fill("A small orange cat sitting on a blanket")
    await altTextInputs.nth(1).fill("A gray cat looking directly at the camera")
    await page.getByRole("button", { name: "Post it" }).click()
    await expect(page).toHaveURL(/\/post\/[a-z0-9]+$/u)
    await expect(page.getByRole("heading", { name: "two extremely important cats" })).toBeVisible()
    const postUrl = page.url()
    const imageCollection = page.getByRole("list", {
      name: "two extremely important cats image collection",
    })
    await expect(imageCollection.getByRole("img")).toHaveCount(2)
    await expect(imageCollection).toHaveCSS("column-count", "3")
    await expect(page.getByRole("navigation", { name: "Choose an image" })).toHaveCount(0)

    const secondImageTrigger = imageCollection.getByRole("button", {
      name: "Expand image 2 of 2",
    })
    await secondImageTrigger.click()
    const imageViewer = page.getByRole("dialog", {
      name: "two extremely important cats image viewer",
    })
    await expect(imageViewer).toBeVisible()
    await expect(
      imageViewer
        .getByRole("group", { name: "2 of 2" })
        .getByRole("img", { name: "A gray cat looking directly at the camera" }),
    ).toBeVisible()
    await imageViewer.getByRole("button", { name: "Previous" }).click()
    await expect(
      imageViewer
        .getByRole("group", { name: "1 of 2" })
        .getByRole("img", { name: "A small orange cat sitting on a blanket" }),
    ).toBeVisible()
    await imageViewer.getByRole("button", { name: "Close" }).click()
    await expect(imageViewer).toBeHidden()
    await expect(secondImageTrigger).toBeFocused()

    await page.getByRole("button", { name: "Gallery options" }).click()
    await expect(page.getByRole("menuitemradio", { name: "Masonry" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    await page.getByRole("menuitemradio", { name: "Image browser" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("layout")).toBe("browser")
    await expect.poll(() => new URL(page.url()).searchParams.get("image")).toBe("0")
    await expect(page.getByRole("navigation", { name: "Choose an image" })).toBeVisible()

    await page.getByRole("link", { name: "Show image 2 of 2" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("image")).toBe("1")
    await expect(
      page.getByRole("img", { name: "A gray cat looking directly at the camera" }),
    ).toBeVisible()

    await page.getByRole("button", { name: "Gallery options" }).click()
    await page.getByRole("menuitemradio", { name: "Masonry" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("layout")).toBe("masonry")
    await expect(imageCollection).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Choose an image" })).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(imageCollection).toHaveCSS("column-count", "1")
    await page.setViewportSize({ width: 1280, height: 720 })

    await page.goto(`${postUrl}?image=1`)
    await expect(page.getByRole("navigation", { name: "Choose an image" })).toBeVisible()
    await expect(
      page.getByRole("img", { name: "A gray cat looking directly at the camera" }),
    ).toBeVisible()
    await expect(page.getByRole("list", { name: /image collection/u })).toHaveCount(0)

    await page.goto("/account/posts/new")
    await selectFormat(page, "Images")
    await fillPost(page, "the whole camera roll", "gallery")
    await page.getByLabel("Choose images to upload").setInputFiles(
      generateN(20).map((number) => ({
        name: `gallery-${number.toString().padStart(2, "0")}.png`,
        mimeType: "image/png",
        buffer: VALID_PNG,
      })),
    )
    await page.getByRole("button", { name: "Post it" }).click()
    await expect(page).toHaveURL(/\/post\/[a-z0-9]+$/u)
    await expect(page.getByRole("heading", { name: "the whole camera roll" })).toBeVisible()
    await expect(
      page.getByRole("list", { name: /image collection/u }).getByRole("img"),
    ).toHaveCount(20)

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
