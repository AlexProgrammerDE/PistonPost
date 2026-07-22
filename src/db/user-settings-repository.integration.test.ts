import { afterEach, describe, expect, it } from "bun:test"

import { Effect } from "effect"

import { createUser } from "./factories"
import { user, userSettings } from "./schema"
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
  })
})
