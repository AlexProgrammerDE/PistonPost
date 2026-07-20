import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { IMAGE_UPLOAD_MIME_TYPES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/uploads/image-upload-policy"
import { assertMutationOrigin, requireRequestSession } from "@/server/session"

import { mediaCleanupJob } from "./jobs"

const avatarIntentInput = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(IMAGE_UPLOAD_MIME_TYPES),
  byteSize: z.number().int().min(1).max(MAX_IMAGE_UPLOAD_BYTES),
})

export const createAvatarUploadIntent = createServerFn({ method: "POST" })
  .validator(avatarIntentInput)
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const rateLimit = await context.env.UPLOAD_RATE_LIMITER.limit({
      key: `avatar-intent:${session.user.id}`,
    })
    if (!rateLimit.success) {
      throw new Error("Too many uploads were started at once. Wait a minute and try again.")
    }

    const database = createD1Database(context.env.DB)
    const profile = await database
      .select({ userId: schema.profiles.userId })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, session.user.id))
      .get()
    if (!profile) throw new Error("Your profile could not be found.")

    const assetId = crypto.randomUUID()
    await database.insert(schema.mediaAssets).values({
      id: assetId,
      ownerId: session.user.id,
      kind: "avatar",
      provider: "r2",
      status: "pending",
      originalFilename: data.filename,
      mimeType: data.mimeType,
      byteSize: data.byteSize,
      providerMetadata: { expiresAt: Date.now() + 15 * 60 * 1_000 },
    })

    return {
      assetId,
      uploadUrl: `/media/upload/${assetId}`,
      expiresInSeconds: 900,
    }
  })

export const cancelAvatarUpload = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const asset = await database
      .select({ id: schema.mediaAssets.id, status: schema.mediaAssets.status })
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, data.id),
          eq(schema.mediaAssets.ownerId, session.user.id),
          eq(schema.mediaAssets.kind, "avatar"),
        ),
      )
      .get()
    if (!asset) throw new Error("The avatar upload was not found.")
    if (asset.status === "ready" || asset.status === "deleted") return { cancelled: false }

    const cleanup = mediaCleanupJob(asset.id)
    await database
      .insert(schema.outbox)
      .values({ id: cleanup.idempotencyKey, kind: cleanup.type, payload: cleanup })
      .onConflictDoNothing()
    context.executionContext.waitUntil(context.env.JOBS.send(cleanup))
    return { cancelled: true }
  })

export const deleteManagedAvatar = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async ({ context }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const database = createD1Database(context.env.DB)
    const profile = await database
      .select({
        avatarMediaId: schema.profiles.avatarMediaId,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, session.user.id))
      .get()
    if (!profile) throw new Error("Your profile could not be found.")

    const cleanup = profile.avatarMediaId ? mediaCleanupJob(profile.avatarMediaId) : null
    await database.batch([
      database
        .update(schema.profiles)
        .set({ avatarMediaId: null, legacyAvatarUrl: null, updatedAt: new Date() })
        .where(eq(schema.profiles.userId, session.user.id)),
      database.update(schema.user).set({ image: null }).where(eq(schema.user.id, session.user.id)),
      ...(cleanup
        ? [
            database
              .insert(schema.outbox)
              .values({ id: cleanup.idempotencyKey, kind: cleanup.type, payload: cleanup })
              .onConflictDoNothing(),
          ]
        : []),
      database.insert(schema.auditEvents).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        action: "avatar.deleted",
        entityType: "user",
        entityId: session.user.id,
        metadata: {},
      }),
    ])

    if (cleanup) context.executionContext.waitUntil(context.env.JOBS.send(cleanup))
    return { deleted: profile.avatarMediaId !== null }
  })
