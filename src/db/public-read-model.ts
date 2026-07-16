import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm"

import type { PublicPostCursor } from "@/domain"

import type { D1DatabaseClient } from "./d1-database"
import {
  comments,
  mediaAssets,
  postMedia,
  postTags,
  posts,
  profiles,
  reactions,
  tags,
  user,
} from "./schema"

export type PublicPostMedia = {
  readonly id: string
  readonly kind: "image" | "video" | "avatar"
  readonly width: number | null
  readonly height: number | null
  readonly duration: number | null
  readonly altText: string | null
}

export type PublicPostRead = {
  readonly id: string
  readonly type: "text" | "images" | "video"
  readonly title: string
  readonly textContent: string | null
  readonly visibility: "public" | "unlisted"
  readonly publishedAt: Date
  readonly updatedAt: Date
  readonly author: {
    readonly username: string
    readonly normalizedUsername: string
    readonly name: string
    readonly image: string | null
  }
  readonly media: ReadonlyArray<PublicPostMedia>
  readonly tags: ReadonlyArray<{ readonly slug: string; readonly name: string }>
  readonly commentCount: number
  readonly reactions: {
    readonly like: number
    readonly dislike: number
    readonly heart: number
  }
}

export type PublicFeedInput = {
  readonly cursor: PublicPostCursor | null
  readonly limit: number
  readonly tag?: string
  readonly username?: string
}

export type PublicFeedPage = {
  readonly posts: ReadonlyArray<PublicPostRead>
  readonly nextCursor: PublicPostCursor | null
}

export type PublicSitemapRecord = {
  readonly postId: string
  readonly postUpdatedAt: Date
  readonly username: string
  readonly profileUpdatedAt: Date
  readonly tag: string | null
}

export type PublishedPostTrackingContext = {
  readonly id: string
  readonly type: "text" | "images" | "video"
  readonly visibility: "public" | "unlisted"
}

type BasePostRow = {
  readonly id: string
  readonly type: "text" | "images" | "video"
  readonly title: string
  readonly textContent: string | null
  readonly visibility: "public" | "unlisted"
  readonly publishedAt: Date
  readonly updatedAt: Date
  readonly authorUsername: string
  readonly authorNormalizedUsername: string
  readonly authorName: string
  readonly authorImage: string | null
}

export async function listPublicPostReads(
  database: D1DatabaseClient,
  input: PublicFeedInput,
): Promise<PublicFeedPage> {
  const limit = Math.min(Math.max(input.limit, 1), 30)
  const cursorFilter = input.cursor
    ? or(
        lt(posts.publishedAt, input.cursor.publishedAt),
        and(eq(posts.publishedAt, input.cursor.publishedAt), lt(posts.id, input.cursor.id)),
      )
    : undefined
  const tagFilter = input.tag
    ? sql`exists (
        select 1 from ${postTags}
        inner join ${tags} on ${tags.id} = ${postTags.tagId}
        where ${postTags.postId} = ${posts.id}
          and ${tags.normalizedName} = ${input.tag}
      )`
    : undefined

  const postRows = await database
    .select({
      id: posts.id,
      type: posts.type,
      title: posts.title,
      textContent: posts.textContent,
      visibility: posts.visibility,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      authorUsername: profiles.username,
      authorNormalizedUsername: profiles.normalizedUsername,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .where(
      and(
        eq(posts.status, "published"),
        eq(posts.visibility, "public"),
        cursorFilter,
        tagFilter,
        input.username ? eq(profiles.normalizedUsername, input.username) : undefined,
      ),
    )
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(limit + 1)

  const visibleRows: Array<BasePostRow> = postRows
    .slice(0, limit)
    .filter((row): row is typeof row & { publishedAt: Date } => row.publishedAt !== null)
  const reads = await hydratePublicPosts(database, visibleRows)

  const last = reads.at(-1)
  return {
    posts: reads,
    nextCursor:
      postRows.length > limit && last ? { publishedAt: last.publishedAt, id: last.id } : null,
  }
}

export async function getPublishedPostRead(database: D1DatabaseClient, id: string) {
  const row = await database
    .select({
      id: posts.id,
      type: posts.type,
      title: posts.title,
      textContent: posts.textContent,
      visibility: posts.visibility,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      authorUsername: profiles.username,
      authorNormalizedUsername: profiles.normalizedUsername,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .where(and(eq(posts.id, id), eq(posts.status, "published")))
    .get()

  if (!row?.publishedAt) return null
  const hydrated = await hydratePublicPosts(database, [{ ...row, publishedAt: row.publishedAt }])
  return hydrated[0] ?? null
}

export async function getPublishedPostTrackingContext(
  database: D1DatabaseClient,
  id: string,
): Promise<PublishedPostTrackingContext | null> {
  const post = await database
    .select({ id: posts.id, type: posts.type, visibility: posts.visibility })
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.status, "published")))
    .get()

  return post ?? null
}

export async function getPublicProfileRead(database: D1DatabaseClient, username: string) {
  return database
    .select({
      username: profiles.username,
      normalizedUsername: profiles.normalizedUsername,
      name: user.name,
      bio: profiles.bio,
      website: profiles.website,
      location: profiles.location,
      image: user.image,
      createdAt: profiles.createdAt,
      updatedAt: profiles.updatedAt,
    })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(profiles.normalizedUsername, username.toLocaleLowerCase("en-US")))
    .get()
}

