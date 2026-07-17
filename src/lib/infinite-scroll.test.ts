import { describe, expect, test } from "bun:test"

import { shouldAutomaticallyLoadNextPage } from "./infinite-scroll"

const readyFeed = {
  hasNextPage: true,
  loadedPageCount: 1,
  isContinuousLoadingEnabled: false,
  isFetching: false,
  isFetchNextPageError: false,
  isPaused: false,
}

describe("infinite scroll", () => {
  test("automatically loads one page after the initial page", () => {
    expect(shouldAutomaticallyLoadNextPage(readyFeed)).toBe(true)
  })

  test("stops automatic loading after two pages so the footer stays reachable", () => {
    expect(
      shouldAutomaticallyLoadNextPage({
        ...readyFeed,
        loadedPageCount: 2,
      }),
    ).toBe(false)
  })

  test("resumes continuous loading after the barrier is accepted", () => {
    expect(
      shouldAutomaticallyLoadNextPage({
        ...readyFeed,
        loadedPageCount: 20,
        isContinuousLoadingEnabled: true,
      }),
    ).toBe(true)
  })

  test("waits while loading is unavailable", () => {
    expect(shouldAutomaticallyLoadNextPage({ ...readyFeed, isFetching: true })).toBe(false)
    expect(shouldAutomaticallyLoadNextPage({ ...readyFeed, isFetchNextPageError: true })).toBe(
      false,
    )
    expect(shouldAutomaticallyLoadNextPage({ ...readyFeed, isPaused: true })).toBe(false)
  })
})
