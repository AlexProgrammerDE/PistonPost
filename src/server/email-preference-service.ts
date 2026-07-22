import { eq } from "drizzle-orm"
import { Effect } from "effect"

import type { D1DatabaseClient } from "@/db/d1-database"
import type { SqliteDatabaseClient } from "@/db/database"
import * as schema from "@/db/schema"
import {
  createUserSettingsRepository,
  type EmailPreferenceChangeSource,
} from "@/db/user-settings-repository"
import { verifyUnsubscribeToken } from "@/email"

type PreferenceDatabase = D1DatabaseClient | SqliteDatabaseClient

function repositoryQueryError(cause: unknown) {
  return cause instanceof Error ? cause : new Error("The email preference could not be loaded.")
}

async function userExists(database: PreferenceDatabase, userId: string) {
  if ("batch" in database) {
    return Boolean(
      await database
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .get(),
    )
  }
  return Boolean(
    database
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .get(),
  )
}

export const applyUnsubscribeToken = Effect.fn("EmailPreferences.applyUnsubscribeToken")(function* (
  database: PreferenceDatabase,
  token: string,
  verificationKeys: readonly [string, ...string[]],
  source: EmailPreferenceChangeSource,
) {
  const claims = yield* Effect.firstSuccessOf(
    verificationKeys.map((secret) => verifyUnsubscribeToken(token, secret)),
  )
  const recipientExists = yield* Effect.tryPromise({
    try: () => userExists(database, claims.userId),
    catch: repositoryQueryError,
  })
  if (!recipientExists) return claims.preference

  const repository = createUserSettingsRepository(database)
  yield* repository.setNotificationPreference(claims.userId, claims.preference, false, source)
  return claims.preference
})
