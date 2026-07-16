import { describe, expect, test } from "bun:test"

import { renderToStaticMarkup } from "react-dom/server"

import { FeedItemsSkeleton, LightboxLoadingFallback } from "./LoadingStates"

describe("loading states", () => {
  test("announces feed loading without exposing placeholder shapes", () => {
    const html = renderToStaticMarkup(<FeedItemsSkeleton />)

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain("Loading posts…")
    expect(html).toContain('aria-hidden="true"')
  })

  test("shows a visible lightbox loading fallback", () => {
    const html = renderToStaticMarkup(<LightboxLoadingFallback />)

    expect(html).toContain("Opening image…")
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('data-slot="spinner"')
  })
})
