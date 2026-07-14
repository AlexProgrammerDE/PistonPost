import type { PublicPostCursor } from "@pistonpost/domain"
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm"

import type { D1DatabaseClient } from "./d1-database"
import { mediaAssets, postMedia, postTags, posts, profiles, reactions, tags, user } from "./schema"

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
  readonly author: {
    readonly username: string
    readonly name: string
    readonly image: string | null
  }
  readonly media: ReadonlyArray<PublicPostMedia>
  readonly tags: ReadonlyArray<{ readonly slug: string; readonly name: string }>
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

export type PublicProfileRead = {
  readonly username: string
  readonly name: string
  readonly bio: string | null
  readonly website: string | null
  readonly location: string | null
  readonly image: string | null
}

type BasePostRow = {
  readonly id: string
  readonly type: "text" | "images" | "video"
  readonly title: string
  readonly textContent: string | null
  readonly visibility: "public" | "unlisted"
  readonly publishedAt: Date
  readonly authorUsername: string
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
      authorUsername: profiles.username,
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
      authorUsername: profiles.username,
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

export async function getPublicProfileRead(database: D1DatabaseClient, username: string) {
  return database
    .select({
      username: profiles.username,
      name: user.name,
      bio: profiles.bio,
      website: profiles.website,
      location: profiles.location,
      image: user.image,
    })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(profiles.normalizedUsername, username.toLocaleLowerCase("en-US")))
    .get()
}

async function hydratePublicPosts(
  database: D1DatabaseClient,
  postRows: ReadonlyArray<BasePostRow>,
) {
  const postIds = postRows.map((post) => post.id)
  if (postIds.length === 0) return []

  const [mediaRows, tagRows, reactionRows] = await Promise.all([
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
      author: {
        username: post.authorUsername,
        name: post.authorName,
        image: post.authorImage,
      },
      media: mediaRows.filter((media) => media.postId === post.id),
      tags: tagRows.filter((tag) => tag.postId === post.id),
      reactions: counts,
    }
  })
}
