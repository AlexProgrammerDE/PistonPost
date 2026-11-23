import { and, desc, eq } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import { bannedAccount } from "./account-ban"
import type * as databaseSchema from "./schema"
import { auditEvents, posts, profiles, user } from "./schema"

type ReadDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof databaseSchema>

/**
 * The fields a post access decision needs, plus what a tombstone shows. This read applies no
 * visibility rule. The caller must pass the record through `postDetailAccess` before showing it.
 */
export async function getPostAccessRecord(database: ReadDatabase, id: string, now: Date) {
  const record = await database
    .select({
      id: posts.id,
      authorId: posts.authorId,
      status: posts.status,
      type: posts.type,
      title: posts.title,
      moderationReason: posts.moderationReason,
      authorBanned: bannedAccount(posts.authorId, now),
      authorName: user.name,
      authorUsername: profiles.username,
      authorNormalizedUsername: profiles.normalizedUsername,
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .where(eq(posts.id, id))
    .get()
  return record ?? null
}

/**
 * When an administrator last hid the post, from the audit log. The post's own update time is not
 * used because the owner can still edit a hidden post.
 */
export async function getPostHiddenAt(database: ReadDatabase, postId: string) {
  const event = await database
    .select({ createdAt: auditEvents.createdAt })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityType, "post"),
        eq(auditEvents.entityId, postId),
        eq(auditEvents.action, "post.hide"),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(1)
    .get()
  return event?.createdAt ?? null
}
