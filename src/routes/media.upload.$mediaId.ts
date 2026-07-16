import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { mediaImageUrl } from "@/lib/media-image"
import {
  MAX_IMAGE_UPLOAD_BYTES,
  imageFilenameMatchesMime,
  isImageUploadMimeType,
} from "@/lib/uploads/image-upload-policy"
import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"
import { cacheInvalidationPathsJob, mediaCleanupJob } from "@/server/jobs"

function jsonError(message: string, status: number) {
  return Response.json(
    { error: { message } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  )
}

async function uploadImage({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { mediaId: string }
}) {
  const mediaId = z.string().uuid().safeParse(params.mediaId)
  if (!mediaId.success) return jsonError("The upload intent is invalid.", 400)

  const expectedOrigin = new URL(context.runtime.config.PUBLIC_APP_URL).origin
  if (request.headers.get("origin") !== expectedOrigin)
    return jsonError("The request origin was rejected.", 403)

  const length = Number(request.headers.get("content-length"))
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_IMAGE_UPLOAD_BYTES) {
    return jsonError("The image must be no larger than 15 MB.", 413)
  }

  const auth = await createRequestAuth(context)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return jsonError("Authentication is required.", 401)
  const rateLimit = await context.env.UPLOAD_RATE_LIMITER.limit({
    key: `image-bytes:${session.user.id}`,
  })
  if (!rateLimit.success) {
    return jsonError("Too many uploads were started at once. Wait a minute and try again.", 429)
  }

  const database = createD1Database(context.env.DB)
  const asset = await database
    .select()
    .from(schema.mediaAssets)
    .where(
      and(eq(schema.mediaAssets.id, mediaId.data), eq(schema.mediaAssets.ownerId, session.user.id)),
    )
    .get()
  if (!asset) return jsonError("The upload intent was not found.", 404)
  if (asset.kind !== "image" && asset.kind !== "avatar") {
    return jsonError("The upload intent was not found.", 404)
  }
  if (asset.status === "ready") return Response.json({ assetId: asset.id, status: "ready" })
  if (asset.status !== "pending") return jsonError("The upload intent is no longer active.", 409)
  const expiresAt = asset.providerMetadata.expiresAt
  if (typeof expiresAt !== "number" || expiresAt < Date.now()) {
    return jsonError("The upload intent expired.", 410)
  }
  if (request.headers.get("content-type")?.split(";", 1)[0] !== asset.mimeType) {
    return jsonError("The upload content type did not match the intent.", 400)
  }

  const body = await request.arrayBuffer()
  if (body.byteLength !== length || body.byteLength !== asset.byteSize) {
    await database
      .update(schema.mediaAssets)
      .set({ status: "failed" })
      .where(eq(schema.mediaAssets.id, asset.id))
    return jsonError("The uploaded byte size did not match the intent.", 400)
  }

  let objectKey: string | null = null
  try {
    const info = await context.env.IMAGES.info(new Blob([body]).stream())
    if (!isImageUploadMimeType(info.format)) throw new Error("Unsupported image format")
    if (!("width" in info) || !("height" in info)) throw new Error("Image dimensions missing")
    if (info.width * info.height > 80_000_000) throw new Error("Image pixel limit exceeded")
    if (info.format !== asset.mimeType) throw new Error("Image MIME mismatch")
    if (!imageFilenameMatchesMime(asset.originalFilename, info.format))
      throw new Error("Image extension mismatch")

    const digest = await crypto.subtle.digest("SHA-256", body)
    const checksum = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
    const directory = asset.kind === "avatar" ? "avatars" : "images"
    objectKey = `users/${session.user.id}/${directory}/${asset.id}/${checksum}`
    await context.env.MEDIA.put(objectKey, body, {
      httpMetadata: { contentType: info.format },
      customMetadata: { checksum, owner: session.user.id },
    })

    const readyAsset = database
      .update(schema.mediaAssets)
      .set({
        status: "ready" as const,
        r2Key: objectKey,
        mimeType: info.format,
        byteSize: body.byteLength,
        width: info.width,
        height: info.height,
        checksum,
        finalizedAt: new Date(),
      })
      .where(eq(schema.mediaAssets.id, asset.id))

    if (asset.kind === "avatar") {
      const profile = await database
        .select({
          avatarMediaId: schema.profiles.avatarMediaId,
          username: schema.profiles.username,
        })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, session.user.id))
        .get()
      if (!profile) throw new Error("Profile missing")

      const image = mediaImageUrl(asset.id, "avatar")
      const cleanup = profile.avatarMediaId ? mediaCleanupJob(profile.avatarMediaId) : null
      const invalidate = cacheInvalidationPathsJob(`avatar:${session.user.id}`, [
        "/",
        `/user/${encodeURIComponent(profile.username)}`,
      ])
      await database.batch([
        readyAsset,
        database
          .update(schema.profiles)
          .set({
            avatarMediaId: asset.id,
            legacyAvatarUrl: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.profiles.userId, session.user.id)),
        database.update(schema.user).set({ image }).where(eq(schema.user.id, session.user.id)),
        ...(cleanup
          ? [
              database
                .insert(schema.outbox)
                .values({ id: cleanup.idempotencyKey, kind: cleanup.type, payload: cleanup })
                .onConflictDoNothing(),
            ]
          : []),
        database
          .insert(schema.outbox)
          .values({ id: invalidate.idempotencyKey, kind: invalidate.type, payload: invalidate }),
        database.insert(schema.auditEvents).values({
          id: crypto.randomUUID(),
          actorId: session.user.id,
          action: "avatar.updated",
          entityType: "media",
          entityId: asset.id,
          metadata: {},
        }),
      ])
      context.executionContext.waitUntil(
        Promise.all([
          ...(cleanup ? [context.env.JOBS.send(cleanup)] : []),
          context.env.JOBS.send(invalidate),
        ]).then(() => undefined),
      )
    } else {
      const postId = asset.providerMetadata.postId
      const ordinal = asset.providerMetadata.ordinal
      if (typeof postId !== "string" || typeof ordinal !== "number") {
        throw new Error("Image draft metadata missing")
      }
      const post = await database
        .select({ postId: schema.posts.id })
        .from(schema.posts)
        .where(
          and(
            eq(schema.posts.id, postId),
            eq(schema.posts.authorId, session.user.id),
            eq(schema.posts.type, "images"),
            eq(schema.posts.status, "draft"),
          ),
        )
        .get()
      if (!post) throw new Error("Image draft missing")

      await database.batch([
        readyAsset,
        database
          .insert(schema.postMedia)
          .values({ postId: post.postId, mediaId: asset.id, ordinal })
          .onConflictDoNothing(),
      ])
    }

    return Response.json(
      {
        assetId: asset.id,
        status: "ready",
        width: info.width,
        height: info.height,
        ...(asset.kind === "avatar" ? { image: mediaImageUrl(asset.id, "avatar") } : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch {
    if (objectKey) await context.env.MEDIA.delete(objectKey)
    await database
      .update(schema.mediaAssets)
      .set({ status: "failed" })
      .where(eq(schema.mediaAssets.id, asset.id))
    return jsonError("The image could not be validated.", 400)
  }
}

export const Route = createFileRoute("/media/upload/$mediaId")({
  server: { handlers: { PUT: uploadImage } },
})
