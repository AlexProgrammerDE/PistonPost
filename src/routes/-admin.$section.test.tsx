import { describe, expect, test } from "bun:test"

import { isNotFound } from "@tanstack/react-router"

import { Route } from "./admin.$section"

const loader = Route.options.loader
if (typeof loader !== "function") throw new TypeError("The admin table route must define a loader.")
const adminLoader = loader

type LoaderContext = Parameters<typeof adminLoader>[0]

const defaultSearch = {
  q: "",
  sort: "createdAt",
  direction: "desc",
  cursor: "",
  trail: "",
  hidden: "",
}

function loadSection(section: string, queries: (readonly unknown[])[]): unknown {
  const queryClient = {
    query: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      queries.push(queryKey)
      return Promise.resolve({ rows: [], nextCursor: null })
    },
  }
  return adminLoader({
    context: { queryClient },
    params: { section },
    deps: defaultSearch,
  } as unknown as LoaderContext)
}

function thrown(run: () => unknown) {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error("Expected the admin table loader to throw.")
}

describe("admin table loader", () => {
  test.each(["unknown", "users", "Posts"])(
    "treats the %s section as not found without a query",
    (section) => {
      const queries: (readonly unknown[])[] = []
      expect(isNotFound(thrown(() => loadSection(section, queries)))).toBe(true)
      expect(queries).toEqual([])
    },
  )

  test("starts the row query for a known section", () => {
    const queries: (readonly unknown[])[] = []
    expect(loadSection("posts", queries)).toEqual({
      section: "posts",
      query: "",
      cursor: undefined,
      direction: "desc",
    })
    expect(queries).toHaveLength(1)
  })
})
