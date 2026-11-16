import { and, eq } from "drizzle-orm"
import { Effect } from "effect"

import { bannedAccount } from "@/db/account-ban"
import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import type { AppRequestContext } from "@/server"
import { createRequestAuthEffect } from "@/server/auth"
import { mediaCacheTag, ownerCacheTag, postCacheTag } from "@/server/cache-tags"
import { canViewMedia, mediaAudience } from "@/server/media-access"

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
        postAuthorId: schema.posts.authorId,
        postStatus: schema.posts.status,
        visibility: schema.posts.visibility,
        authorBanned: bannedAccount(schema.posts.authorId),
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

  const audience = mediaAudience({
    published: row.postStatus === "published",
    authorBanned: row.authorBanned,
  })
  if (audience !== "public") {
    const auth = yield* createRequestAuthEffect(context)
    const session = yield* bindingOperation("video-delivery.session", () =>
      auth.api.getSession({ headers: request.headers }),
    )
    if (!canViewMedia(audience, row.ownerId, session?.user)) return null
  }

  return {
    streamUid: row.streamUid,
    width: row.width,
    height: row.height,
    providerMetadata: row.providerMetadata,
    publiclyCacheable: audience === "public" && row.visibility === "public",
    cacheTags: [
      mediaCacheTag(mediaId),
      ...(row.ownerId ? [ownerCacheTag(row.ownerId)] : []),
      // An administrator can add media to another author's post, so tag the author as well.
      ...(row.postAuthorId ? [ownerCacheTag(row.postAuthorId)] : []),
      ...(row.postId ? [postCacheTag(row.postId)] : []),
    ],
  }
})

export function getDeliverableVideo(request: Request, context: AppRequestContext, mediaId: string) {
  return Effect.runPromise(getDeliverableVideoEffect(request, context, mediaId), {
    signal: request.signal,
  })
}
