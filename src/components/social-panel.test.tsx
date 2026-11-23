import { describe, expect, test } from "bun:test"

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router"
import { renderToString } from "react-dom/server"

import { QuickCommentsLink } from "./social-panel"

function renderLink() {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return renderToString(
    <RouterContextProvider router={router}>
      <QuickCommentsLink postId="post-id" commentCount={7} />
    </RouterContextProvider>,
  )
}

describe("QuickCommentsLink", () => {
  test("keeps the word Comments in the accessible name on narrow screens", () => {
    const html = renderLink()
    const label = /<span class="([^"]*)">Comments<\/span>/u.exec(html)

    expect(html).toContain('href="/post/post-id#discussion"')
    expect(label).not.toBeNull()
    // `hidden` is display: none, which removes the word from the accessibility tree and leaves the
    // link named only "7". Visually hidden text stays in the accessible name.
    const classes = label?.[1]?.split(/\s+/u) ?? []
    expect(classes).not.toContain("hidden")
    expect(classes).toContain("max-sm:sr-only")
  })
})
