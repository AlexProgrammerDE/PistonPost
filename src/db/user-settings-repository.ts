import { Effect } from "effect"

import type { D1DatabaseClient } from "@/db/d1-database"
import type { SqliteDatabaseClient } from "@/db/database"
import {
  RepositoryError,
  type EmailNotificationPreference,
  type NotificationPreference,
} from "@/domain"

import * as schema from "./schema"

type Database = D1DatabaseClient | SqliteDatabaseClient
type UserSettingsInsert = typeof schema.userSettings.$inferInsert
export type EmailPreferenceChangeSource = "settings" | "email-link" | "one-click"
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

function isEmailPreference(
  preference: NotificationPreference,
): preference is EmailNotificationPreference {
  return preference.endsWith("-email")
}

function isD1Database(database: Database): database is D1DatabaseClient {
  return "batch" in database
}

export function createUserSettingsRepository(database: Database) {
  return {
    setNotificationPreference: Effect.fn("UserSettingsRepository.setNotificationPreference")(
      function* (
        userId: string,
        preference: NotificationPreference,
        enabled: boolean,
        source: EmailPreferenceChangeSource = "settings",
      ) {
        const values = preferenceValues(preference, enabled)
        yield* Effect.tryPromise({
          try: async () => {
            if (isD1Database(database)) {
              const updatePreference = database
                .insert(schema.userSettings)
                .values({ userId, ...values })
                .onConflictDoUpdate({
                  target: schema.userSettings.userId,
                  set: { ...values, updatedAt: new Date() },
                })
              if (!isEmailPreference(preference)) {
                await updatePreference
                return
              }
              await database.batch([
                updatePreference,
                database.insert(schema.emailPreferenceChanges).values({
                  id: crypto.randomUUID(),
                  userId,
                  preference,
                  enabled,
                  source,
                }),
              ])
              return
            }

            database.transaction((transaction) => {
              transaction
                .insert(schema.userSettings)
                .values({ userId, ...values })
                .onConflictDoUpdate({
                  target: schema.userSettings.userId,
                  set: { ...values, updatedAt: new Date() },
                })
                .run()
              if (isEmailPreference(preference)) {
                transaction
                  .insert(schema.emailPreferenceChanges)
                  .values({
                    id: crypto.randomUUID(),
                    userId,
                    preference,
                    enabled,
                    source,
                  })
                  .run()
              }
            })
          },
          catch: repositoryError,
        })
      },
    ),
  }
}
