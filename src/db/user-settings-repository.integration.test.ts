import { afterEach, describe, expect, it } from "bun:test"

import { Effect } from "effect"

import { createUser } from "./factories"
import { emailPreferenceChanges, user, userSettings } from "./schema"
import { createMigratedTestDatabase } from "./test-database"
import { createUserSettingsRepository } from "./user-settings-repository"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

describe("user settings repository", () => {
  it("updates notification preferences independently", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    database.insert(user).values(createUser()).run()
    database
      .insert(userSettings)
      .values({
        userId: "test-user",
        commentNotifications: true,
        replyNotifications: false,
        productNotifications: false,
      })
      .run()
    const repository = createUserSettingsRepository(database)

    await Promise.all([
      Effect.runPromise(repository.setNotificationPreference("test-user", "comment-email", false)),
      Effect.runPromise(repository.setNotificationPreference("test-user", "product-email", true)),
    ])

    expect(database.select().from(userSettings).get()).toMatchObject({
      commentNotifications: false,
      replyNotifications: false,
      productNotifications: true,
      commentPushNotifications: true,
      replyPushNotifications: true,
    })
    expect(database.select().from(emailPreferenceChanges).all()).toEqual([
      expect.objectContaining({
        userId: "test-user",
        preference: "comment-email",
        enabled: false,
        source: "settings",
      }),
      expect.objectContaining({
        userId: "test-user",
        preference: "product-email",
        enabled: true,
        source: "settings",
      }),
    ])
  })

  it("records the source for an email-link opt-out but not for push changes", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    database.insert(user).values(createUser()).run()
    const repository = createUserSettingsRepository(database)

    await Effect.runPromise(
      repository.setNotificationPreference("test-user", "reply-email", false, "email-link"),
    )
    await Effect.runPromise(
      repository.setNotificationPreference("test-user", "reply-push", false, "settings"),
    )

    expect(database.select().from(emailPreferenceChanges).all()).toEqual([
      expect.objectContaining({
        preference: "reply-email",
        enabled: false,
        source: "email-link",
      }),
    ])

    database.delete(user).run()
    expect(database.select().from(emailPreferenceChanges).all()).toHaveLength(0)
  })
})
