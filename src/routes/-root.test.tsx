import { describe, expect, test } from "bun:test"

import { Route } from "./__root"

type HeadContext = Parameters<NonNullable<typeof Route.options.head>>[0]

function rootHead(notFound: boolean) {
  const head = Route.options.head
  if (!head) throw new Error("The root route must define head metadata.")
  return head({ match: { _notFound: notFound } } as unknown as HeadContext)
}

type HeadMeta = NonNullable<NonNullable<Awaited<ReturnType<typeof rootHead>>>["meta"]>

function metaContent(meta: HeadMeta, name: string) {
  return meta.find((entry) => entry?.name === name)?.content
}

describe("root head", () => {
  test("titles unknown pages as not found and keeps them out of search results", async () => {
    const { meta = [] } = await rootHead(true)

    expect(meta.find((entry) => entry?.title)?.title).toBe("Page not found · PistonPost")
    expect(metaContent(meta, "robots")).toBe("noindex, nofollow")
  })

  test("leaves indexing to child routes for found pages", async () => {
    const { meta = [] } = await rootHead(false)

    expect(meta.find((entry) => entry?.title)?.title).toBe("PistonPost")
    expect(metaContent(meta, "robots")).toBeUndefined()
  })
})
