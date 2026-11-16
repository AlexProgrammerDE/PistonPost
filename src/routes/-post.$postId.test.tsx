import { describe, expect, test } from "bun:test"

import { isNotFound } from "@tanstack/react-router"

import { Route } from "./post.$postId"

const loader = Route.options.loader
if (typeof loader !== "function") throw new Error("The post route must define a loader.")
const postLoader = loader

type LoaderContext = Parameters<typeof postLoader>[0]

async function rejection(promise: unknown) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected the post loader to reject.")
}

describe("post loader", () => {
  test.each([
    ["too long", "a".repeat(65)],
    ["blank", "   "],
  ])("treats a %s post ID as not found without a lookup", async (_case, postId) => {
    const lookups: Array<ReadonlyArray<unknown>> = []
    const queryClient = {
      ensureQueryData: async ({ queryKey }: { queryKey: ReadonlyArray<unknown> }) => {
        lookups.push(queryKey)
        return null
      },
      prefetchInfiniteQuery: async () => undefined,
    }
    const error = await rejection(
      postLoader({ context: { queryClient }, params: { postId } } as unknown as LoaderContext),
    )
    expect(isNotFound(error)).toBe(true)
    expect(lookups).toEqual([])
  })
})
