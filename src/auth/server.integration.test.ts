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

function setup(
  isManagedUserAvatar: (userId: string, image: string) => Promise<boolean> = async () => false,
) {
  const database = createMigratedTestDatabase()
  const emails: Array<AuthenticationEmail> = []
  databases.push(database)
  const auth = createAuth({
    database,
    baseURL: "http://localhost:3000",
    betterAuthApiKey: "test-only-better-auth-api-key",
    secret: "test-only-auth-secret-at-least-32-characters",
    trustedOrigins: ["http://localhost:3000"],
    turnstileSecret: "not-used-in-this-test",
    production: false,
    captchaEnabled: false,
    infraEnabled: false,
    isManagedUserAvatar,
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
  it("enables database joins and registers the Better Auth infrastructure plugins", () => {
    const database = createMigratedTestDatabase()
    databases.push(database)
    const auth = createAuth({
      database,
      baseURL: "http://localhost:3000",
      betterAuthApiKey: "test-only-better-auth-api-key",
      secret: "test-only-auth-secret-at-least-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      turnstileSecret: "not-used-in-this-test",
      production: false,
      captchaEnabled: false,
      isManagedUserAvatar: async () => false,
      sendEmail: async () => {},
    })

    expect(auth.options.experimental?.joins).toBe(true)

    const pluginIds = auth.options.plugins.map((plugin) => plugin.id)
    expect(pluginIds).toContain("dash")
    expect(pluginIds).toContain("sentinel")
  })

  it("accepts Cloudflare test-token hostnames only on loopback development origins", () => {
    expect(turnstileAllowedHostnames("http://localhost:3000")).toEqual(["localhost", "example.com"])
    expect(turnstileAllowedHostnames("http://127.0.0.1:3000")).toEqual(["127.0.0.1", "example.com"])
    expect(turnstileAllowedHostnames("https://staging.post.pistonmaster.net")).toEqual([
      "staging.post.pistonmaster.net",
    ])
  })

  it("hands Better Auth background work to the request runtime", () => {
    const database = createMigratedTestDatabase()
    databases.push(database)
    const scheduled: Array<Promise<unknown>> = []
    const runInBackground = (promise: Promise<unknown>) => scheduled.push(promise)
    const auth = createAuth({
      database,
      baseURL: "http://localhost:3000",
      betterAuthApiKey: "test-only-better-auth-api-key",
      secret: "test-only-auth-secret-at-least-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      turnstileSecret: "not-used-in-this-test",
      production: false,
      captchaEnabled: false,
      infraEnabled: false,
      isManagedUserAvatar: async () => false,
      sendEmail: async () => {},
      runInBackground,
    })

    auth.options.advanced?.backgroundTasks?.handler(Promise.resolve())
    expect(scheduled).toHaveLength(1)
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
      betterAuthApiKey: "test-only-better-auth-api-key",
      secret: "test-only-auth-secret-at-least-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      turnstileSecret: "1x0000000000000000000000000000000AA",
      production: false,
      infraEnabled: false,
      isManagedUserAvatar: async () => false,
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

  it("asks the current address to approve an email change", async () => {
    const { auth, database, emails } = setup()
    await auth.handler(
      authRequest("/sign-up/email", {
        name: "Email Change Tester",
        username: "email-change-tester",
        email: "current@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    database.update(schema.user).set({ emailVerified: true }).run()
    const signInResponse = await auth.handler(
      authRequest("/sign-in/email", {
        email: "current@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    const cookie = signInResponse.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ")
    emails.length = 0

    const response = await auth.handler(
      authRequest("/change-email", { newEmail: "next@example.com" }, cookie),
    )

    expect(response.status).toBe(200)
    expect(emails).toHaveLength(1)
    expect(emails[0]?.to).toBe("current@example.com")
    expect(emails[0]?.content.template).toBe("email-change-approval")
    expect(emails[0]?.content.action?.url).toContain("/api/auth/verify-email")
  })

  it("rejects external profile images and accepts the user's managed avatar", async () => {
    const managedImage = `/media/image/${crypto.randomUUID()}/avatar`
    const { auth, database } = setup(async (_userId, image) => image === managedImage)
    await auth.handler(
      authRequest("/sign-up/email", {
        name: "Avatar Tester",
        username: "avatar-tester",
        email: "avatar@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    database.update(schema.user).set({ emailVerified: true }).run()

    const signInResponse = await auth.handler(
      authRequest("/sign-in/email", {
        email: "avatar@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    expect(signInResponse.status).toBe(200)
    const cookie = signInResponse.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ")
    expect(cookie).toContain("pistonpost.session_token=")

    const rejected = await auth.handler(
      authRequest("/update-user", { image: "https://tracker.example/pixel.png" }, cookie),
    )
    expect(rejected.status).toBe(400)
    expect(database.select().from(schema.user).get()?.image).toBeNull()

    const accepted = await auth.handler(
      authRequest("/update-user", { image: managedImage }, cookie),
    )
    expect(accepted.status).toBe(200)
    expect(database.select().from(schema.user).get()?.image).toBe(managedImage)
  })
})
