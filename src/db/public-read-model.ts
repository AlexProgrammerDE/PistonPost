import { and, count, countDistinct, desc, eq, inArray, lt, or, sql } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import type { PublicPostCursor } from "@/domain"
import { isSearchIndexingTrusted, searchIndexingTrustCondition } from "@/lib/search-indexing"

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
  tagFollows,
  tags,
  user,
  userFollows,
} from "./schema"

type ReadDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof databaseSchema>

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
    readonly searchIndexable: boolean
  }
  readonly media: ReadonlyArray<PublicPostMedia>
  readonly tags: ReadonlyArray<{ readonly slug: string; readonly name: string }>
  readonly viewCount: number
  readonly commentCount: number
  readonly reactions: {
    readonly like: number
    readonly dislike: number
    readonly heart: number
  }
  readonly structuredComments?: ReadonlyArray<{
    readonly id: string
    readonly content: string
    readonly createdAt: Date
    readonly updatedAt: Date
    readonly authorName: string
    readonly authorUsername: string
    readonly authorNormalizedUsername: string
  }>
}

export type PublicFeedInput = {
  readonly cursor: PublicPostCursor | null
  readonly limit: number
  readonly tag?: string
  readonly username?: string
  readonly followingUserId?: string
}

export type PublicFeedPage = {
  readonly posts: ReadonlyArray<PublicPostRead>
  readonly nextCursor: PublicPostCursor | null
}

export type PublicPostSitemapRecord = {
  readonly id: string
  readonly title: string
  readonly type: "text" | "images" | "video"
  readonly publishedAt: Date
  readonly updatedAt: Date
  readonly media: ReadonlyArray<{
    readonly id: string
    readonly kind: "image" | "video" | "avatar"
    readonly duration: number | null
  }>
}

export type PublicProfileSitemapRecord = {
  readonly username: string
  readonly updatedAt: Date
}

export type PublicTagSitemapRecord = {
  readonly tag: string
  readonly updatedAt: Date
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
  readonly authorCreatedAt: Date
  readonly authorEmailVerified: boolean
  readonly authorRole: string | null
  readonly viewCount: number
}

