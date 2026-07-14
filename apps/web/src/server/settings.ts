import { createD1Database } from "@pistonpost/db/d1-database"
import * as schema from "@pistonpost/db/schema"
import { usernameSchema } from "@pistonpost/domain"
import { createServerFn } from "@tanstack/react-start"
import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { assertMutationOrigin, requireRequestSession } from "@/server/session"

export const getMyProductSettings = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const row = await database
      .select({
        name: schema.user.name,
        username: schema.profiles.username,
        bio: schema.profiles.bio,
        website: schema.profiles.website,
        location: schema.profiles.location,
        emailNotifications: schema.userSettings.emailNotifications,
        commentNotifications: schema.userSettings.commentNotifications,
        replyNotifications: schema.userSettings.replyNotifications,
        securityNotifications: schema.userSettings.securityNotifications,
        moderationNotifications: schema.userSettings.moderationNotifications,
        productNotifications: schema.userSettings.productNotifications,
      })
      .from(schema.user)
      .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
      .leftJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
      .where(eq(schema.user.id, session.user.id))
      .get()
    if (!row) throw new Error("Profile settings were not found.")
    return {
      ...row,
      emailNotifications: row.emailNotifications ?? true,
      commentNotifications: row.commentNotifications ?? true,
      replyNotifications: row.replyNotifications ?? true,
      securityNotifications: row.securityNotifications ?? true,
      moderationNotifications: row.moderationNotifications ?? true,
      productNotifications: row.productNotifications ?? false,
    }
  },
)

export const updateProfile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(80),
      username: usernameSchema,
      bio: z.string().trim().max(500),
      website: z.union([z.literal(""), z.url().max(500)]),
      location: z.string().trim().max(100),
    }),
  )
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
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
    if (collision) throw new Error("That username is already in use.")
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

const preferencesSchema = z.object({
  emailNotifications: z.boolean(),
  commentNotifications: z.boolean(),
  replyNotifications: z.boolean(),
  securityNotifications: z.boolean(),
  moderationNotifications: z.boolean(),
  productNotifications: z.boolean(),
})

export const updateNotificationPreferences = createServerFn({ method: "POST" })
  .validator(preferencesSchema)
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    await database
      .insert(schema.userSettings)
      .values({ userId: session.user.id, ...data })
      .onConflictDoUpdate({
        target: schema.userSettings.userId,
        set: { ...data, updatedAt: new Date() },
      })
    return data
  })
