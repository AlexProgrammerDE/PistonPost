import { describe, expect, test } from "bun:test"

import { isNotFound } from "@tanstack/react-router"

import { Route } from "./user.$username"

const loader = Route.options.loader
if (typeof loader !== "function") throw new Error("The profile route must define a loader.")
const profileLoader = loader

type LoaderContext = Parameters<typeof profileLoader>[0]

function loadProfile(username: string, lookups: Array<ReadonlyArray<unknown>>) {
  const queryClient = {
    ensureQueryData: async ({ queryKey }: { queryKey: ReadonlyArray<unknown> }) => {
      lookups.push(queryKey)
      return null
    },
    infiniteQuery: async () => undefined,
  }
  return profileLoader({
    context: { queryClient },
    params: { username },
    deps: { cursor: undefined },
  } as unknown as LoaderContext)
}

async function rejection(promise: unknown) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected the profile loader to reject.")
}

describe("profile loader", () => {
  test.each([
    ["too long", "a".repeat(33)],
    ["blank", "   "],
  ])("treats a %s username as not found without a lookup", async (_case, username) => {
    const lookups: Array<ReadonlyArray<unknown>> = []
    expect(isNotFound(await rejection(loadProfile(username, lookups)))).toBe(true)
    expect(lookups).toEqual([])
  })

  test("looks up a trimmed, lowercase username and reports missing profiles as not found", async () => {
    const lookups: Array<ReadonlyArray<unknown>> = []
    expect(isNotFound(await rejection(loadProfile(" PistonMaster ", lookups)))).toBe(true)
    expect(lookups).toHaveLength(1)
    expect(lookups[0]).toContain("pistonmaster")
  })
})
