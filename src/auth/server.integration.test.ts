import { afterEach, describe, expect, it } from "bun:test"

import { eq } from "drizzle-orm"

import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"
import { isValidUsername } from "@/domain/validation"

import { initializeUserProfile } from "./profile"
import { createAuth, type AuthenticationEmail } from "./server"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []

afterEach(() => {
  for (const database of databases) {
    database.$client.close()
  }
  databases.length = 0
})

function setup(
  isManagedUserAvatar: (userId: string, image: string) => Promise<boolean> = () =>
    Promise.resolve(false),
  options: { readonly production?: boolean } = {},
) {
  const database = createMigratedTestDatabase()
  const emails: AuthenticationEmail[] = []
  databases.push(database)
  const auth = createAuth({
    database,
    baseURL: "http://localhost:3000",
    betterAuthApiKey: "test-only-better-auth-api-key",
    secret: "test-only-auth-secret-at-least-32-characters",
    trustedOrigins: ["http://localhost:3000"],
    turnstileSecret: options.production ? "1x0000000000000000000000000000000AA" : "unused",
    production: options.production ?? false,
    infraEnabled: false,
    isManagedUserAvatar,
    initializeProfile: (user) => initializeUserProfile(database, user),
    sendEmail: (email) => {
      emails.push(email)
      return Promise.resolve()
    },
  })
  return { auth, database, emails }
}

type TestAuth = ReturnType<typeof setup>

async function signUpAndSignIn(
  { auth, database, emails }: TestAuth,
  account: { readonly email: string; readonly username?: string },
) {
  const signUp = await auth.handler(
    authRequest("/sign-up/email", {
      name: "Test User",
      ...(account.username === undefined ? {} : { username: account.username }),
      email: account.email,
      password: "correct-horse-battery-staple",
    }),
  )
  if (!signUp.ok) throw new Error(`Sign-up failed with ${signUp.status.toString()}.`)
  database
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.email, account.email.toLowerCase()))
    .run()
  const signIn = await auth.handler(
    authRequest("/sign-in/email", {
      email: account.email,
      password: "correct-horse-battery-staple",
    }),
  )
  emails.length = 0
  return responseCookie(signIn)
}

function lastEmailCode(emails: readonly AuthenticationEmail[], to: string) {
  const content = emails.findLast((email) => email.to === to)?.content
  if (content?.template !== "email-otp") throw new Error(`No email code was sent to ${to}.`)
  return content
}

