import { describe, expect, test } from "bun:test"

import { malformedServerFunctionPayload } from "./start"

const endpoint = "http://localhost:3000/_serverFn/example"

describe("server function payload check", () => {
  test("rejects a GET payload that is not JSON with the public invalid input error", async () => {
    const response = await malformedServerFunctionPayload(
      new Request(`${endpoint}?payload=garbage`),
    )

    if (!response) throw new Error("Expected the malformed payload to be rejected.")
    expect(response.status).toBe(400)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    const body: unknown = await response.json()
    expect(body).toEqual({
      code: "INVALID_INPUT",
      message: "The request payload could not be read.",
      issues: [],
    })
  })

  test("rejects a JSON POST body that does not parse", async () => {
    const response = await malformedServerFunctionPayload(
      new Request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }),
    )

    expect(response?.status).toBe(400)
  })

  test("lets valid and absent payloads through", async () => {
    const payload = encodeURIComponent(JSON.stringify({ t: 10, i: 0, p: {}, o: 0 }))
    const post = new Request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: 10 }),
    })

    expect(
      await malformedServerFunctionPayload(new Request(`${endpoint}?payload=${payload}`)),
    ).toBeNull()
    expect(await malformedServerFunctionPayload(new Request(endpoint))).toBeNull()
    expect(await malformedServerFunctionPayload(post)).toBeNull()
    expect(await post.text()).toBe('{"t":10}')
  })
})