export async function listPublicPostReads(
  database: ReadDatabase,
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
  const followingFilter = input.followingUserId
    ? sql`(
        exists (
          select 1 from ${userFollows}
          where ${userFollows.followerId} = ${input.followingUserId}
            and ${userFollows.followedUserId} = ${posts.authorId}
        )
        or exists (
          select 1 from ${postTags}
          inner join ${tagFollows} on ${tagFollows.tagId} = ${postTags.tagId}
          where ${postTags.postId} = ${posts.id}
            and ${tagFollows.userId} = ${input.followingUserId}
        )
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
        eq(posts.status, "published"),
        eq(posts.visibility, "public"),
        cursorFilter,
        tagFilter,
        followingFilter,
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

export async function getPublishedPostRead(database: ReadDatabase, id: string) {
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
      authorCreatedAt: user.createdAt,
      authorEmailVerified: user.emailVerified,
      authorRole: user.role,
      viewCount: sql<number>`coalesce(${postViewCounts.viewCount}, 0)`,
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .leftJoin(postViewCounts, eq(postViewCounts.postId, posts.id))
    .where(and(eq(posts.id, id), eq(posts.status, "published")))
    .get()

  if (!row?.publishedAt) return null
  const hydrated = await hydratePublicPosts(database, [{ ...row, publishedAt: row.publishedAt }])
  const post = hydrated[0]
  if (!post) return null
  const structuredComments = await database
    .select({
      id: comments.id,
      parentId: comments.parentId,
      content: comments.content,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorName: user.name,
      authorUsername: profiles.username,
      authorNormalizedUsername: profiles.normalizedUsername,
    })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .innerJoin(profiles, eq(profiles.userId, comments.authorId))
    .where(and(eq(comments.postId, post.id), eq(comments.status, "published")))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(25)
  return { ...post, structuredComments }
}

export async function getPublishedPostTrackingContext(
  database: ReadDatabase,
  id: string,
): Promise<PublishedPostTrackingContext | null> {
  const post = await database
    .select({ id: posts.id, type: posts.type, visibility: posts.visibility })
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.status, "published")))
    .get()

  return post ?? null
}

export async function getPublicProfileRead(database: ReadDatabase, username: string) {
  const profile = await database
    .select({
      userId: profiles.userId,
      username: profiles.username,
      normalizedUsername: profiles.normalizedUsername,
      name: user.name,
      bio: profiles.bio,
      website: profiles.website,
      location: profiles.location,
      image: user.image,
      createdAt: profiles.createdAt,
      updatedAt: profiles.updatedAt,
      accountCreatedAt: user.createdAt,
      emailVerified: user.emailVerified,
      role: user.role,
    })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(profiles.normalizedUsername, username.toLocaleLowerCase("en-US")))
    .get()
  if (!profile) return null

  const [postCount, followerCount, recentPosts] = await Promise.all([
    database
      .select({ value: count() })
      .from(posts)
      .where(
        and(
          eq(posts.authorId, profile.userId),
          eq(posts.status, "published"),
          eq(posts.visibility, "public"),
        ),
      )
      .get(),
    database
      .select({ value: count() })
      .from(userFollows)
      .where(eq(userFollows.followedUserId, profile.userId))
      .get(),
    database
      .select({ id: posts.id, title: posts.title, publishedAt: posts.publishedAt })
      .from(posts)
      .where(
        and(
          eq(posts.authorId, profile.userId),
          eq(posts.status, "published"),
          eq(posts.visibility, "public"),
        ),
      )
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(10),
  ])

  return {
    username: profile.username,
    normalizedUsername: profile.normalizedUsername,
    name: profile.name,
    bio: profile.bio,
    website: profile.website,
    location: profile.location,
    image: profile.image,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    postCount: postCount?.value ?? 0,
    followerCount: followerCount?.value ?? 0,
    recentPosts: recentPosts.filter(
      (post): post is typeof post & { publishedAt: Date } => post.publishedAt !== null,
    ),
    searchIndexable: isSearchIndexingTrusted({
      createdAt: profile.accountCreatedAt,
      emailVerified: profile.emailVerified,
      role: profile.role,
    }),
  }
}

export async function getPublicTagRead(database: ReadDatabase, normalizedName: string) {
  const tag = await database
    .select({ id: tags.id, displayName: tags.displayName, normalizedName: tags.normalizedName })
    .from(tags)
    .where(eq(tags.normalizedName, normalizedName))
    .get()
  if (!tag) return null

  const [publicPost, trustedPost] = await Promise.all([
    database
      .select({ id: posts.id })
      .from(postTags)
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .where(
        and(
          eq(postTags.tagId, tag.id),
          eq(posts.status, "published"),
          eq(posts.visibility, "public"),
        ),
      )
      .limit(1)
      .get(),
    database
      .select({ id: posts.id })
      .from(postTags)
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .innerJoin(user, eq(user.id, posts.authorId))
      .where(
        and(
          eq(postTags.tagId, tag.id),
          eq(posts.status, "published"),
          eq(posts.visibility, "public"),
          searchIndexingTrustCondition(),
        ),
      )
      .limit(1)
      .get(),
  ])

  return publicPost ? { ...tag, searchIndexable: trustedPost !== undefined } : null
}

export async function getPublicSitemapCounts(database: ReadDatabase) {
  const publicPostExists = sql`exists (
    select 1 from ${posts} sitemap_posts
    where sitemap_posts.author_id = ${profiles.userId}
      and sitemap_posts.status = 'published'
      and sitemap_posts.visibility = 'public'
  )`
  const [postCount, profileCount, tagCount] = await Promise.all([
    database
      .select({ value: count() })
      .from(posts)
      .innerJoin(user, eq(user.id, posts.authorId))
      .where(
        and(
          eq(posts.status, "published"),
          eq(posts.visibility, "public"),
          searchIndexingTrustCondition(),
        ),
      )
      .get(),
    database
      .select({ value: count() })
      .from(profiles)
      .innerJoin(user, eq(user.id, profiles.userId))
      .where(and(searchIndexingTrustCondition(), publicPostExists))
      .get(),
    database
      .select({ value: countDistinct(tags.id) })
      .from(tags)
      .innerJoin(postTags, eq(postTags.tagId, tags.id))
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .innerJoin(user, eq(user.id, posts.authorId))
      .where(
        and(
          eq(posts.status, "published"),
          eq(posts.visibility, "public"),
          searchIndexingTrustCondition(),
        ),
      )
      .get(),
  ])
  return {
    posts: postCount?.value ?? 0,
    profiles: profileCount?.value ?? 0,
    tags: tagCount?.value ?? 0,
  }
}

export async function listPublicPostSitemapRecords(
  database: ReadDatabase,
  offset: number,
  limit: number,
): Promise<ReadonlyArray<PublicPostSitemapRecord>> {
  const rows = await database
    .select({
      id: posts.id,
      title: posts.title,
      type: posts.type,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .where(
      and(
        eq(posts.status, "published"),
        eq(posts.visibility, "public"),
        searchIndexingTrustCondition(),
      ),
    )
    .orderBy(desc(posts.updatedAt), desc(posts.id))
    .limit(limit)
    .offset(offset)
  const visibleRows = rows.filter(
    (post): post is typeof post & { publishedAt: Date } => post.publishedAt !== null,
  )
  const postIds = visibleRows.map((post) => post.id)
  const media =
    postIds.length === 0
      ? []
      : await database
          .select({
            postId: postMedia.postId,
            id: mediaAssets.id,
            kind: mediaAssets.kind,
            duration: mediaAssets.duration,
          })
          .from(postMedia)
          .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
          .where(and(inArray(postMedia.postId, postIds), eq(mediaAssets.status, "ready")))
          .orderBy(postMedia.ordinal)

  return visibleRows.map((post) => ({
    id: post.id,
    title: post.title,
    type: post.type,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    media: media.filter((asset) => asset.postId === post.id),
  }))
}

export async function listPublicProfileSitemapRecords(
  database: ReadDatabase,
  offset: number,
  limit: number,
): Promise<ReadonlyArray<PublicProfileSitemapRecord>> {
  return database
    .select({ username: profiles.normalizedUsername, updatedAt: profiles.updatedAt })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(
      and(
        searchIndexingTrustCondition(),
        sql`exists (
          select 1 from ${posts} sitemap_posts
          where sitemap_posts.author_id = ${profiles.userId}
            and sitemap_posts.status = 'published'
            and sitemap_posts.visibility = 'public'
        )`,
      ),
    )
    .orderBy(desc(profiles.updatedAt), desc(profiles.userId))
    .limit(limit)
    .offset(offset)
}

export async function listPublicTagSitemapRecords(
  database: ReadDatabase,
  offset: number,
  limit: number,
): Promise<ReadonlyArray<PublicTagSitemapRecord>> {
  const lastModified = sql<number>`max(${posts.updatedAt})`
  const rows = await database
    .select({ tag: tags.normalizedName, updatedAt: lastModified })
    .from(tags)
    .innerJoin(postTags, eq(postTags.tagId, tags.id))
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .innerJoin(user, eq(user.id, posts.authorId))
    .where(
      and(
        eq(posts.status, "published"),
        eq(posts.visibility, "public"),
        searchIndexingTrustCondition(),
      ),
    )
    .groupBy(tags.id, tags.normalizedName)
    .orderBy(desc(lastModified), desc(tags.id))
    .limit(limit)
    .offset(offset)
  return rows.map((row) => ({ tag: row.tag, updatedAt: new Date(row.updatedAt) }))
}

async function hydratePublicPosts(database: ReadDatabase, postRows: ReadonlyArray<BasePostRow>) {
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
        searchIndexable: isSearchIndexingTrusted({
          createdAt: post.authorCreatedAt,
          emailVerified: post.authorEmailVerified,
          role: post.authorRole,
        }),
      },
      media: mediaRows.filter((media) => media.postId === post.id),
      tags: tagRows.filter((tag) => tag.postId === post.id),
      viewCount: post.viewCount,
      commentCount: commentRows.find((row) => row.postId === post.id)?.count ?? 0,
      reactions: counts,
    }
  })
}
