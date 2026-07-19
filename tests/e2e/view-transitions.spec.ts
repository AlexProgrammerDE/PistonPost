import { expect, test, type Page } from "@playwright/test"

type TransitionOptions = {
  readonly types?: ReadonlyArray<string>
  readonly update: () => Promise<void> | void
}

async function trackViewTransitions(page: Page) {
  await page.addInitScript(() => {
    const nativeCssSupports = CSS.supports.bind(CSS)
    Object.defineProperty(CSS, "supports", {
      configurable: true,
      value: (condition: string, value?: string) =>
        condition.includes(":active-view-transition-type(") ||
        (value === undefined ? nativeCssSupports(condition) : nativeCssSupports(condition, value)),
    })

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (options: TransitionOptions | (() => Promise<void> | void)) => {
        const update = typeof options === "function" ? options : options.update
        const types = typeof options === "function" ? [] : (options.types ?? [])
        const root = document.documentElement
        const calls = Number(root.dataset.viewTransitionCalls ?? "0") + 1

        root.dataset.viewTransitionCalls = String(calls)
        root.dataset.viewTransitionTypes = types.join(" ")

        const updateCallbackDone = Promise.resolve().then(update)
        return {
          ready: Promise.resolve(),
          updateCallbackDone,
          finished: updateCallbackDone.then(() => undefined),
          skipTransition() {},
        }
      },
    })
  })
}

test.describe("route view transitions", () => {
  test("labels forward and browser-back navigation", async ({ page }) => {
    await trackViewTransitions(page)
    await page.goto("/privacy")
    await page.locator('[data-hydrated="true"]').waitFor()

    await page.getByRole("link", { name: "Terms", exact: true }).click()
    await expect(page).toHaveURL(/\/terms$/u)
    await expect(page.locator("html")).toHaveAttribute("data-view-transition-types", "page-forward")

    await page.goBack()
    await expect(page).toHaveURL(/\/privacy$/u)
    await expect(page.locator("html")).toHaveAttribute("data-view-transition-types", "page-back")
  })

  test("does not start route transitions with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await trackViewTransitions(page)
    await page.goto("/privacy")
    await page.locator('[data-hydrated="true"]').waitFor()

    await page.getByRole("link", { name: "Terms", exact: true }).click()

    await expect(page).toHaveURL(/\/terms$/u)
    await expect(page.locator("html")).not.toHaveAttribute("data-view-transition-calls")
  })
})
