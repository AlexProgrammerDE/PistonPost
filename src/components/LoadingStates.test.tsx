import { describe, expect, test } from "bun:test"

import { LightboxLoadingFallback } from "./LoadingStates"
import { Spinner } from "./ui/spinner"

describe("loading states", () => {
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
