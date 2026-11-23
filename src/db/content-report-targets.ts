import { and, eq } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import { notBannedAccount } from "./account-ban"
import type * as databaseSchema from "./schema"
import { comments, posts, profiles } from "./schema"

type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof databaseSchema>

export type ContentReportTarget =
  | { readonly type: "post"; readonly id: string }
  | { readonly type: "comment"; readonly id: string }
  | { readonly type: "profile"; readonly normalizedUsername: string }

/**
 * Find the owner of content that a viewer can report. Only content that public reads show is
 * reportable, so hidden content, including everything from a banned account, is not found.
 */
export async function findReportTargetOwner(
  database: Database,
  target: ContentReportTarget,
): Promise<{ readonly ownerId: string } | null> {
  if (target.type === "post") {
    const row = await database
      .select({ ownerId: posts.authorId })
      .from(posts)
      .where(
        and(
          eq(posts.id, target.id),
          eq(posts.status, "published"),
          notBannedAccount(posts.authorId),
        ),
      )
      .get()
    return row ?? null
  }
  if (target.type === "comment") {
    const row = await database
      .select({ ownerId: comments.authorId })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(
        and(
          eq(comments.id, target.id),
          eq(comments.status, "published"),
          notBannedAccount(comments.authorId),
          eq(posts.status, "published"),
          notBannedAccount(posts.authorId),
        ),
      )
      .get()
    return row ?? null
  }
  const row = await database
    .select({ ownerId: profiles.userId })
    .from(profiles)
    .where(
      and(
        eq(profiles.normalizedUsername, target.normalizedUsername),
        notBannedAccount(profiles.userId),
      ),
    )
    .get()
  return row ?? null
}
