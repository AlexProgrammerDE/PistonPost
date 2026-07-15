import { afterEach, describe, expect, it } from "bun:test"

import { createMigratedTestDatabase, schema } from "@/db"

import { createAuth, turnstileAllowedHostnames, type AuthenticationEmail } from "./server"

const databases: Array<ReturnType<typeof createMigratedTestDatabase>> = []

afterEach(() => {
  for (const database of databases) {
    database.$client.close()
  }
  databases.length = 0
})

function setup() {
  const database = createMigratedTestDatabase()
  const emails: Array<AuthenticationEmail> = []
  databases.push(database)
  const auth = createAuth({
    database,
    baseURL: "http://localhost:3000",
    secret: "test-only-auth-secret-at-least-32-characters",
    trustedOrigins: ["http://localhost:3000"],
    turnstileSecret: "not-used-in-this-test",
    production: false,
    captchaEnabled: false,
    sendEmail: async (email) => {
      emails.push(email)
    },
  })
  return { auth, database, emails }
}

function authRequest(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function sessionRequest(cookie: string) {
  return new Request("http://localhost:3000/api/auth/get-session", {
    headers: { cookie, origin: "http://localhost:3000" },
  })
}

describe("request-scoped Better Auth", () => {
  it("accepts Cloudflare test-token hostnames only on loopback development origins", () => {
    expect(turnstileAllowedHostnames("http://localhost:3000")).toEqual(["localhost", "example.com"])
    expect(turnstileAllowedHostnames("http://127.0.0.1:3000")).toEqual(["127.0.0.1", "example.com"])
    expect(turnstileAllowedHostnames("https://staging.post.pistonmaster.net")).toEqual([
      "staging.post.pistonmaster.net",
    ])
  })

  it("registers an unverified user and dispatches verification email", async () => {
    const { auth, database, emails } = setup()
    const response = await auth.handler(
      authRequest("/sign-up/email", {
        name: "Avery Wrench",
        username: "avery",
        email: "Avery@example.com",
        password: "correct-horse-battery-staple",
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(database.select().from(schema.user).all()).toHaveLength(1)
    expect(database.select().from(schema.user).get()?.emailVerified).toBeFalse()
    expect(emails.map((email) => email.content.template)).toEqual(["email-verification"])
  })

  it("does not share database state between auth factories", async () => {
    const first = setup()
    const second = setup()
    const response = await first.auth.handler(
      authRequest("/sign-up/email", {
        name: "First User",
        username: "first-user",
        email: "first@example.com",
        password: "correct-horse-battery-staple",
      }),
    )

    expect(response.status).toBe(200)
    expect(first.database.select().from(schema.user).all()).toHaveLength(1)
    expect(second.database.select().from(schema.user).all()).toHaveLength(0)
  })

  it("rejects captcha-protected requests without a Turnstile token", async () => {
    const database = createMigratedTestDatabase()
    databases.push(database)
    const auth = createAuth({
      database,
      baseURL: "http://localhost:3000",
      secret: "test-only-auth-secret-at-least-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      turnstileSecret: "1x0000000000000000000000000000000AA",
      production: false,
      sendEmail: async () => {},
    })

    const response = await auth.handler(
      authRequest("/sign-up/email", {
        name: "Missing Captcha",
        username: "missing-captcha",
        email: "captcha@example.com",
        password: "correct-horse-battery-staple",
      }),
    )

    expect(response.status).toBe(400)
    expect(database.select().from(schema.user).all()).toHaveLength(0)
  })

  it("revokes existing sessions after a password reset", async () => {
    const { auth, database, emails } = setup()
    await auth.handler(
      authRequest("/sign-up/email", {
        name: "Session Tester",
        username: "session-tester",
        email: "session@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    database.update(schema.user).set({ emailVerified: true }).run()

    const signInResponse = await auth.handler(
      authRequest("/sign-in/email", {
        email: "session@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    expect(signInResponse.status).toBe(200)
    const sessionToken = database.select().from(schema.session).get()?.token
    expect(sessionToken).toBeDefined()
    const cookie = `pistonpost.session_token=${sessionToken ?? ""}`

    await auth.handler(
      authRequest("/request-password-reset", {
        email: "session@example.com",
        redirectTo: "http://localhost:3000/auth/reset-password",
      }),
    )
    const resetUrl = emails.find((email) => email.content.template === "password-reset")?.content
      .action?.url
    const parsedResetUrl = resetUrl ? new URL(resetUrl) : undefined
    const token =
      parsedResetUrl?.searchParams.get("token") ?? parsedResetUrl?.pathname.split("/").at(-1)
    expect(token).toBeTruthy()

    const resetResponse = await auth.handler(
      authRequest("/reset-password", {
        token,
        newPassword: "a-new-correct-horse-battery-staple",
      }),
    )
    expect(resetResponse.status).toBe(200)

    const sessionResponse = await auth.handler(sessionRequest(cookie))
    expect(await sessionResponse.json()).toBeNull()
  })
})
