import { describe, expect, test } from "bun:test"

import { requestValidatorsMatch } from "./http-cache"

const url = "https://post.pistonmaster.net/media/image/asset-id/feed?v=1"
const entityTag = '"source-feed-v1-width-768-auto"'
const lastModified = new Date("2026-08-28T10:30:45.900Z")

describe("HTTP cache validators", () => {
  test("matches strong, weak, listed, and wildcard entity tags", () => {
    for (const value of [entityTag, `W/${entityTag}`, `"another", ${entityTag}`, "*"]) {
      const request = new Request(url, { headers: { "If-None-Match": value } })
      expect(requestValidatorsMatch(request, entityTag, lastModified)).toBeTrue()
    }
  })

  test("gives entity tags precedence over modification dates", () => {
    const request = new Request(url, {
      headers: {
        "If-Modified-Since": "Fri, 28 Aug 2026 11:00:00 GMT",
        "If-None-Match": '"another"',
      },
    })

    expect(requestValidatorsMatch(request, entityTag, lastModified)).toBeFalse()
  })

  test("matches valid modification dates at whole-second precision", () => {
    const current = new Request(url, {
      headers: { "If-Modified-Since": "Fri, 28 Aug 2026 10:30:45 GMT" },
    })
    const stale = new Request(url, {
      headers: { "If-Modified-Since": "Fri, 28 Aug 2026 10:30:44 GMT" },
    })
    const invalid = new Request(url, { headers: { "If-Modified-Since": "later" } })

    expect(requestValidatorsMatch(current, entityTag, lastModified)).toBeTrue()
    expect(requestValidatorsMatch(stale, entityTag, lastModified)).toBeFalse()
    expect(requestValidatorsMatch(invalid, entityTag, lastModified)).toBeFalse()
  })
})
