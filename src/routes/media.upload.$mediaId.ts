import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const allowedFormats = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"])
const extensionsByMime = new Map([
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
  ["image/avif", new Set(["avif"])],
])

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
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_IMAGE_BYTES) {
    return jsonError("The image must be no larger than 15 MB.", 413)
  }

  const auth = await createRequestAuth(context)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return jsonError("Authentication is required.", 401)
  const rateLimit = await context.env.UPLOAD_RATE_LIMITER.limit({ key: session.user.id })
  if (!rateLimit.success) return jsonError("The upload rate limit was reached.", 429)

  const database = createD1Database(context.env.DB)
  const asset = await database
    .select()
    .from(schema.mediaAssets)
    .where(
      and(
        eq(schema.mediaAssets.id, mediaId.data),
        eq(schema.mediaAssets.ownerId, session.user.id),
        eq(schema.mediaAssets.kind, "image"),
      ),
    )
    .get()
  if (!asset) return jsonError("The upload intent was not found.", 404)
  if (asset.status === "ready") return Response.json({ assetId: asset.id, status: "ready" })
  if (asset.status !== "pending") return jsonError("The upload intent is no longer active.", 409)
  const postId = asset.providerMetadata.postId
  const expiresAt = asset.providerMetadata.expiresAt
  const ordinal = asset.providerMetadata.ordinal
  if (
    typeof postId !== "string" ||
    typeof expiresAt !== "number" ||
    typeof ordinal !== "number" ||
    expiresAt < Date.now()
  ) {
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
    if (info.format === "image/svg+xml" || !allowedFormats.has(info.format)) {
      throw new Error("Unsupported image format")
    }
    if (!("width" in info) || !("height" in info)) throw new Error("Image dimensions missing")
    if (info.width * info.height > 80_000_000) throw new Error("Image pixel limit exceeded")
    if (info.format !== asset.mimeType) throw new Error("Image MIME mismatch")
    const extension = asset.originalFilename.split(".").pop()?.toLocaleLowerCase("en-US")
    if (!extension || !extensionsByMime.get(info.format)?.has(extension)) {
      throw new Error("Image extension mismatch")
    }

    const digest = await crypto.subtle.digest("SHA-256", body)
    const checksum = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
    objectKey = `users/${session.user.id}/images/${asset.id}/${checksum}`
    await context.env.MEDIA.put(objectKey, body, {
      httpMetadata: { contentType: info.format },
      customMetadata: { checksum, owner: session.user.id },
    })

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
      database
        .update(schema.mediaAssets)
        .set({
          status: "ready",
          r2Key: objectKey,
          mimeType: info.format,
          byteSize: body.byteLength,
          width: info.width,
          height: info.height,
          checksum,
          finalizedAt: new Date(),
        })
        .where(eq(schema.mediaAssets.id, asset.id)),
      database
        .insert(schema.postMedia)
        .values({ postId: post.postId, mediaId: asset.id, ordinal })
        .onConflictDoNothing(),
    ])

    return Response.json(
      { assetId: asset.id, status: "ready", width: info.width, height: info.height },
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
