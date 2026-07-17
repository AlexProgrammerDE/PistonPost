import { describe, expect, mock, test } from "bun:test"

import { Effect, Exit } from "effect"
import { z } from "zod"

import { TURNSTILE_ACTIONS } from "@/lib/turnstile"

import { allowedTurnstileHostnames, verifyTurnstile } from "./turnstile"

const requestBodySchema = z.object({
  secret: z.string(),
  response: z.string(),
  idempotency_key: z.string().uuid(),
})

const input = {
  token: "turnstile-token",
  action: TURNSTILE_ACTIONS.createPost,
  publicAppUrl: "https://post.pistonmaster.net",
  secret: "turnstile-secret",
  idempotencyKey: "e6098a14-7908-4a53-9d67-dcc5b66f8695",
}

function siteverifyResponse(
  overrides: Partial<{
    success: boolean
    hostname: string
    action: string | undefined
  }> = {},
) {
  return new Response(
    JSON.stringify({
      success: true,
      hostname: "post.pistonmaster.net",
      action: TURNSTILE_ACTIONS.createPost,
      ...overrides,
    }),
    { headers: { "Content-Type": "application/json" } },
  )
}

describe("Turnstile verification", () => {
  test("validates the provider response, hostname, and action", async () => {
    const request = mock((_: URL | RequestInfo, _init?: RequestInit) =>
      Promise.resolve(siteverifyResponse()),
    )

    const result = await Effect.runPromise(verifyTurnstile({ ...input, fetch: request }))

    expect(result).toEqual({
      action: TURNSTILE_ACTIONS.createPost,
      hostname: "post.pistonmaster.net",
    })
    expect(request).toHaveBeenCalledTimes(1)
    const [url, init] = request.mock.calls[0] ?? []
    const requestedUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url?.url
    expect(requestedUrl).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify")
    expect(init?.method).toBe("POST")
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json")
    expect(typeof init?.body).toBe("string")
    expect(
      requestBodySchema.parse(JSON.parse(typeof init?.body === "string" ? init.body : "")),
    ).toEqual({
      secret: input.secret,
      response: input.token,
      idempotency_key: input.idempotencyKey,
    })
  })

  test("rejects failed, cross-host, and cross-action tokens", async () => {
    const attempts = [
      siteverifyResponse({ success: false }),
      siteverifyResponse({ hostname: "example.com" }),
      siteverifyResponse({ action: TURNSTILE_ACTIONS.createReport }),
    ]

    const exits = await Promise.all(
      attempts.map((response) =>
        Effect.runPromiseExit(
          verifyTurnstile({ ...input, fetch: () => Promise.resolve(response.clone()) }),
        ),
      ),
    )
    for (const exit of exits) {
      expect(Exit.isFailure(exit)).toBeTrue()
      expect(JSON.stringify(exit)).not.toContain(input.token)
      expect(JSON.stringify(exit)).not.toContain(input.secret)
    }
  })

  test("accepts Cloudflare test-key responses during local development", () => {
    expect(allowedTurnstileHostnames("http://localhost:3000")).toEqual(
      new Set(["localhost", "example.com"]),
    )
    expect(allowedTurnstileHostnames("http://127.0.0.1:3000")).toEqual(
      new Set(["127.0.0.1", "example.com"]),
    )
  })

  test("accepts Cloudflare's actionless test response only with its test secret", async () => {
    const testResponse = siteverifyResponse({ hostname: "example.com", action: undefined })
    const localInput = {
      ...input,
      publicAppUrl: "http://localhost:3000",
      secret: "1x0000000000000000000000000000000AA",
      fetch: () => Promise.resolve(testResponse.clone()),
    }

    const result = await Effect.runPromise(verifyTurnstile(localInput))
    expect(result).toEqual({
      action: TURNSTILE_ACTIONS.createPost,
      hostname: "example.com",
    })

    const productionSecretExit = await Effect.runPromiseExit(
      verifyTurnstile({ ...localInput, secret: input.secret }),
    )
    expect(Exit.isFailure(productionSecretExit)).toBeTrue()
  })

  test("wraps provider and response failures without leaking credentials", async () => {
    const attempts = [
      () => Promise.reject(new Error(`provider exposed ${input.secret}`)),
      () => Promise.resolve(new Response("not json")),
      () => Promise.resolve(new Response(null, { status: 503 })),
    ]

    const exits = await Promise.all(
      attempts.map((request) =>
        Effect.runPromiseExit(verifyTurnstile({ ...input, fetch: request })),
      ),
    )
    for (const exit of exits) {
      expect(Exit.isFailure(exit)).toBeTrue()
      expect(JSON.stringify(exit)).not.toContain(input.token)
      expect(JSON.stringify(exit)).not.toContain(input.secret)
    }
  })
})
