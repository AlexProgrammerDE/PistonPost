import { describe, expect, test } from "bun:test"

import type { ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { FeedLoadErrorAlert } from "./FeedLoadError"

const noop = () => undefined

function TestLink({ children, ...props }: ComponentProps<"a">) {
  return <a {...props}>{children}</a>
}

describe("FeedLoadErrorAlert", () => {
  test("offers only a retry when the newest feed page fails", () => {
    const html = renderToStaticMarkup(<FeedLoadErrorAlert onRetry={noop} />)

    expect(html).toContain("The feed could not be loaded")
    expect(html).toContain("Try again")
    expect(html).not.toContain("Latest posts")
  })

  test("links back to the newest posts when an older page fails", () => {
    const html = renderToStaticMarkup(
      <FeedLoadErrorAlert latestLink={<TestLink href="/tag/meme" />} onRetry={noop} />,
    )

    expect(html).toContain("These older posts could not be loaded")
    expect(html).toMatch(/<a [^>]*href="\/tag\/meme"[^>]*>.*Latest posts<\/a>/)
    expect(html).toContain("Try again")
  })
})
