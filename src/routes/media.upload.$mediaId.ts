import { createFileRoute } from "@tanstack/react-router"
import { and, eq, ne } from "drizzle-orm"
import { Schema, Result } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { mediaImageUrl } from "@/lib/media-image"
import { inspectGif, isGifAnimationWithinPixelLimit } from "@/lib/uploads/gif-inspection"
import { createImagePlaceholder } from "@/lib/uploads/image-placeholder.server"
import { isSanitizedImage } from "@/lib/uploads/image-sanitizer.server"
import {
  MAX_IMAGE_UPLOAD_BYTES,
  imageFilenameMatchesMime,
  isImageUploadMimeType,
} from "@/lib/uploads/image-upload-policy"
import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"
import {
  finalizeImageUploadStatements,
  reserveImageUploadKeyStatement,
} from "@/server/image-upload-statements"
import { mediaCleanupJob } from "@/server/jobs"

const usedUploadMessage =
  "This upload expired or was already used. Remove the image and add it again."

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
  const mediaId = Schema.decodeResult(Schema.String.check(Schema.isUUID()), {
    errors: "all",
  })(params.mediaId)
  if (!Result.isSuccess(mediaId)) return jsonError(usedUploadMessage, 400)

  const expectedOrigin = new URL(context.runtime.config.PUBLIC_APP_URL).origin
  if (request.headers.get("origin") !== expectedOrigin)
    return jsonError("This upload came from another site. Reload PistonPost and try again.", 403)

  const length = Number(request.headers.get("content-length"))
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_IMAGE_UPLOAD_BYTES) {
    return jsonError("The image must be no larger than 15 MB.", 413)
  }

  const auth = await createRequestAuth(context)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return jsonError("Sign in again to upload images.", 401)
  const rateLimit = await context.env.IMAGE_UPLOAD_RATE_LIMITER.limit({
    key: `image-bytes:${session.user.id}`,
  })
  if (!rateLimit.success) {
    return jsonError("Too many uploads were started at once. Wait a minute and try again.", 429)
  }

  const database = createD1Database(context.env.DB)
  const asset = await database
    .select({
      id: schema.mediaAssets.id,
      kind: schema.mediaAssets.kind,
      status: schema.mediaAssets.status,
      originalFilename: schema.mediaAssets.originalFilename,
      mimeType: schema.mediaAssets.mimeType,
      byteSize: schema.mediaAssets.byteSize,
      providerMetadata: schema.mediaAssets.providerMetadata,
    })
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.id, mediaId.success),
        eq(schema.mediaAssets.ownerId, session.user.id),
      ),
    )
    .get()
  if (!asset) return jsonError(usedUploadMessage, 404)
  if (asset.kind !== "image" && asset.kind !== "avatar") {
    return jsonError(usedUploadMessage, 404)
  }
  if (asset.status === "ready") return Response.json({ assetId: asset.id, status: "ready" })
  if (asset.status !== "pending") return jsonError(usedUploadMessage, 409)
  const expiresAt = asset.providerMetadata["expiresAt"]
  if (typeof expiresAt !== "number" || expiresAt < Date.now()) {
    return jsonError(usedUploadMessage, 410)
  }
  if (request.headers.get("content-type")?.split(";", 1)[0] !== asset.mimeType) {
    return jsonError(
      "This file changed after it was chosen. Remove the image and add it again.",
      400,
    )
  }

  const markFailed = () =>
    database
      .update(schema.mediaAssets)
      .set({ status: "failed" })
      .where(and(eq(schema.mediaAssets.id, asset.id), eq(schema.mediaAssets.status, "pending")))

  const body = await request.arrayBuffer()
  if (body.byteLength !== length || body.byteLength !== asset.byteSize) {
    await markFailed()
    return jsonError(
      "This file changed after it was chosen. Remove the image and add it again.",
      400,
    )
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
    if (info.format === "image/gif") {
      const gif = inspectGif(new Uint8Array(body))
      if (!gif) throw new Error("Invalid GIF structure")
      if (gif.width !== info.width || gif.height !== info.height) {
        throw new Error("GIF dimensions mismatch")
      }
      if (!isGifAnimationWithinPixelLimit(gif)) {
        throw new Error("GIF animation pixel limit exceeded")
      }
    }
    if (!(await isSanitizedImage(body, info.format))) {
      throw new Error("Image metadata was not sanitized")
    }

    const digest = await crypto.subtle.digest("SHA-256", body)
    const checksum = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
    const directory = asset.kind === "avatar" ? "avatars" : "images"
    const key = `users/${session.user.id}/${directory}/${asset.id}/${checksum}`
    const reserve = reserveImageUploadKeyStatement(asset.id, key)
    const reserved = await database.$client
      .prepare(reserve.sql)
      .bind(...reserve.params)
      .run()
    // The upload was cancelled or finished elsewhere after it was read.
    if (reserved.meta.changes !== 1) return jsonError(usedUploadMessage, 409)
    objectKey = key
    await context.env.MEDIA.put(key, body, {
      httpMetadata: { contentType: info.format },
      customMetadata: { checksum, owner: session.user.id },
    })

    // JPEG is opaque. Leave potentially transparent formats on the neutral canvas,
    // since image backgrounds remain visible after loading.
    const placeholderColor =
      asset.kind === "image" && info.format === "image/jpeg"
        ? await createImagePlaceholder(context.env.IMAGES, body).catch(() => null)
        : null

    const finalized = {
      assetId: asset.id,
      r2Key: key,
      finalizeToken: crypto.randomUUID(),
      mimeType: info.format,
      byteSize: body.byteLength,
      width: info.width,
      height: info.height,
      checksum,
      providerMetadata: { ...asset.providerMetadata, placeholderColor },
    }

    let statements
    let previousAvatarId: string | null = null
    if (asset.kind === "avatar") {
      const profile = await database
        .select({
          avatarMediaId: schema.profiles.avatarMediaId,
        })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, session.user.id))
        .get()
      if (!profile) throw new Error("Profile missing")
      previousAvatarId = profile.avatarMediaId === asset.id ? null : profile.avatarMediaId
      statements = finalizeImageUploadStatements(finalized, {
        kind: "avatar",
        userId: session.user.id,
        image: mediaImageUrl(asset.id, "avatar"),
        previousAvatarId,
        auditEventId: crypto.randomUUID(),
      })
    } else {
      const editing = typeof asset.providerMetadata["editPostId"] === "string"
      const postId = editing
        ? asset.providerMetadata["editPostId"]
        : asset.providerMetadata["postId"]
      const ordinal = asset.providerMetadata["ordinal"]
      if (typeof postId !== "string" || typeof ordinal !== "number") {
        throw new TypeError("Image draft metadata missing")
      }
      const post = await database
        .select({ postId: schema.posts.id, authorId: schema.posts.authorId })
        .from(schema.posts)
        .where(
          and(
            eq(schema.posts.id, postId),
            eq(schema.posts.type, "images"),
            editing ? ne(schema.posts.status, "deleted") : eq(schema.posts.status, "draft"),
          ),
        )
        .get()
      if (
        !post ||
        (post.authorId !== session.user.id && !(editing && session.user.role === "admin"))
      )
        throw new Error("Image draft missing")
      statements = finalizeImageUploadStatements(
        finalized,
        editing ? { kind: "edit-image" } : { kind: "draft-image", postId: post.postId, ordinal },
      )
    }

    const results = await database.$client.batch(
      statements.map((statement) =>
        database.$client.prepare(statement.sql).bind(...statement.params),
      ),
    )
    if (results[0]?.meta.changes !== 1) {
      const current = await database
        .select({ status: schema.mediaAssets.status, r2Key: schema.mediaAssets.r2Key })
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.id, asset.id))
        .get()
      // A parallel request with the same bytes owns this key and already finished.
      if (current?.status === "ready" && current.r2Key === key) {
        return Response.json(
          { assetId: asset.id, status: "ready", width: info.width, height: info.height },
          { headers: { "Cache-Control": "private, no-store" } },
        )
      }
      objectKey = null
      await context.env.MEDIA.delete(key)
      return jsonError(usedUploadMessage, 409)
    }
    if (previousAvatarId) {
      const cleanup = mediaCleanupJob(previousAvatarId)
      context.executionContext.waitUntil(context.env.JOBS.send(cleanup))
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
    await markFailed()
    return jsonError(
      "This image did not match its file type or could not be checked. Try saving it again as JPG or PNG.",
      400,
    )
  }
}

export const Route = createFileRoute("/media/upload/$mediaId")({
  server: { handlers: { PUT: uploadImage } },
})