async function sessionBody(auth: TestAuth["auth"], cookie: string) {
  const response = await auth.handler(sessionRequest(cookie))
  const body: unknown = await response.json()
  return body
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
  if (typeof value !== "object" || value === null) return
  const result: unknown = Reflect.get(value, property)
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
      isManagedUserAvatar: () => Promise.resolve(false),
      sendEmail: async () => {},
    })

    expect(auth.options).toMatchObject({ advanced: { database: { joins: true } } })

    const pluginIds = auth.options.plugins.map((plugin) => plugin.id)
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
    const scheduled: Promise<unknown>[] = []
    const handler = (promise: Promise<unknown>) => {
      scheduled.push(promise)
    }
    const auth = createAuth({
      database,
      baseURL: "http://localhost:3000",
      betterAuthApiKey: "test-only-better-auth-api-key",
      secret: "test-only-auth-secret-at-least-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      turnstileSecret: "not-used-in-this-test",
      production: false,
      infraEnabled: false,
      isManagedUserAvatar: () => Promise.resolve(false),
      sendEmail: async () => {},
      backgroundTasks: { handler },
    })

    auth.options.advanced.backgroundTasks?.handler(Promise.resolve())
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
    expect(await sessionResponse.json<unknown>()).toMatchObject({
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
    expect(await (await auth.handler(sessionRequest(cookie))).json<unknown>()).toMatchObject({
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
      isManagedUserAvatar: () => Promise.resolve(false),
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

  it("changes the email with codes sent to the current and the new address", async () => {
    const context = setup()
    const { auth, database, emails } = context
    const cookie = await signUpAndSignIn(context, {
      email: "current@example.com",
      username: "email-change-tester",
    })

    // The settings card asks for a "change-email" code for the current address.
    const currentCodeResponse = await auth.handler(
      authRequest(
        "/email-otp/send-verification-otp",
        { email: "current@example.com", type: "change-email" },
        cookie,
      ),
    )
    expect(currentCodeResponse.status).toBe(200)
    const currentCode = lastEmailCode(emails, "current@example.com")

    const requestResponse = await auth.handler(
      authRequest(
        "/email-otp/request-email-change",
        { newEmail: "next@example.com", otp: currentCode.code },
        cookie,
      ),
    )
    expect(requestResponse.status).toBe(200)
    const newCode = lastEmailCode(emails, "next@example.com")
    expect(newCode.purpose).toBe("change-email")

    const changeResponse = await auth.handler(
      authRequest(
        "/email-otp/change-email",
        { newEmail: "next@example.com", otp: newCode.code },
        cookie,
      ),
    )
    expect(changeResponse.status).toBe(200)
    expect(database.select().from(schema.user).get()).toMatchObject({
      email: "next@example.com",
      emailVerified: true,
    })
    expect(await sessionBody(auth, cookie)).toMatchObject({
      user: { email: "next@example.com" },
    })
  })

  it("requires the current address code before it sends a code to the new address", async () => {
    const context = setup()
    const { auth, database, emails } = context
    const cookie = await signUpAndSignIn(context, { email: "owner@example.com" })

    const response = await auth.handler(
      authRequest("/email-otp/request-email-change", { newEmail: "thief@example.com" }, cookie),
    )

    expect(response.status).toBe(400)
    expect(emails).toHaveLength(0)
    expect(database.select().from(schema.user).get()?.email).toBe("owner@example.com")
  })

  it("does not send a change-email code for another account's address", async () => {
    const context = setup()
    const { auth, emails } = context
    await signUpAndSignIn(context, { email: "victim@example.com" })
    const cookie = await signUpAndSignIn(context, { email: "attacker@example.com" })

    const response = await auth.handler(
      authRequest(
        "/email-otp/send-verification-otp",
        { email: "victim@example.com", type: "change-email" },
        cookie,
      ),
    )

    expect(response.status).toBe(400)
    expect(emails).toHaveLength(0)
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
    const { auth, database } = setup((_userId, image) => Promise.resolve(image === managedImage))
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

  it("asks a two-factor user for the second factor after an email code sign-in", async () => {
    const context = setup()
    const { auth, database, emails } = context
    await signUpAndSignIn(context, { email: "guarded@example.com" })
    database.delete(schema.session).run()
    database.update(schema.user).set({ twoFactorEnabled: true }).run()

    await auth.handler(
      authRequest("/email-otp/send-verification-otp", {
        email: "guarded@example.com",
        type: "sign-in",
      }),
    )
    const signInCode = lastEmailCode(emails, "guarded@example.com")
    const signInResponse = await auth.handler(
      authRequest("/sign-in/email-otp", { email: "guarded@example.com", otp: signInCode.code }),
    )
    const challengeCookie = responseCookie(signInResponse)

    expect(await signInResponse.clone().json<unknown>()).toMatchObject({
      twoFactorRedirect: true,
      twoFactorMethods: ["otp"],
    })
    expect(challengeCookie).toContain("pistonpost.session_token=;")
    expect(challengeCookie).toContain("pistonpost.two_factor=")
    expect(database.select().from(schema.session).all()).toHaveLength(0)
    expect(await sessionBody(auth, challengeCookie)).toBeNull()

    emails.length = 0
    await auth.handler(authRequest("/two-factor/send-otp", { trustDevice: false }, challengeCookie))
    const secondFactor = emails[0]?.content
    if (secondFactor?.template !== "two-factor-otp") {
      throw new Error("The two-factor challenge did not dispatch an email code.")
    }
    const verifyResponse = await auth.handler(
      authRequest(
        "/two-factor/verify-otp",
        { code: secondFactor.code, trustDevice: false },
        challengeCookie,
      ),
    )
    expect(verifyResponse.status).toBe(200)
    expect(await sessionBody(auth, responseCookie(verifyResponse))).toMatchObject({
      user: { email: "guarded@example.com" },
    })
  })

  it("does not sign a two-factor user in through email verification codes", async () => {
    const context = setup()
    const { auth, database, emails } = context
    await signUpAndSignIn(context, { email: "verified-guard@example.com" })
    database.delete(schema.session).run()
    database.update(schema.user).set({ twoFactorEnabled: true }).run()

    await auth.handler(
      authRequest("/email-otp/send-verification-otp", {
        email: "verified-guard@example.com",
        type: "email-verification",
      }),
    )
    const code = lastEmailCode(emails, "verified-guard@example.com")
    const response = await auth.handler(
      authRequest("/email-otp/verify-email", {
        email: "verified-guard@example.com",
        otp: code.code,
      }),
    )

    expect(await response.clone().json<unknown>()).toMatchObject({ twoFactorRedirect: true })
    expect(database.select().from(schema.session).all()).toHaveLength(0)
  })

  it("applies revoked sessions, bans, and role changes on the next session read", async () => {
    const context = setup()
    const { auth, database } = context
    const cookie = await signUpAndSignIn(context, { email: "fresh@example.com" })
    const headers = new Headers({ cookie })

    expect(await auth.api.getSession({ headers })).toMatchObject({ user: { role: "user" } })

    database.update(schema.user).set({ role: "admin" }).run()
    expect(await auth.api.getSession({ headers })).toMatchObject({ user: { role: "admin" } })

    database.update(schema.user).set({ banned: true }).run()
    expect(await auth.api.getSession({ headers })).toMatchObject({ user: { banned: true } })

    database.delete(schema.session).run()
    expect(await auth.api.getSession({ headers })).toBeNull()
    expect(await sessionBody(auth, cookie)).toBeNull()
  })

  it("keeps the profile username in step with Better Auth username changes", async () => {
    const context = setup()
    const { auth, database } = context
    const cookie = await signUpAndSignIn(context, { email: "rename@example.com", username: "Old" })
    const userId = database.select().from(schema.user).get()?.id
    if (!userId) throw new Error("The user was not created.")

    expect(
      database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).get(),
    ).toMatchObject({ username: "Old", normalizedUsername: "old" })

    const response = await auth.handler(
      authRequest("/update-user", { username: "NewName", displayUsername: "NewName" }, cookie),
    )

    expect(response.status).toBe(200)
    expect(database.select().from(schema.user).get()).toMatchObject({
      username: "newname",
      displayUsername: "NewName",
    })
    expect(
      database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).get(),
    ).toMatchObject({ username: "NewName", normalizedUsername: "newname" })
  })

  it("rejects a username change that collides with another profile", async () => {
    const context = setup()
    const { auth, database } = context
    await signUpAndSignIn(context, { email: "first@example.com", username: "taken" })
    // A profile can own a name that no Better Auth user row carries.
    database
      .update(schema.user)
      .set({ username: "renamed", displayUsername: "renamed" })
      .where(eq(schema.user.email, "first@example.com"))
      .run()
    const cookie = await signUpAndSignIn(context, {
      email: "second@example.com",
      username: "other",
    })

    const response = await auth.handler(authRequest("/update-user", { username: "Taken" }, cookie))

    expect(response.status).toBe(400)
    expect(
      database
        .select({ username: schema.user.username })
        .from(schema.user)
        .where(eq(schema.user.email, "second@example.com"))
        .get(),
    ).toEqual({ username: "other" })
    expect(
      database
        .select({ username: schema.profiles.normalizedUsername })
        .from(schema.profiles)
        .all()
        .map(({ username }) => username)
        .toSorted(),
    ).toEqual(["other", "taken"])
  })

  it("rejects a sign-up whose username another profile owns", async () => {
    const context = setup()
    const { auth, database } = context
    await signUpAndSignIn(context, { email: "owner@example.com", username: "claimed" })
    database
      .update(schema.user)
      .set({ username: null, displayUsername: null })
      .where(eq(schema.user.email, "owner@example.com"))
      .run()

    const response = await auth.handler(
      authRequest("/sign-up/email", {
        name: "Late User",
        username: "Claimed",
        email: "late@example.com",
        password: "correct-horse-battery-staple",
      }),
    )

    expect(response.status).toBe(400)
    expect(database.select().from(schema.user).all()).toHaveLength(1)
  })

  it("gives every new account a valid, unique profile username", async () => {
    const context = setup()
    const { database } = context
    await signUpAndSignIn(context, { email: "Same.Name+tag@example.com" })
    await signUpAndSignIn(context, { email: "same.name+tag@example.org" })
    await signUpAndSignIn(context, { email: "+@example.net" })

    const usernames = database
      .select({
        username: schema.profiles.username,
        normalized: schema.profiles.normalizedUsername,
      })
      .from(schema.profiles)
      .all()

    expect(database.select().from(schema.user).all()).toHaveLength(3)
    expect(usernames).toHaveLength(3)
    expect(new Set(usernames.map(({ normalized }) => normalized)).size).toBe(3)
    expect(usernames.map(({ username }) => username)).toContain("same.name-tag")
    expect(usernames.some(({ username }) => /^same\.name-tag-[0-9a-f]{6}$/u.test(username))).toBe(
      true,
    )
    expect(usernames.map(({ username }) => username)).toContain("user")
    for (const { username } of usernames) expect(isValidUsername(username)).toBe(true)
  })

  it("requires a captcha on every sign-in, sign-up, and recovery entry point", async () => {
    const { auth, database, emails } = setup(() => Promise.resolve(false), { production: true })
    const protectedRequests = [
      ["/sign-up/email", { name: "Bot", email: "bot@example.com", password: "long-password-1" }],
      ["/sign-in/email", { email: "bot@example.com", password: "long-password-1" }],
      ["/sign-in/username", { username: "bot", password: "long-password-1" }],
      ["/request-password-reset", { email: "bot@example.com" }],
      ["/email-otp/send-verification-otp", { email: "bot@example.com", type: "sign-in" }],
      ["/email-otp/send-verification-otp", { email: "bot@example.com", type: "forget-password" }],
      ["/email-otp/request-password-reset", { email: "bot@example.com" }],
      ["/forget-password/email-otp", { email: "bot@example.com" }],
    ] as const

    const responses = await Promise.all(
      protectedRequests.map(async ([path, body]) => {
        const response = await auth.handler(authRequest(path, body))
        const responseBody: unknown = await response.json()
        return { path, status: response.status, body: responseBody }
      }),
    )
    for (const response of responses) {
      expect(response).toMatchObject({ status: 400, body: { code: "MISSING_RESPONSE" } })
    }
    expect(database.select().from(schema.user).all()).toHaveLength(0)
    expect(emails).toHaveLength(0)
  })

  it("lets verification codes through without a captcha", async () => {
    const { auth } = setup(() => Promise.resolve(false), { production: true })

    const response = await auth.handler(
      authRequest("/email-otp/send-verification-otp", {
        email: "nobody@example.com",
        type: "email-verification",
      }),
    )

    expect(response.status).toBe(200)
  })
})
