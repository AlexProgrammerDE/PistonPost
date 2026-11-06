import { createServerFn } from "@tanstack/react-start"
import { and, eq, ne } from "drizzle-orm"
import { Schema } from "effect"

import * as schema from "@/db/schema"
import { createUserSettingsRepository } from "@/db/user-settings-repository"
import { notificationPreferenceSchema, usernameSchema } from "@/domain"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { conflictFailure, notFoundFailure, runServerEffect } from "@/server/server-function-failure"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"

export const getMyProductSettings = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .handler(async ({ context }) => {
    const { database, session } = context
    const row = await database
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
      .get()
    if (!row) throw notFoundFailure("Profile settings were not found.")
    return {
      ...row,
      commentNotifications: row.commentNotifications ?? true,
      replyNotifications: row.replyNotifications ?? true,
      productNotifications: row.productNotifications ?? false,
      commentPushNotifications: row.commentPushNotifications ?? true,
      replyPushNotifications: row.replyPushNotifications ?? true,
      vapidPublicKey: context.env.VAPID_PUBLIC_KEY.trim() || null,
    }
  })

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        name: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(80)),
        username: usernameSchema,
        bio: Schema.Trim.check(Schema.isMaxLength(500)),
        website: Schema.Union([
          Schema.Literal(""),
          Schema.String.check(
            Schema.makeFilter((value) => URL.canParse(value) || "Invalid URL"),
          ).check(Schema.isMaxLength(500)),
        ]),
        location: Schema.Trim.check(Schema.isMaxLength(100)),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const normalizedUsername = data.username.toLocaleLowerCase("en-US")
    const collision = await database
      .select({ userId: schema.profiles.userId })
      .from(schema.profiles)
      .where(
        and(
          eq(schema.profiles.normalizedUsername, normalizedUsername),
          ne(schema.profiles.userId, session.user.id),
        ),
      )
      .get()
    if (collision) throw conflictFailure("That username is already in use.")
    await database.batch([
      database
        .update(schema.user)
        .set({ name: data.name, username: data.username, displayUsername: data.username })
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
    ])
    return { username: data.username }
  })

const notificationPreferenceInputSchema = Schema.Struct({
  preference: notificationPreferenceSchema,
  enabled: Schema.Boolean,
})

export const updateNotificationPreference = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(notificationPreferenceInputSchema))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const repository = createUserSettingsRepository(database)
    await runServerEffect(
      repository.setNotificationPreference(session.user.id, data.preference, data.enabled),
    )
    return data
  })
