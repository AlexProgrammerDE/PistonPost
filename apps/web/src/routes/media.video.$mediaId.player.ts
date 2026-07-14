import { createD1Database } from "@pistonpost/db/d1-database"
import * as schema from "@pistonpost/db/schema"
import { createFileRoute } from "@tanstack/react-router"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import type { AppRequestContext } from "@/server"
import { createRequestAuth } from "@/server/auth"

async function videoPlayer({
  request,
  context,
  params,
}: {
  request: Request
  context: AppRequestContext
  params: { mediaId: string }
}) {
  const mediaId = z.string().uuid().safeParse(params.mediaId)
  if (!mediaId.success) return new Response("Not found", { status: 404 })

  const row = await createD1Database(context.env.DB)
    .select({
      streamUid: schema.mediaAssets.streamUid,
      ownerId: schema.mediaAssets.ownerId,
      postStatus: schema.posts.status,
      visibility: schema.posts.visibility,
    })
    .from(schema.mediaAssets)
    .leftJoin(schema.postMedia, eq(schema.postMedia.mediaId, schema.mediaAssets.id))
    .leftJoin(schema.posts, eq(schema.posts.id, schema.postMedia.postId))
    .where(
      and(
        eq(schema.mediaAssets.id, mediaId.data),
        eq(schema.mediaAssets.kind, "video"),
        eq(schema.mediaAssets.status, "ready"),
      ),
    )
    .get()
  if (!row?.streamUid) return new Response("Not found", { status: 404 })

  if (row.postStatus !== "published") {
    const auth = await createRequestAuth(context)
    const session = await auth.api.getSession({ headers: request.headers })
    if (session?.user.id !== row.ownerId) return new Response("Not found", { status: 404 })
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://iframe.videodelivery.net/${row.streamUid}`,
      "Cache-Control":
        row.postStatus === "published" && row.visibility === "public"
          ? "public, max-age=3600"
          : "private, no-store",
    },
  })
}

export const Route = createFileRoute("/media/video/$mediaId/player")({
  server: { handlers: { GET: videoPlayer } },
})
