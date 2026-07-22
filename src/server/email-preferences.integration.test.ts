import { afterEach, describe, expect, it } from "bun:test"

import { Effect } from "effect"

import { createUser } from "@/db/factories"
import { emailPreferenceChanges, user, userSettings } from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"
import { signUnsubscribeToken } from "@/email"

import { parseOneClickUnsubscribeRequest } from "./email-one-click"
import { applyUnsubscribeToken } from "./email-preference-service"

const secret = "test-only-unsubscribe-secret-at-least-32-characters"
const rotatedSecret = "test-only-current-unsubscribe-secret-at-least-32-characters"
let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

describe("email unsubscribe preferences", () => {
  it("accepts a retained signing key, disables only its category, and records the change", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    database.insert(user).values(createUser()).run()
    database.insert(userSettings).values({ userId: "test-user" }).run()
    const token = await Effect.runPromise(
      signUnsubscribeToken("test-user", "comment-email", secret),
    )

    const preference = await Effect.runPromise(
      applyUnsubscribeToken(database, token, [rotatedSecret, secret], "one-click"),
    )

    expect(preference).toBe("comment-email")
    expect(database.select().from(userSettings).get()).toMatchObject({
      commentNotifications: false,
      replyNotifications: true,
      productNotifications: false,
    })
    expect(database.select().from(emailPreferenceChanges).get()).toMatchObject({
      userId: "test-user",
      preference: "comment-email",
      enabled: false,
      source: "one-click",
    })
  })

  it("treats an unsubscribe for a deleted account as complete", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    const token = await Effect.runPromise(
      signUnsubscribeToken("deleted-user", "reply-email", secret),
    )

    const result = await Effect.runPromise(
      applyUnsubscribeToken(database, token, [secret], "one-click"),
    )

    expect(result).toBe("reply-email")
    expect(database.select().from(emailPreferenceChanges).all()).toHaveLength(0)
  })
})

describe("one-click unsubscribe request", () => {
  it("accepts only the RFC 8058 form field and the exact signed URL", async () => {
    const valid = await parseOneClickUnsubscribeRequest(
      new Request("https://post.pistonmaster.net/email/unsubscribe?token=signed", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    )
    const invalid = await parseOneClickUnsubscribeRequest(
      new Request("https://post.pistonmaster.net/email/unsubscribe?token=signed", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click&return=/settings",
      }),
    )

    expect(valid).toEqual({ kind: "valid", token: "signed" })
    expect(invalid).toEqual({ kind: "invalid", status: 400 })
  })
})
