import { describe, expect, test } from "bun:test"

import { isNotFound } from "@tanstack/react-router"

import { Route } from "./tag.$tag"

const loader = Route.options.loader
if (typeof loader !== "function") throw new Error("The tag route must define a loader.")
const tagLoader = loader

type LoaderContext = Parameters<typeof tagLoader>[0]

function loadTag(tag: string, lookups: Array<ReadonlyArray<unknown>>) {
  const queryClient = {
    ensureQueryData: async ({ queryKey }: { queryKey: ReadonlyArray<unknown> }) => {
      lookups.push(queryKey)
      return null
    },
    infiniteQuery: async () => undefined,
  }
  return tagLoader({
    context: { queryClient },
    params: { tag },
    deps: { cursor: undefined },
  } as unknown as LoaderContext)
}

async function rejection(promise: unknown) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected the tag loader to reject.")
}

describe("tag loader", () => {
  test.each([
    ["too long", "a".repeat(65)],
    ["blank", "   "],
  ])("treats a %s tag as not found without a lookup", async (_case, tag) => {
    const lookups: Array<ReadonlyArray<unknown>> = []
    expect(isNotFound(await rejection(loadTag(tag, lookups)))).toBe(true)
    expect(lookups).toEqual([])
  })

  test("looks up a trimmed, lowercase tag and reports missing tags as not found", async () => {
    const lookups: Array<ReadonlyArray<unknown>> = []
    expect(isNotFound(await rejection(loadTag(" Meme ", lookups)))).toBe(true)
    expect(lookups).toHaveLength(1)
    expect(lookups[0]).toContain("meme")
  })
})
