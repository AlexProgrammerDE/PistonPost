import { and, eq } from "drizzle-orm"
import { Effect } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import type { AppRequestContext } from "@/server"
import { createRequestAuthEffect } from "@/server/auth"

import { bindingOperation } from "./operation"

const getDeliverableVideoEffect = Effect.fn("Video.getDeliverable")(function* (
  request: Request,
  context: AppRequestContext,
  mediaId: string,
) {
  const row = yield* bindingOperation("video-delivery.read", () =>
    createD1Database(context.env.DB)
      .select({
        streamUid: schema.mediaAssets.streamUid,
        ownerId: schema.mediaAssets.ownerId,
        width: schema.mediaAssets.width,
        height: schema.mediaAssets.height,
        providerMetadata: schema.mediaAssets.providerMetadata,
        postId: schema.posts.id,
        postStatus: schema.posts.status,
        visibility: schema.posts.visibility,
      })
      .from(schema.mediaAssets)
      .leftJoin(schema.postMedia, eq(schema.postMedia.mediaId, schema.mediaAssets.id))
      .leftJoin(schema.posts, eq(schema.posts.id, schema.postMedia.postId))
      .where(
        and(
          eq(schema.mediaAssets.id, mediaId),
          eq(schema.mediaAssets.kind, "video"),
          eq(schema.mediaAssets.status, "ready"),
        ),
      )
      .get(),
  )
  if (!row?.streamUid) return null

  if (row.postStatus !== "published") {
    const auth = yield* createRequestAuthEffect(context)
    const session = yield* bindingOperation("video-delivery.session", () =>
      auth.api.getSession({ headers: request.headers }),
    )
    if (session?.user.id !== row.ownerId) return null
  }

  return {
    streamUid: row.streamUid,
    width: row.width,
    height: row.height,
    providerMetadata: row.providerMetadata,
    ownerId: row.ownerId,
    postId: row.postId,
    publiclyCacheable: row.postStatus === "published" && row.visibility === "public",
  }
})

export function getDeliverableVideo(request: Request, context: AppRequestContext, mediaId: string) {
  return Effect.runPromise(getDeliverableVideoEffect(request, context, mediaId), {
    signal: request.signal,
  })
}
