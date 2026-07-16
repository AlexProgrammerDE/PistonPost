import { describe, expect, test } from "bun:test"

import { renderToStaticMarkup } from "react-dom/server"

import { FeedItemsSkeleton, LightboxLoadingFallback } from "./LoadingStates"
import { Spinner } from "./ui/spinner"

describe("loading states", () => {
  test("announces feed loading without exposing placeholder shapes", () => {
    const html = renderToStaticMarkup(<FeedItemsSkeleton />)

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain("Loading posts…")
    expect(html).toContain('aria-hidden="true"')
  })

  test("shows a visible lightbox loading fallback", () => {
    const fallback = LightboxLoadingFallback()
    const content = fallback.props.children
    const [spinner, label] = content.props.children
    const spinnerElement = Spinner({})

    expect(fallback.props["aria-busy"]).toBe("true")
    expect(spinner.props["aria-hidden"]).toBe("true")
    expect(label.props.children).toBe("Opening image…")
    expect(spinnerElement.props["data-slot"]).toBe("spinner")
  })
})
