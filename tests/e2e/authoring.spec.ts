import { readdir, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, test, type BrowserContext, type Dialog, type Page } from "@playwright/test"

import { generateN } from "../../src/lib/generate-n"

const CAPTCHA_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"
const TEST_PASSWORD = "PistonPost-Test-2026!"
let testSessionSequence = 0
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
  const username = `moss_${stamp}`
  const clientAddress = `192.0.2.${String(++testSessionSequence)}`
  const authHeaders = {
    Origin: "http://localhost:3000",
    "cf-connecting-ip": clientAddress,
    "x-captcha-response": CAPTCHA_TEST_TOKEN,
  }
  const startedAt = Date.now() - 1_000
  const signUp = await context.request.post("/api/auth/sign-up/email", {
    headers: authHeaders,
    data: {
      email,
      password: TEST_PASSWORD,
      name: "Moss",
      username,
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

  const verification = await context.request.get(verificationUrl, {
    headers: { "cf-connecting-ip": clientAddress },
  })
  expect(verification.status()).toBeLessThan(400)

  const signIn = await context.request.post("/api/auth/sign-in/email", {
    headers: authHeaders,
    data: { email, password: TEST_PASSWORD },
  })
  expect(signIn.status()).toBe(200)
  return { username }
}

async function selectFormat(page: Page, format: "Text" | "Images" | "Video") {
  await page.locator('[data-hydrated="true"]').waitFor()
  await page.getByRole("button", { name: format, exact: true }).click()
}

async function fillPost(page: Page, title: string, tag: string) {
  await page.locator('[data-hydrated="true"]').waitFor()
  await page.getByLabel("Title").fill(title)
  const tags = page.getByLabel("Tags")
  await tags.fill(tag)
  await tags.press("Enter")
}

test.describe.serial("authenticated authoring", () => {
  test("saves optional email choices while required notifications stay on", async ({
    context,
    page,
  }) => {
    await createVerifiedSession(context)
    await page.goto("/account/settings/notifications")
    await page.locator('[data-hydrated="true"]').waitFor()

    const comments = page.getByRole("switch", { name: "Comments" })
    const replies = page.getByRole("switch", { name: "Replies" })
    const security = page.getByRole("switch", { name: "Security" })
    const moderation = page.getByRole("switch", { name: "Moderation" })
    const productUpdates = page.getByRole("switch", { name: "Product updates" })

    await expect(comments).toBeChecked()
    await expect(replies).toBeChecked()
    await expect(productUpdates).not.toBeChecked()
    await expect(security).toBeChecked()
    await expect(security).toBeDisabled()
    await expect(moderation).toBeChecked()
    await expect(moderation).toBeDisabled()

    await comments.click()
    await productUpdates.click()
    await page.getByRole("button", { name: "Save preferences" }).click()
    await expect(page.getByText("Notification preferences updated")).toBeVisible()

    await page.reload()
    await page.locator('[data-hydrated="true"]').waitFor()
    await expect(page.getByRole("switch", { name: "Comments" })).not.toBeChecked()
    await expect(page.getByRole("switch", { name: "Replies" })).toBeChecked()
    await expect(page.getByRole("switch", { name: "Product updates" })).toBeChecked()
  })

  test("uploads, serves, and deletes a managed avatar", async ({ context, page }) => {
    await createVerifiedSession(context)
    await page.goto("/account/settings/profile")
    await page.locator('[data-hydrated="true"]').waitFor()

    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Change avatar" }).click()
    await page.getByRole("menuitem", { name: "Upload avatar" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
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

  test("publishes without prompting to discard submitted changes", async ({ context, page }) => {
    await createVerifiedSession(context)
    const composerResponse = await page.goto("/account/posts/new")
    const policy = await composerResponse?.headerValue("content-security-policy")
    expect(policy?.split("; ").find((directive) => directive.startsWith("frame-src "))).toBe(
      "frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com https://open.spotify.com",
    )
    await fillPost(page, "a finished post", "testing")
    await page.getByLabel("Text").fill(`## Markdown heading

- [x] Ready to share

https://www.youtube.com/watch?v=M7lc1UVf-VE

[Example](https://example.com)`)
    await page.getByRole("tab", { name: "Preview" }).click()
    await expect(page.getByRole("heading", { name: "Markdown heading" }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Load" }).first()).toBeVisible()

    let publishDialogCount = 0
    const acceptPublishDialog = async (dialog: Dialog) => {
      publishDialogCount += 1
      await dialog.accept()
    }
    page.on("dialog", acceptPublishDialog)

    await page.getByRole("button", { name: "Post it" }).click()
    await expect(page).toHaveURL(/\/post\/[a-z0-9]+$/u)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    expect(publishDialogCount).toBe(0)
    page.off("dialog", acceptPublishDialog)

    await expect(page.getByRole("heading", { name: "Markdown heading" })).toBeVisible()
    const externalLink = page.getByRole("link", { name: /Example/u })
    const warningHref = "/external?url=https%3A%2F%2Fexample.com%2F"
    await expect(externalLink).toHaveAttribute("href", warningHref)
    await expect(externalLink).toHaveAttribute("target", "_blank")
    await expect(externalLink).toHaveAttribute("rel", "ugc nofollow noopener noreferrer")

    await externalLink.click()
    const externalLinkConfirmation = page.getByRole("dialog", {
      name: "Open an external link?",
    })
    await expect(externalLinkConfirmation).toBeVisible()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()
    await externalLinkConfirmation.getByRole("button", { name: "Stay here" }).click()
    await expect(page).toHaveURL(/\/post\/[a-z0-9]+$/u)

    const warningPage = await context.newPage()
    await warningPage.goto(new URL(warningHref, page.url()).toString())
    await expect(warningPage).toHaveURL(/\/external\?url=https%3A%2F%2Fexample\.com%2F$/u)
    await expect(warningPage.getByRole("heading", { name: "Open an external link?" })).toBeVisible()
    await expect(warningPage.getByRole("link", { name: /Open link/u })).toHaveAttribute(
      "rel",
      "ugc nofollow noopener noreferrer",
    )
    await warningPage.close()

    await context.route("https://example.com/**", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>External</title>",
      })
    })
    await externalLink.click()
    const destinationPagePromise = page.waitForEvent("popup")
    await externalLinkConfirmation.getByRole("button", { name: "Open link" }).click()
    const destinationPage = await destinationPagePromise
    await destinationPage.waitForLoadState("domcontentloaded")
    await expect(destinationPage).toHaveURL("https://example.com/")
    expect(await destinationPage.evaluate(() => window.opener)).toBeNull()
    await destinationPage.close()
    await context.unroute("https://example.com/**")
  })

  test("guards user-provided profile websites", async ({ context, page }) => {
    const { username } = await createVerifiedSession(context)
    await page.goto("/account/settings/profile")
    await page.locator('[data-hydrated="true"]').waitFor()
    await page.getByLabel("Website").fill("https://example.com/profile")
    await page.getByRole("button", { name: "Save profile" }).click()
    await expect(page.getByText("Profile updated")).toBeVisible()

    await page.goto(`/user/${username}`)
    await page.locator('[data-hydrated="true"]').waitFor()
    const website = page.getByRole("link", { name: /Website/u })
    await expect(website).toHaveAttribute(
      "href",
      "/external?url=https%3A%2F%2Fexample.com%2Fprofile",
    )
    await expect(website).toHaveAttribute("target", "_blank")
    await expect(website).toHaveAttribute("rel", "ugc nofollow noopener noreferrer me")

    await page.setViewportSize({ width: 390, height: 844 })
    await website.click()
    await expect(page.getByRole("dialog", { name: "Open an external link?" })).toBeVisible()
    await expect(page.locator('[data-slot="drawer-content"]')).toBeVisible()
  })

  test("confirms before discarding unfinished composer changes", async ({ context, page }) => {
    await createVerifiedSession(context)
    await page.goto("/account/posts/new")
    await fillPost(page, "an unfinished post", "draft")

    await page.getByRole("link", { name: "Timeline" }).click()
    const confirmation = page.getByRole("dialog")
    await expect(confirmation).toBeVisible()

    await confirmation.getByRole("button", { name: "Keep editing" }).click()
    await expect(page).toHaveURL(/\/account\/posts\/new$/u)
    await expect(page.getByLabel("Title")).toHaveValue("an unfinished post")

    await page.getByRole("link", { name: "Timeline" }).click()
    await confirmation.getByRole("button", { name: "Discard changes" }).click()
    await expect(page).toHaveURL(/\/$/u)
  })

  test("keeps animated social actions functional with reduced motion", async ({
    context,
    page,
  }) => {
    await createVerifiedSession(context)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/account/posts/new")
    await fillPost(page, "motion without the fuss", "testing")
    await page.getByLabel("Text").fill("A small post for checking reactions and comments.")
    await page.getByRole("button", { name: "Post it" }).click()
    await expect(page).toHaveURL(/\/post\/[a-z0-9]+$/u)

    const postActions = page.getByRole("navigation", { name: "Post actions" })
    const like = postActions.getByRole("button", { name: "Like", exact: true })
    await like.click()
    await expect(like).toHaveAttribute("aria-pressed", "true")
    await expect(like).toContainText("1")

    const commentText = "The animated discussion still works."
    await page.getByLabel("Add a comment").fill(commentText)
    await page.getByRole("button", { name: "Post comment" }).click()
    const comment = page.getByRole("article").filter({ hasText: commentText })
    await expect(comment).toBeVisible()
    await expect(comment.getByText("Sending…")).toHaveCount(0)

    await comment.getByRole("button", { name: "Delete comment" }).click()
    const confirmation = page.getByRole("dialog", { name: "Delete this comment?" })
    await confirmation.getByRole("button", { name: "Delete comment" }).click()
    await expect(comment).toHaveCount(0)
    await expect(page.getByText("No comments yet")).toBeVisible()
  })

  test("accepts dropped images and normalizes incorrect browser metadata", async ({
    context,
    page,
  }) => {
    await createVerifiedSession(context)
    await page.goto("/account/posts/new")
    await selectFormat(page, "Images")
    await fillPost(page, "the extension is lying", "testing")

    const dropzone = page.getByRole("region", { name: "Image dropzone" })
    await expect(dropzone).toBeVisible()
    await expect(page.getByRole("button", { name: "Browse images" })).toBeVisible()
    const dataTransfer = await page.evaluateHandle(
      ({ bytes }) => {
        const transfer = new DataTransfer()
        transfer.items.add(
          new File([Uint8Array.from(bytes)], "actually-a-png.jpg", { type: "image/jpeg" }),
        )
        return transfer
      },
      { bytes: Array.from(VALID_PNG) },
    )
    await dropzone.dispatchEvent("dragenter", { dataTransfer })
    await expect(dropzone).toHaveAttribute("data-dragging", "")
    await expect(dropzone.getByRole("status")).toHaveText("Release to add these images")

    await dropzone.dispatchEvent("drop", { dataTransfer })
    await dataTransfer.dispose()

    await expect(
      page.getByRole("button", { name: "View actually-a-png.png full size" }),
    ).toBeVisible()
    await page.getByLabel("Alt text").fill("A tiny valid PNG with misleading metadata")
    await page.getByRole("button", { name: "Post it" }).click()

    await expect(page).toHaveURL(/\/post\/[a-z0-9]+$/u)
    await expect(page.getByRole("heading", { name: "the extension is lying" })).toBeVisible()
    await expect(
      page.getByRole("img", { name: "A tiny valid PNG with misleading metadata" }),
    ).toBeVisible()
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
    const firstComposerImage = page.getByRole("button", {
      name: "View cat-a.png full size",
    })
    await firstComposerImage.click()
    const composerImageViewer = page.getByRole("dialog", {
      name: "Selected image viewer",
    })
    await expect(
      composerImageViewer
        .getByRole("group", { name: "1 of 2" })
        .getByRole("img", { name: "A small orange cat sitting on a blanket" }),
    ).toBeVisible()
    await expect(composerImageViewer.getByRole("button", { name: "Zoom in" })).toBeVisible()
    await composerImageViewer.getByRole("button", { name: "Next" }).click()
    await expect(
      composerImageViewer
        .getByRole("group", { name: "2 of 2" })
        .getByRole("img", { name: "A gray cat looking directly at the camera" }),
    ).toBeVisible()
    await composerImageViewer.getByRole("button", { name: "Close" }).click()
    await expect(composerImageViewer).toBeHidden()
    await expect(firstComposerImage).toBeFocused()
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
    await expect(page.getByText("2 images", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "0 comments" })).toBeVisible()

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
    await expect(page.getByText("Image 1 of 2")).toBeVisible()
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled()
    await page.getByRole("button", { name: "Next" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("image")).toBe("1")
    await expect(page.getByText("Image 2 of 2")).toBeVisible()
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled()
    await page.getByRole("button", { name: "Previous" }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get("image")).toBe("0")

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
    const longGallery = page.getByRole("list", { name: /image collection/u })
    await expect(longGallery.locator("img")).toHaveCount(20)
    await page.mouse.move(0, 0)
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
    await longGallery.getByRole("button").nth(9).scrollIntoViewIfNeeded()
    const quickActions = page.getByRole("navigation", { name: "Quick post actions" })
    await expect(quickActions).toBeVisible()
    await quickActions.getByRole("button", { name: "Comments 0" }).click()
    await expect(page).toHaveURL(/#discussion$/u)
    await expect(quickActions).toHaveCount(0)
    await expect(page.getByRole("navigation", { name: "Post actions" })).toBeVisible()

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
