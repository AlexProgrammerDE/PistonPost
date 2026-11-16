import { and, eq, inArray, isNotNull } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"
import { Effect } from "effect"

import * as schema from "@/db/schema"

import { missingProviderObject } from "./account-media-purge"
import { bindingOperation } from "./operation"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

export type UpdateVideoAccess = (streamUid: string, requireSignedURLs: boolean) => Promise<unknown>

/** Posts in these states keep their media. A moderated post can still be restored. */
const LIVE_POST_STATUSES = ["published", "moderated"] as const

/**
 * Applies the post's current moderation state to its Stream videos. Reading the state when the
 * job runs makes replays and out-of-order hide and restore jobs converge on the latest decision.
 */
export const syncPostVideoAccess = Effect.fn("Media.syncPostVideoAccess")(function* (
  database: Database,
  postId: string,
  updateVideoAccess: UpdateVideoAccess,
) {
  const post = yield* bindingOperation("video-access.post", () =>
    database
      .select({ status: schema.posts.status })
      .from(schema.posts)
      .where(eq(schema.posts.id, postId))
      .get(),
  )
  if (!post || (post.status !== "published" && post.status !== "moderated"))
    return "post-unavailable"
  const requireSignedURLs = post.status === "moderated"
  const videos = yield* bindingOperation("video-access.videos", () =>
    database
      .select({ streamUid: schema.mediaAssets.streamUid })
      .from(schema.postMedia)
      .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.postMedia.mediaId))
      .where(and(eq(schema.postMedia.postId, postId), isNotNull(schema.mediaAssets.streamUid))),
  )
  yield* Effect.forEach(
    videos.flatMap(({ streamUid }) => (streamUid ? [streamUid] : [])),
    (streamUid) =>
      bindingOperation("video-access.update", async () => {
        try {
          await updateVideoAccess(streamUid, requireSignedURLs)
        } catch (cause) {
          // A video that Stream already removed cannot be played either way.
          if (!missingProviderObject(cause)) throw cause
        }
      }),
    { concurrency: 4 },
  )
  return requireSignedURLs ? "signed-urls-required" : "public-playback"
})

/** Cleanup must not remove media that a live post shows, even if the job was queued earlier. */
export function mediaAttachedToLivePost(database: Database, mediaId: string) {
  return bindingOperation("media-cleanup.attached", () =>
    database
      .select({ postId: schema.postMedia.postId })
      .from(schema.postMedia)
      .innerJoin(schema.posts, eq(schema.posts.id, schema.postMedia.postId))
      .where(
        and(
          eq(schema.postMedia.mediaId, mediaId),
          inArray(schema.posts.status, LIVE_POST_STATUSES),
        ),
      )
      .get(),
  ).pipe(Effect.map((row) => row !== undefined))
}
