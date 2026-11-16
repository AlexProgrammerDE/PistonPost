import { describe, expect, test } from "bun:test"

import { RouterQueryClient } from "./router-query-client"

function createClient() {
  return new RouterQueryClient({
    defaultOptions: { queries: { retry: 3, retryDelay: 0 } },
  })
}

function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  )
}

function failingQuery() {
  let calls = 0
  return {
    calls: () => calls,
    queryFn: () => {
      calls += 1
      return Promise.reject(new Error("unavailable"))
    },
  }
}

describe("router query client", () => {
  test("fails a loader read at once instead of using the default retries", async () => {
    const client = createClient()
    const query = failingQuery()

    expect(
      await rejection(client.ensureQueryData({ queryKey: ["loader"], queryFn: query.queryFn })),
    ).toEqual(new Error("unavailable"))
    expect(query.calls()).toBe(1)
  })

  test("keeps a retry policy that the loader read sets", async () => {
    const client = createClient()
    const query = failingQuery()

    expect(
      await rejection(
        client.ensureQueryData({ queryKey: ["loader"], queryFn: query.queryFn, retry: 1 }),
      ),
    ).toEqual(new Error("unavailable"))
    expect(query.calls()).toBe(2)
  })

  test("keeps the default retries for other reads", async () => {
    const client = createClient()
    const query = failingQuery()

    expect(
      await rejection(client.fetchQuery({ queryKey: ["component"], queryFn: query.queryFn })),
    ).toEqual(new Error("unavailable"))
    expect(query.calls()).toBe(4)
  })
})
