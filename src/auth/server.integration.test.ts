import { afterEach, describe, expect, it } from "bun:test"

import { createMigratedTestDatabase, schema } from "@/db"

import { createAuth, type AuthenticationEmail } from "./server"

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

function responseCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ")
}

function stringProperty(value: unknown, property: string) {
  if (typeof value !== "object" || value === null) return undefined
  const result = Reflect.get(value, property)
  return typeof result === "string" ? result : undefined
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
      isManagedUserAvatar: async () => false,
      sendEmail: async () => {},
    })

    expect(auth.options).toMatchObject({ advanced: { database: { joins: true } } })

    const pluginIds = auth.options.plugins?.map((plugin) => plugin.id) ?? []
    expect(pluginIds).toContain("dash")
    expect(pluginIds).toContain("sentinel")
    expect(pluginIds).not.toContain("magic-link")
  })

  it("serves the Better Auth OpenAPI schema", async () => {
    const { auth } = setup()

    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/open-api/generate-schema"),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
  })

  it("hands Better Auth background work to the configured runtime handler", () => {
    const database = createMigratedTestDatabase()
    databases.push(database)
    const scheduled: Array<Promise<unknown>> = []
    const handler = (promise: Promise<unknown>) => scheduled.push(promise)
    const auth = createAuth({
      database,
      baseURL: "http://localhost:3000",
      betterAuthApiKey: "test-only-better-auth-api-key",
      secret: "test-only-auth-secret-at-least-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      turnstileSecret: "not-used-in-this-test",
      production: false,
      infraEnabled: false,
      isManagedUserAvatar: async () => false,
      sendEmail: async () => {},
      backgroundTasks: { handler },
    })

    auth.options.advanced?.backgroundTasks?.handler(Promise.resolve())
    expect(scheduled).toHaveLength(1)
  })

  it("registers an unverified user and dispatches a verification code", async () => {
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
    expect(emails.map((email) => email.content.template)).toEqual(["email-otp"])
    expect(emails[0]?.content).toMatchObject({
      template: "email-otp",
      purpose: "email-verification",
      email: "avery@example.com",
      expirationMinutes: 5,
    })
  })

  it("automatically signs in a user after email OTP verification", async () => {
    const { auth, database, emails } = setup()
    await auth.handler(
      authRequest("/sign-up/email", {
        name: "Verified User",
        username: "verified-user",
        email: "verified@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    const verificationEmail = emails[0]?.content
    if (verificationEmail?.template !== "email-otp") {
      throw new Error("The verification email did not include an email OTP.")
    }

    const verificationResponse = await auth.handler(
      authRequest("/email-otp/verify-email", {
        email: "verified@example.com",
        otp: verificationEmail.code,
      }),
    )
    const cookie = responseCookie(verificationResponse)

    expect(verificationResponse.status).toBe(200)
    expect(cookie).toContain("pistonpost.session_token=")
    expect(database.select().from(schema.user).get()?.emailVerified).toBeTrue()
    expect(database.select().from(schema.session).all()).toHaveLength(1)

    const sessionResponse = await auth.handler(sessionRequest(cookie))
    expect(await sessionResponse.json()).toMatchObject({
      user: { email: "verified@example.com", emailVerified: true },
    })
  })

  it("signs an existing user in with an emailed code", async () => {
    const { auth, database, emails } = setup()
    await auth.handler(
      authRequest("/sign-up/email", {
        name: "Email Code User",
        username: "email-code-user",
        email: "code@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    database.update(schema.user).set({ emailVerified: true }).run()
    emails.length = 0

    const sendResponse = await auth.handler(
      authRequest("/email-otp/send-verification-otp", {
        email: "code@example.com",
        type: "sign-in",
      }),
    )
    const signInEmail = emails[0]?.content
    if (signInEmail?.template !== "email-otp") {
      throw new Error("The email code sign-in did not dispatch an OTP.")
    }

    expect(sendResponse.status).toBe(200)
    expect(signInEmail.purpose).toBe("sign-in")

    const signInResponse = await auth.handler(
      authRequest("/sign-in/email-otp", {
        email: "code@example.com",
        otp: signInEmail.code,
      }),
    )
    const cookie = responseCookie(signInResponse)

    expect(signInResponse.status).toBe(200)
    expect(cookie).toContain("pistonpost.session_token=")
    expect(await (await auth.handler(sessionRequest(cookie))).json()).toMatchObject({
      user: { email: "code@example.com", emailVerified: true },
    })
  })

  it("resets a password with an emailed code", async () => {
    const { auth, database, emails } = setup()
    await auth.handler(
      authRequest("/sign-up/email", {
        name: "Email OTP Recovery",
        username: "email-otp-recovery",
        email: "recovery@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    database.update(schema.user).set({ emailVerified: true }).run()
    emails.length = 0

    const requestResponse = await auth.handler(
      authRequest("/email-otp/request-password-reset", {
        email: "recovery@example.com",
      }),
    )
    const passwordResetEmail = emails[0]?.content
    if (passwordResetEmail?.template !== "email-otp") {
      throw new Error("Password recovery did not dispatch an email OTP.")
    }

    const resetResponse = await auth.handler(
      authRequest("/email-otp/reset-password", {
        email: "recovery@example.com",
        otp: passwordResetEmail.code,
        password: "new-correct-horse-battery-staple",
      }),
    )
    const signInResponse = await auth.handler(
      authRequest("/sign-in/email", {
        email: "recovery@example.com",
        password: "new-correct-horse-battery-staple",
      }),
    )

    expect(requestResponse.status).toBe(200)
    expect(passwordResetEmail.purpose).toBe("forget-password")
    expect(resetResponse.status).toBe(200)
    expect(responseCookie(signInResponse)).toContain("pistonpost.session_token=")
  })

  it("completes a password sign-in with an emailed second factor", async () => {
    const { auth, database, emails } = setup()
    await auth.handler(
      authRequest("/sign-up/email", {
        name: "Two Factor User",
        username: "two-factor-user",
        email: "two-factor@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    database.update(schema.user).set({ emailVerified: true }).run()
    const initialSignIn = await auth.handler(
      authRequest("/sign-in/email", {
        email: "two-factor@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    const initialCookie = responseCookie(initialSignIn)

    const enableResponse = await auth.handler(
      authRequest(
        "/two-factor/enable",
        { password: "correct-horse-battery-staple" },
        initialCookie,
      ),
    )
    const enableBody: unknown = await enableResponse.json()
    const totpUri = stringProperty(enableBody, "totpURI")
    if (!totpUri) throw new Error("Two-factor enrollment did not return a TOTP URI.")

    expect(enableResponse.status).toBe(200)
    expect(new URL(totpUri).protocol).toBe("otpauth:")
    expect(database.select().from(schema.twoFactor).get()?.verified).toBeFalse()

    database.update(schema.user).set({ twoFactorEnabled: true }).run()
    database.update(schema.twoFactor).set({ verified: true }).run()
    emails.length = 0

    const challengedSignIn = await auth.handler(
      authRequest("/sign-in/email", {
        email: "two-factor@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    const challengeBody: unknown = await challengedSignIn.clone().json()
    const challengeCookie = responseCookie(challengedSignIn)

    expect(challengeBody).toMatchObject({
      twoFactorRedirect: true,
      twoFactorMethods: ["totp", "otp"],
    })
    expect(challengeCookie).toContain("pistonpost.session_token=;")
    expect(challengeCookie).toContain("pistonpost.two_factor=")

    const sendOtpResponse = await auth.handler(
      authRequest("/two-factor/send-otp", { trustDevice: false }, challengeCookie),
    )
    const secondFactorEmail = emails[0]?.content
    if (secondFactorEmail?.template !== "two-factor-otp") {
      throw new Error("The two-factor challenge did not dispatch an email code.")
    }
    const verifyOtpResponse = await auth.handler(
      authRequest(
        "/two-factor/verify-otp",
        { code: secondFactorEmail.code, trustDevice: false },
        challengeCookie,
      ),
    )
    const authenticatedCookie = responseCookie(verifyOtpResponse)

    expect(sendOtpResponse.status).toBe(200)
    expect(secondFactorEmail.expirationMinutes).toBe(3)
    expect(verifyOtpResponse.status).toBe(200)
    expect(authenticatedCookie).toContain("pistonpost.session_token=")
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
      production: true,
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
    const changeApprovalEmail = emails[0]?.content
    if (changeApprovalEmail?.template !== "email-change-approval") {
      throw new Error("The email change approval did not include a confirmation link.")
    }
    expect(changeApprovalEmail.currentEmail).toBe("current@example.com")
    expect(changeApprovalEmail.newEmail).toBe("next@example.com")
    expect(changeApprovalEmail.url).toContain("/api/auth/verify-email")
  })

  it("routes account deletion confirmation through the authenticated redirect view", async () => {
    const { auth, database, emails } = setup()
    await auth.handler(
      authRequest("/sign-up/email", {
        name: "Account Deletion Tester",
        username: "account-deletion-tester",
        email: "delete@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    database.update(schema.user).set({ emailVerified: true }).run()

    const signInResponse = await auth.handler(
      authRequest("/sign-in/email", {
        email: "delete@example.com",
        password: "correct-horse-battery-staple",
      }),
    )
    const cookie = signInResponse.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ")
    emails.length = 0

    const response = await auth.handler(authRequest("/delete-user", { callbackURL: "/" }, cookie))

    expect(response.status).toBe(200)
    expect(emails).toHaveLength(1)
    expect(emails[0]?.content.template).toBe("account-deletion")

    const deletionEmail = emails[0]?.content
    if (deletionEmail?.template !== "account-deletion") {
      throw new Error("The account deletion email did not include a confirmation link.")
    }

    const authenticatedRedirect = new URL(deletionEmail.url)
    expect(authenticatedRedirect.pathname).toBe("/auth/redirect")

    const callbackPath = authenticatedRedirect.searchParams.get("redirectTo")
    if (!callbackPath) throw new Error("The authenticated redirect did not include its callback.")
    expect(callbackPath).toStartWith("/api/auth/delete-user/callback?")

    const deletionResponse = await auth.handler(
      new Request(new URL(callbackPath, "http://localhost:3000"), {
        headers: { cookie, origin: "http://localhost:3000" },
      }),
    )

    expect(deletionResponse.status).toBe(302)
    expect(deletionResponse.headers.get("location")).toBe("/")
    expect(database.select().from(schema.user).all()).toHaveLength(0)
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
