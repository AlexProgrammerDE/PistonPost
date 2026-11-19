import { createServerFn } from "@tanstack/react-start"
import { and, eq, ne, or } from "drizzle-orm"
import { Schema, Effect } from "effect"

import * as schema from "@/db/schema"
import { createUserSettingsRepository } from "@/db/user-settings-repository"
import {
  notificationPreferenceSchema,
  profileWebsiteSchema,
  usernameSchema,
} from "@/domain/validation"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import {
  conflictFailure,
  notFoundFailure,
  rateLimitedFailure,
} from "@/server/server-function-failure"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"

const SETTINGS_RATE_LIMIT_MESSAGE =
  "You're changing settings too fast. Wait a minute and try again."

const limitSettingsChange = Effect.fn("Settings.limitChange")(function* (
  env: Cloudflare.Env,
  action: string,
  userId: string,
) {
  const limited = yield* bindingOperation(`${action}.limited`, () =>
    env.USER_RATE_LIMITER.limit({ key: `${action}:${userId}` }),
  )
  if (!limited.success) return yield* rateLimitedFailure(SETTINGS_RATE_LIMIT_MESSAGE)
  return limited
})

export const getMyProductSettings = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .handler(({ context }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const row = yield* bindingOperation("getMyProductSettings.row", () =>
          database
            .select({
              name: schema.user.name,
              username: schema.profiles.username,
              bio: schema.profiles.bio,
              website: schema.profiles.website,
              location: schema.profiles.location,
              commentNotifications: schema.userSettings.commentNotifications,
              replyNotifications: schema.userSettings.replyNotifications,
              productNotifications: schema.userSettings.productNotifications,
              commentPushNotifications: schema.userSettings.commentPushNotifications,
              replyPushNotifications: schema.userSettings.replyPushNotifications,
            })
            .from(schema.user)
            .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
            .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
            .where(eq(schema.user.id, session.user.id))
            .get(),
        )
        if (!row) return yield* notFoundFailure("Profile settings were not found.")
        return {
          ...row,
          commentNotifications: row.commentNotifications ?? true,
          replyNotifications: row.replyNotifications ?? true,
          productNotifications: row.productNotifications ?? false,
          commentPushNotifications: row.commentPushNotifications ?? true,
          replyPushNotifications: row.replyPushNotifications ?? true,
          vapidPublicKey: context.env.VAPID_PUBLIC_KEY.trim() || null,
        }
      }),
    ),
  )

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        name: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(80)),
        username: usernameSchema,
        bio: Schema.Trim.check(Schema.isMaxLength(500)),
        website: profileWebsiteSchema,
        location: Schema.Trim.check(Schema.isMaxLength(100)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        yield* limitSettingsChange(context.env, "updateProfile", session.user.id)
        const normalizedUsername = data.username.toLocaleLowerCase("en-US")
        const [profileCollision, userCollision] = yield* bindingOperation(
          "updateProfile.collision",
          () =>
            Promise.all([
              database
                .select({ userId: schema.profiles.userId })
                .from(schema.profiles)
                .where(
                  and(
                    eq(schema.profiles.normalizedUsername, normalizedUsername),
                    ne(schema.profiles.userId, session.user.id),
                  ),
                )
                .get(),
              database
                .select({ id: schema.user.id })
                .from(schema.user)
                .where(
                  and(
                    or(
                      eq(schema.user.username, normalizedUsername),
                      eq(schema.user.username, data.username),
                    ),
                    ne(schema.user.id, session.user.id),
                  ),
                )
                .get(),
            ]),
        )
        if (profileCollision || userCollision)
          return yield* conflictFailure("That username is already in use.")
        return yield* Effect.gen(function* () {
          yield* bindingOperation("updateProfile.operation", () =>
            database.batch([
              database
                .update(schema.user)
                // Better Auth looks usernames up in lowercase. Keep the typed form for display.
                .set({
                  name: data.name,
                  username: normalizedUsername,
                  displayUsername: data.username,
                })
                .where(eq(schema.user.id, session.user.id)),
              database
                .update(schema.profiles)
                .set({
                  username: data.username,
                  normalizedUsername,
                  bio: data.bio || null,
                  website: data.website || null,
                  location: data.location || null,
                  updatedAt: new Date(),
                })
                .where(eq(schema.profiles.userId, session.user.id)),
            ]),
          )
          return { username: data.username }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

const notificationPreferenceInputSchema = Schema.Struct({
  preference: notificationPreferenceSchema,
  enabled: Schema.Boolean,
})

export const updateNotificationPreference = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(notificationPreferenceInputSchema))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        yield* limitSettingsChange(context.env, "updateNotificationPreference", session.user.id)
        const repository = createUserSettingsRepository(database)
        return yield* Effect.gen(function* () {
          yield* repository.setNotificationPreference(
            session.user.id,
            data.preference,
            data.enabled,
          )
          return data
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )
