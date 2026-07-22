import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Effect } from "effect"

import { RepositoryError, type NotificationPreference } from "@/domain"

import * as schema from "./schema"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>
type UserSettingsInsert = typeof schema.userSettings.$inferInsert
type NotificationPreferenceValues = Partial<
  Pick<
    UserSettingsInsert,
    | "commentNotifications"
    | "replyNotifications"
    | "productNotifications"
    | "commentPushNotifications"
    | "replyPushNotifications"
  >
>

function preferenceValues(
  preference: NotificationPreference,
  enabled: boolean,
): NotificationPreferenceValues {
  switch (preference) {
    case "comment-email":
      return { commentNotifications: enabled }
    case "reply-email":
      return { replyNotifications: enabled }
    case "product-email":
      return { productNotifications: enabled }
    case "comment-push":
      return { commentPushNotifications: enabled }
    case "reply-push":
      return { replyPushNotifications: enabled }
  }
  const exhaustivePreference: never = preference
  return exhaustivePreference
}

function repositoryError(cause: unknown) {
  return new RepositoryError({
    operation: "userSettings.setNotificationPreference",
    message: cause instanceof Error ? cause.message : "The database operation failed.",
  })
}

export function createUserSettingsRepository(database: Database) {
  return {
    setNotificationPreference: Effect.fn("UserSettingsRepository.setNotificationPreference")(
      function* (userId: string, preference: NotificationPreference, enabled: boolean) {
        const values = preferenceValues(preference, enabled)
        yield* Effect.tryPromise({
          try: async () => {
            await database
              .insert(schema.userSettings)
              .values({ userId, ...values })
              .onConflictDoUpdate({
                target: schema.userSettings.userId,
                set: { ...values, updatedAt: new Date() },
              })
          },
          catch: repositoryError,
        })
      },
    ),
  }
}
