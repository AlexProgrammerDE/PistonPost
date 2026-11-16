import { describe, expect, test } from "bun:test"

import { allowRequest, requestCredential, routeClass } from "./request-rate-limit"

const origin = "https://post.pistonmaster.net"

function limiter(allowed = true) {
  const keys: string[] = []
  const binding: RateLimit = {
    limit: async ({ key }) => {
      keys.push(key)
      return { success: allowed }
    },
  }
  return { binding, keys }
}

function failingLimiter(): RateLimit {
  return {
    limit: async () => {
      throw new Error("binding unavailable")
    },
  }
}

function limiters() {
  const anon = limiter()
  const auth = limiter()
  const user = limiter()
  return {
    anon,
    auth,
    user,
    env: {
      ANON_RATE_LIMITER: anon.binding,
      AUTH_RATE_LIMITER: auth.binding,
      USER_RATE_LIMITER: user.binding,
    },
  }
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("cf-connecting-ip", "203.0.113.7")
  return new Request(`${origin}${path}`, { ...init, headers })
}

describe("request rate limits", () => {
  test("gives anonymous visitors one budget per address and route class", async () => {
    const { anon, env } = limiters()

    await allowRequest(request("/post/first"), env)
    await allowRequest(request("/post/second"), env)
    await allowRequest(request("/tag/memes"), env)

    expect(anon.keys).toEqual(["203.0.113.7:post", "203.0.113.7:post", "203.0.113.7:other"])
  })

  test("treats unrelated cookies as anonymous", async () => {
    const { anon, user, env } = limiters()

    await allowRequest(
      request("/", { headers: { cookie: "pistonpost_cookie_consent=x; sidebar_state=true" } }),
      env,
    )

    expect(anon.keys).toEqual(["203.0.113.7:feed"])
    expect(user.keys).toEqual([])
  })

  test("limits signed-in traffic per session without exposing the token", async () => {
    const { anon, user, env } = limiters()
    const secure = request("/", {
      headers: { cookie: "sidebar_state=true; __Secure-pistonpost.session_token=secret.sig" },
    })
    const local = request("/", { headers: { cookie: "pistonpost.session_token=secret.sig" } })

    await allowRequest(secure, env)
    await allowRequest(local, env)

    expect(anon.keys).toEqual([])
    expect(user.keys).toHaveLength(2)
    expect(user.keys[0]).toStartWith("request:feed:")
    expect(user.keys[0]).toBe(user.keys[1] ?? "")
    expect(user.keys.join()).not.toContain("secret")
  })

  test("keeps public media on the address budget for signed-in visitors", async () => {
    const { anon, user, env } = limiters()

    await allowRequest(
      request("/media/image/asset/feed", { headers: { cookie: "pistonpost.session_token=t" } }),
      env,
    )

    expect(anon.keys).toEqual(["203.0.113.7:media"])
    expect(user.keys).toEqual([])
  })

  test("rejects the request when its budget is spent", async () => {
    const { env } = limiters()

    expect(
      await allowRequest(request("/"), { ...env, ANON_RATE_LIMITER: limiter(false).binding }),
    ).toBe(false)
    expect(
      await allowRequest(request("/", { headers: { authorization: "Bearer token" } }), {
        ...env,
        USER_RATE_LIMITER: limiter(false).binding,
      }),
    ).toBe(false)
  })

  test("applies the strict auth budget to auth actions but not session reads", async () => {
    const { auth, env } = limiters()

    expect(await allowRequest(request("/api/auth/get-session"), env)).toBe(true)
    expect(auth.keys).toEqual([])

    await allowRequest(request("/api/auth/sign-in/email", { method: "POST", body: "{}" }), env)
    expect(auth.keys).toEqual(["auth:203.0.113.7"])

    const blocked = { ...env, AUTH_RATE_LIMITER: limiter(false).binding }
    expect(
      await allowRequest(
        request("/api/auth/sign-in/email", { method: "POST", body: "{}" }),
        blocked,
      ),
    ).toBe(false)
  })

  test("allows requests when a limiter binding fails", async () => {
    const env = {
      ANON_RATE_LIMITER: failingLimiter(),
      AUTH_RATE_LIMITER: failingLimiter(),
      USER_RATE_LIMITER: failingLimiter(),
    }

    expect(await allowRequest(request("/api/auth/sign-out", { method: "POST" }), env)).toBe(true)
    expect(
      await allowRequest(request("/", { headers: { cookie: "pistonpost.session_token=t" } }), env),
    ).toBe(true)
  })

  test("reads credentials only from the session cookie or authorization header", () => {
    expect(requestCredential(request("/"))).toBeNull()
    expect(
      requestCredential(request("/", { headers: { cookie: "pistonpost.session_token=" } })),
    ).toBeNull()
    expect(
      requestCredential(request("/", { headers: { cookie: "pistonpost.session_data=cache" } })),
    ).toBeNull()
    expect(requestCredential(request("/", { headers: { authorization: "Bearer t" } }))).toBe(
      "authorization:Bearer t",
    )
  })

  test("classifies routes for keys and analytics without raw paths", () => {
    expect(routeClass("/post/private-id")).toBe("post")
    expect(routeClass("/user/alex")).toBe("other")
    expect(routeClass("/_serverFn/abc")).toBe("server-function")
  })
})
