import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import { getPostAccessRecord, getPostHiddenAt } from "@/db/post-access-read-model"
import type * as databaseSchema from "@/db/schema"
import type { Actor } from "@/domain/model"
import { isAdministrator, postDetailAccess } from "@/domain/policy"

type ReadDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof databaseSchema>

/** What the owner or an administrator sees in place of a post that moderation hid. */
export type ModeratedPostTombstone = {
  readonly kind: "moderated"
  readonly id: string
  readonly type: "text" | "images" | "video"
  readonly title: string
  readonly moderationReason: string | null
  /** Null when the audit log has no hide event for the post. */
  readonly hiddenAt: Date | null
  readonly author: {
    readonly name: string
    readonly username: string
    readonly normalizedUsername: string
  }
  /** An administrator can restore the post. An owner can only read the notice. */
  readonly viewer: "owner" | "admin"
}

export async function findModeratedPostTombstone(
  database: ReadDatabase,
  actor: Actor,
  id: string,
  now: Date,
): Promise<ModeratedPostTombstone | null> {
  const record = await getPostAccessRecord(database, id, now)
  if (!record || postDetailAccess(actor, record) !== "tombstone") return null
  const hiddenAt = await getPostHiddenAt(database, record.id)
  return {
    kind: "moderated",
    id: record.id,
    type: record.type,
    title: record.title,
    moderationReason: record.moderationReason,
    hiddenAt,
    author: {
      name: record.authorName,
      username: record.authorUsername,
      normalizedUsername: record.authorNormalizedUsername,
    },
    viewer: isAdministrator(actor) ? "admin" : "owner",
  }
}
