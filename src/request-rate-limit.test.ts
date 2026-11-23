import { describe, expect, test } from "bun:test"

import { allowRequest, requestCredential, routeClass } from "./request-rate-limit"

const origin = "https://post.pistonmaster.net"
const secret = "test-only-auth-secret-at-least-32-characters"

/** Signs a session token the way Better Auth signs its session cookie. */
async function signedToken(token: string, signingSecret = secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token))
  return encodeURIComponent(`${token}.${btoa(String.fromCodePoint(...new Uint8Array(signature)))}`)
}

function limiter(allowed = true) {
  const keys: string[] = []
  const binding: RateLimit = {
    limit: ({ key }) => {
      keys.push(key)
      return Promise.resolve({ success: allowed })
    },
  }
  return { binding, keys }
}

function failingLimiter(): RateLimit {
  return {
    limit: () => Promise.reject(new Error("binding unavailable")),
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
      BETTER_AUTH_SECRET: secret,
    },
  }
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("cf-connecting-ip", "203.0.113.7")
  return new Request(`${origin}${path}`, { ...init, headers })
}

function requestFrom(address: string, path: string) {
  return new Request(`${origin}${path}`, {
    method: path.startsWith("/api/auth") ? "POST" : "GET",
    headers: { "cf-connecting-ip": address },
  })
}

function credential(headers: HeadersInit) {
  return requestCredential(request("/", { headers }), secret)
}

describe("request rate limits", () => {
  test("gives anonymous visitors one budget per address and route class", async () => {
    const { anon, env } = limiters()

    await allowRequest(request("/post/first"), env)
    await allowRequest(request("/post/second"), env)
    await allowRequest(request("/tag/memes"), env)

    expect(anon.keys).toEqual(["203.0.113.7:post", "203.0.113.7:post", "203.0.113.7:other"])
  })

  test("shares one anonymous and auth budget across an IPv6 /64", async () => {
    const { anon, auth, env } = limiters()
    await allowRequest(requestFrom("2001:db8:1:2::1", "/"), env)
    await allowRequest(requestFrom("2001:0db8:0001:0002:ffff:aaaa:bbbb:cccc", "/"), env)
    await allowRequest(requestFrom("2001:db8:1:3::1", "/"), env)
    await allowRequest(requestFrom("2001:db8:1:2::9", "/api/auth/sign-in/email"), env)

    expect(anon.keys.slice(0, 3)).toEqual([
      "2001:db8:1:2::/64:feed",
      "2001:db8:1:2::/64:feed",
      "2001:db8:1:3::/64:feed",
    ])
    expect(auth.keys).toEqual(["auth:2001:db8:1:2::/64"])
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
    const value = await signedToken("session-token")
    const secure = request("/", {
      headers: { cookie: `sidebar_state=true; __Secure-pistonpost.session_token=${value}` },
    })
    const local = request("/", { headers: { cookie: `pistonpost.session_token=${value}` } })
    const bearer = request("/", {
      headers: { authorization: `Bearer ${decodeURIComponent(value)}` },
    })
    const encodedBearer = request("/", { headers: { authorization: `bearer ${value}` } })

    await allowRequest(secure, env)
    await allowRequest(local, env)
    await allowRequest(bearer, env)
    await allowRequest(encodedBearer, env)

    expect(anon.keys).toEqual([])
    expect(user.keys).toHaveLength(4)
    expect(user.keys[0]).toStartWith("request:feed:")
    expect(new Set(user.keys).size).toBe(1)
    expect(user.keys.join()).not.toContain("session-token")
  })

  test("keeps forged session cookies on the address budget", async () => {
    const { anon, user, env } = limiters()
    const otherSecret = await signedToken("session-token", "another-secret-at-least-32-characters")
    const forgedCookies = [
      "pistonpost.session_token=random-value",
      "pistonpost.session_token=token.not-a-signature",
      `__Secure-pistonpost.session_token=${otherSecret}`,
      `pistonpost.session_token=other${await signedToken("session-token")}`,
    ]

    for (const cookie of forgedCookies) {
      await allowRequest(request("/", { headers: { cookie } }), env)
    }

    expect(anon.keys).toEqual(forgedCookies.map(() => "203.0.113.7:feed"))
    expect(user.keys).toEqual([])
  })

  test("keeps forged and unsigned bearer tokens on the address budget", async () => {
    const { anon, user, env } = limiters()
    const forged = [
      "Bearer random-value",
      "Bearer token.c2lnbmF0dXJlLXRoYXQtaXMtZm9ydHktZm91ci1jaGFycy0=",
      `Bearer ${await signedToken("session-token", "another-secret-at-least-32-characters")}`,
      "Basic dXNlcjpwYXNz",
    ]

    for (const authorization of forged) {
      await allowRequest(request("/_serverFn/abc", { headers: { authorization } }), env)
    }

    expect(anon.keys).toEqual(forged.map(() => "203.0.113.7:server-function"))
    expect(user.keys).toEqual([])
  })

  test("treats credentials as anonymous when the auth secret is unavailable", async () => {
    const { anon, user, env } = limiters()
    const cookie = `pistonpost.session_token=${await signedToken("session-token")}`
    const failingSecret: SecretsStoreSecret = {
      get: () => Promise.reject(new Error("secret unavailable")),
    }

    await allowRequest(request("/", { headers: { cookie } }), {
      ...env,
      BETTER_AUTH_SECRET: failingSecret,
    })

    expect(anon.keys).toEqual(["203.0.113.7:feed"])
    expect(user.keys).toEqual([])
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
    const token = await signedToken("session-token")

    expect(
      await allowRequest(request("/"), { ...env, ANON_RATE_LIMITER: limiter(false).binding }),
    ).toBe(false)
    expect(
      await allowRequest(request("/", { headers: { authorization: `Bearer ${token}` } }), {
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
      BETTER_AUTH_SECRET: secret,
    }

    expect(await allowRequest(request("/api/auth/sign-out", { method: "POST" }), env)).toBe(true)
    expect(
      await allowRequest(request("/", { headers: { cookie: "pistonpost.session_token=t" } }), env),
    ).toBe(true)
  })

  test("reads credentials only from a signed session cookie or bearer token", async () => {
    const value = await signedToken("session-token")

    expect(await credential({})).toBeNull()
    expect(await credential({ cookie: "pistonpost.session_token=" })).toBeNull()
    expect(await credential({ cookie: `pistonpost.session_data=${value}` })).toBeNull()
    expect(await credential({ cookie: `pistonpost.session_token=${value}` })).toBe(
      "session:session-token",
    )
    expect(await credential({ authorization: `Bearer ${value}` })).toBe("session:session-token")
  })

  test("classifies routes for keys and analytics without raw paths", () => {
    expect(routeClass("/post/private-id")).toBe("post")
    expect(routeClass("/user/alex")).toBe("other")
    expect(routeClass("/_serverFn/abc")).toBe("server-function")
  })
})
