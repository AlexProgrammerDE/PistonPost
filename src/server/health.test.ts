import { describe, expect, test } from "bun:test"

import { healthResponse } from "./health"

describe("health check", () => {
  test("reports ok to GET", async () => {
    const response = healthResponse("GET")

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
    const body: unknown = await response.json()
    expect(body).toEqual({ status: "ok" })
  })

  test("answers HEAD with the GET status and headers and no body", async () => {
    const response = healthResponse("HEAD")

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
    expect(response.body).toBeNull()
    expect(await response.text()).toBe("")
  })

  test("rejects other methods with the allowed methods", () => {
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
      const response = healthResponse(method)

      expect(response.status).toBe(405)
      expect(response.headers.get("Allow")).toBe("GET, HEAD")
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      expect(response.body).toBeNull()
    }
  })
})
