import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import type { PublicPostCursor } from "@/domain"
import { isSearchIndexingTrusted } from "@/lib/search-indexing"

import { notBannedAccount } from "./account-ban"
import type { PublicFeedPage, PublicPostRead } from "./public-read-model"
import type * as databaseSchema from "./schema"
import {
  comments,
  mediaAssets,
  postMedia,
  postTags,
  postViewCounts,
  posts,
  profiles,
  reactions,
  tags,
  user,
} from "./schema"

type ReadDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof databaseSchema>

export type OwnedUnlistedPostsInput = {
  readonly ownerId: string
  /** The normalized username of the profile being viewed. Another user's profile lists nothing. */
  readonly username: string
  readonly cursor: PublicPostCursor | null
  readonly limit: number
}

/**
 * Lists the owner's published unlisted posts, newest first, in the feed read shape. Only the owner
 * may see this list, so callers must take `ownerId` from the signed-in session. The list is empty
 * when `username` names another user's profile.
 *
 * Hydration matches `hydratePublicPosts` in `public-read-model.ts`, which is not exported. Keep the
 * two in step until that helper can be shared.
 */
export async function listOwnedUnlistedPostReads(
  database: ReadDatabase,
  input: OwnedUnlistedPostsInput,
): Promise<PublicFeedPage> {
  const limit = Math.min(Math.max(input.limit, 1), 30)
  const cursorFilter = input.cursor
    ? or(
        lt(posts.publishedAt, input.cursor.publishedAt),
        and(eq(posts.publishedAt, input.cursor.publishedAt), lt(posts.id, input.cursor.id)),
      )
    : undefined

  const rows = await database
    .select({
      id: posts.id,
      type: posts.type,
      title: posts.title,
      textContent: posts.textContent,
      visibility: posts.visibility,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      authorId: posts.authorId,
      authorUsername: profiles.username,
      authorNormalizedUsername: profiles.normalizedUsername,
      authorName: user.name,
      authorImage: user.image,
      authorCreatedAt: user.createdAt,
      authorEmailVerified: user.emailVerified,
      authorRole: user.role,
      viewCount: sql<number>`coalesce(${postViewCounts.viewCount}, 0)`,
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .leftJoin(postViewCounts, eq(postViewCounts.postId, posts.id))
    .where(
      and(
        eq(posts.authorId, input.ownerId),
        eq(profiles.normalizedUsername, input.username),
        eq(posts.status, "published"),
        eq(posts.visibility, "unlisted"),
        cursorFilter,
      ),
    )
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(limit + 1)

  const pageRows = rows
    .slice(0, limit)
    .filter((row): row is typeof row & { publishedAt: Date } => row.publishedAt !== null)
  const postIds = pageRows.map((row) => row.id)
  if (postIds.length === 0) return { posts: [], nextCursor: null }

  const [mediaRows, tagRows, reactionRows, commentRows] = await Promise.all([
    database
      .select({
        postId: postMedia.postId,
        id: mediaAssets.id,
        kind: mediaAssets.kind,
        width: mediaAssets.width,
        height: mediaAssets.height,
        duration: mediaAssets.duration,
        altText: mediaAssets.altText,
        placeholderColor: sql<
          string | null
        >`json_extract(${mediaAssets.providerMetadata}, '$.placeholderColor')`,
      })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
      .where(and(inArray(postMedia.postId, postIds), eq(mediaAssets.status, "ready")))
      .orderBy(postMedia.ordinal),
    database
      .select({ postId: postTags.postId, slug: tags.normalizedName, name: tags.displayName })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(inArray(postTags.postId, postIds))
      .orderBy(postTags.ordinal),
    database
      .select({ postId: reactions.postId, count: sql<number>`count(*)` })
      .from(reactions)
      .where(inArray(reactions.postId, postIds))
      .groupBy(reactions.postId),
    database
      .select({ postId: comments.postId, count: sql<number>`count(*)` })
      .from(comments)
      .where(
        and(
          inArray(comments.postId, postIds),
          eq(comments.status, "published"),
          notBannedAccount(comments.authorId),
        ),
      )
      .groupBy(comments.postId),
  ])

  const reads = pageRows.map<PublicPostRead>((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    textContent: row.textContent,
    visibility: row.visibility,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    author: {
      id: row.authorId,
      username: row.authorUsername,
      normalizedUsername: row.authorNormalizedUsername,
      name: row.authorName,
      image: row.authorImage,
      searchIndexable: isSearchIndexingTrusted({
        createdAt: row.authorCreatedAt,
        emailVerified: row.authorEmailVerified,
        role: row.authorRole,
      }),
    },
    media: mediaRows.filter((media) => media.postId === row.id),
    tags: tagRows.filter((tag) => tag.postId === row.id),
    viewCount: row.viewCount,
    commentCount: commentRows.find((count) => count.postId === row.id)?.count ?? 0,
    heartCount: reactionRows.find((count) => count.postId === row.id)?.count ?? 0,
  }))

  const last = reads.at(-1)
  return {
    posts: reads,
    nextCursor: rows.length > limit && last ? { publishedAt: last.publishedAt, id: last.id } : null,
  }
}