export async function listPublicSitemapRecords(
  database: D1DatabaseClient,
  limit = 49_997,
): Promise<ReadonlyArray<PublicSitemapRecord>> {
  return database
    .select({
      postId: posts.id,
      postUpdatedAt: posts.updatedAt,
      username: profiles.normalizedUsername,
      profileUpdatedAt: profiles.updatedAt,
      tag: tags.normalizedName,
    })
    .from(posts)
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .leftJoin(postTags, eq(postTags.postId, posts.id))
    .leftJoin(tags, eq(tags.id, postTags.tagId))
    .where(and(eq(posts.status, "published"), eq(posts.visibility, "public")))
    .orderBy(desc(posts.updatedAt), desc(posts.id), postTags.ordinal)
    .limit(Math.min(Math.max(limit, 1), 49_997))
}

async function hydratePublicPosts(
  database: D1DatabaseClient,
  postRows: ReadonlyArray<BasePostRow>,
) {
  const postIds = postRows.map((post) => post.id)
  if (postIds.length === 0) return []

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
      })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
      .where(and(inArray(postMedia.postId, postIds), eq(mediaAssets.status, "ready")))
      .orderBy(postMedia.ordinal),
    database
      .select({
        postId: postTags.postId,
        slug: tags.normalizedName,
        name: tags.displayName,
      })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(inArray(postTags.postId, postIds))
      .orderBy(postTags.ordinal),
    database
      .select({ postId: reactions.postId, type: reactions.type, count: sql<number>`count(*)` })
      .from(reactions)
      .where(inArray(reactions.postId, postIds))
      .groupBy(reactions.postId, reactions.type),
    database
      .select({ postId: comments.postId, count: sql<number>`count(*)` })
      .from(comments)
      .where(and(inArray(comments.postId, postIds), eq(comments.status, "published")))
      .groupBy(comments.postId),
  ])

  return postRows.map<PublicPostRead>((post) => {
    const counts = { like: 0, dislike: 0, heart: 0 }
    for (const reaction of reactionRows) {
      if (reaction.postId === post.id) counts[reaction.type] = reaction.count
    }

    return {
      id: post.id,
      type: post.type,
      title: post.title,
      textContent: post.textContent,
      visibility: post.visibility,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      author: {
        username: post.authorUsername,
        normalizedUsername: post.authorNormalizedUsername,
        name: post.authorName,
        image: post.authorImage,
      },
      media: mediaRows.filter((media) => media.postId === post.id),
      tags: tagRows.filter((tag) => tag.postId === post.id),
      commentCount: commentRows.find((row) => row.postId === post.id)?.count ?? 0,
      reactions: counts,
    }
  })
}
