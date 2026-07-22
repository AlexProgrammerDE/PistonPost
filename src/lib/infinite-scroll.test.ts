import { describe, expect, test } from "bun:test"

import { shouldAutomaticallyLoadNextPage } from "./infinite-scroll"

const readyFeed = {
  hasNextPage: true,
  isFetching: false,
  isFetchNextPageError: false,
  isPaused: false,
}

describe("infinite scroll", () => {
  test("automatically loads while another page is available", () => {
    expect(shouldAutomaticallyLoadNextPage(readyFeed)).toBe(true)
  })

  test("stops when there are no more pages", () => {
    expect(shouldAutomaticallyLoadNextPage({ ...readyFeed, hasNextPage: false })).toBe(false)
  })

  test("waits while loading is unavailable", () => {
    expect(shouldAutomaticallyLoadNextPage({ ...readyFeed, isFetching: true })).toBe(false)
    expect(shouldAutomaticallyLoadNextPage({ ...readyFeed, isFetchNextPageError: true })).toBe(
      false,
    )
    expect(shouldAutomaticallyLoadNextPage({ ...readyFeed, isPaused: true })).toBe(false)
  })
})
