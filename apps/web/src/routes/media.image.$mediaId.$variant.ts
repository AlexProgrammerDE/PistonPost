import { createD1Database } from "@pistonpost/db/d1-database"
import * as schema from "@pistonpost/db/schema"
import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"

const variants = {
  avatar: { width: 256, height: 256, fit: "cover" as const, quality: 82 },
  feed: { width: 1280, height: 1280, fit: "scale-down" as const, quality: 82 },
  detail: { width: 2400, height: 2400, fit: "scale-down" as const, quality: 88 },
  thumbnail: { width: 480, height: 360, fit: "cover" as const, quality: 76 },
  og: { width: 1200, height: 630, fit: "cover" as const, quality: 84 },
} as const

const routeInput = z.object({
  mediaId: z.string().uuid(),
  variant: z.enum(["avatar", "feed", "detail", "thumbnail", "og"]),
})

async function deliverImage({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { mediaId: string; variant: string }
}) {
  const input = routeInput.safeParse(params)
  if (!input.success) return new Response("Not found", { status: 404 })

  const database = createD1Database(context.env.DB)
  const rows = await database
    .select({
      asset: schema.mediaAssets,
      postStatus: schema.posts.status,
      visibility: schema.posts.visibility,
    })
    .from(schema.mediaAssets)
    .leftJoin(schema.postMedia, eq(schema.postMedia.mediaId, schema.mediaAssets.id))
    .leftJoin(schema.posts, eq(schema.posts.id, schema.postMedia.postId))
    .where(
      and(eq(schema.mediaAssets.id, input.data.mediaId), eq(schema.mediaAssets.status, "ready")),
    )
  const row = rows[0]
  if (!row?.asset.r2Key) return new Response("Not found", { status: 404 })

  const isPublished = row.postStatus === "published"
  if (!isPublished && row.asset.kind !== "avatar") {
    const auth = await createRequestAuth(context)
    const session = await auth.api.getSession({ headers: request.headers })
    if (session?.user.id !== row.asset.ownerId) return new Response("Not found", { status: 404 })
  }

  const object = await context.env.MEDIA.get(row.asset.r2Key)
  if (!object) return new Response("Not found", { status: 404 })

  const selected = variants[input.data.variant]
  const transformed = await context.env.IMAGES.input(object.body)
    .transform({ width: selected.width, height: selected.height, fit: selected.fit })
    .output({ format: "image/webp", quality: selected.quality, anim: false })
  const response = transformed.response()
  const headers = new Headers(response.headers)
  headers.set("Content-Type", transformed.contentType())
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set(
    "Cache-Control",
    isPublished && row.visibility === "public"
      ? "public, max-age=31536000, immutable"
      : "private, no-store",
  )
  return new Response(response.body, { status: response.status, headers })
}

export const Route = createFileRoute("/media/image/$mediaId/$variant")({
  server: { handlers: { GET: deliverImage, HEAD: deliverImage } },
})
