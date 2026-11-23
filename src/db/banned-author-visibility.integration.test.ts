import { afterEach, describe, expect, it } from "bun:test"

import { eq } from "drizzle-orm"

import { canViewMedia, mediaAudience } from "@/server/media-access"

import { bannedAccount } from "./account-ban"
import { listPublicAtomFeedRecords } from "./atom-feed-read-model"
import { createPost, createUser } from "./factories"
import {
  getPublicProfileRead,
  getPublicSitemapCounts,
  getPublicTagRead,
  getPublishedPostRead,
  getPublishedPostTrackingContext,
  listPublicPostReads,
  listPublicPostSitemapRecords,
  listPublicProfileSitemapRecords,
  listPublicTagSitemapRecords,
} from "./public-read-model"
import {
  comments,
  mediaAssets,
  postMedia,
  posts,
  postTags,
  profiles,
  tags,
  user,
  userFollows,
} from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Two established authors post in the same tag and comment on each other's posts. The
 * "banned" author is the one the tests ban and unban.
 */
function seedDatabase() {
  const database = createMigratedTestDatabase()
  close = () => {
    database.$client.close()
  }
  database
    .insert(user)
    .values([
      createUser({ id: "banned", email: "banned@example.com", name: "Banned" }),
      createUser({ id: "author", email: "author@example.com", name: "Author" }),
      createUser({ id: "viewer", email: "viewer@example.com", name: "Viewer" }),
      createUser({ id: "admin", email: "admin@example.com", name: "Admin", role: "admin" }),
    ])
    .run()
  database
    .insert(profiles)
    .values([
      { userId: "banned", username: "banned", normalizedUsername: "banned" },
      { userId: "author", username: "author", normalizedUsername: "author" },
      { userId: "viewer", username: "viewer", normalizedUsername: "viewer" },
    ])
    .run()
  database
    .insert(posts)
    .values([
      createPost({
        id: "banned-post",
        authorId: "banned",
        type: "video",
        status: "published",
        publishedAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
      createPost({
        id: "author-post",
        authorId: "author",
        status: "published",
        publishedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ])
    .run()
  database.insert(tags).values({ id: "art", displayName: "Art", normalizedName: "art" }).run()
  database.insert(tags).values({ id: "solo", displayName: "Solo", normalizedName: "solo" }).run()
  database
    .insert(postTags)
    .values([
      { postId: "banned-post", tagId: "art", ordinal: 0 },
      { postId: "author-post", tagId: "art", ordinal: 0 },
      { postId: "banned-post", tagId: "solo", ordinal: 1 },
    ])
    .run()
  database
    .insert(comments)
    .values([
      {
        id: "banned-comment",
        postId: "author-post",
        authorId: "banned",
        content: "From the banned author",
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
      },
      {
        id: "viewer-comment",
        postId: "author-post",
        authorId: "viewer",
        content: "From the viewer",
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
      },
      {
        id: "comment-on-banned-post",
        postId: "banned-post",
        authorId: "author",
        content: "On the banned post",
      },
    ])
    .run()
  database
    .insert(mediaAssets)
    .values({
      id: "banned-video",
      ownerId: "banned",
      kind: "video",
      provider: "stream",
      status: "ready",
      originalFilename: "clip.mp4",
      mimeType: "video/mp4",
      byteSize: 1,
    })
    .run()
  database
    .insert(postMedia)
    .values({ postId: "banned-post", mediaId: "banned-video", ordinal: 0 })
    .run()
  database.insert(userFollows).values({ followerId: "viewer", followedUserId: "banned" }).run()
  return database
}

type TestDatabase = ReturnType<typeof seedDatabase>

function ban(database: TestDatabase, banExpires: Date | null) {
  database.update(user).set({ banned: true, banExpires }).where(eq(user.id, "banned")).run()
}

async function publicView(database: TestDatabase) {
  const [
    feed,
    followingFeed,
    tagFeed,
    profileFeed,
    post,
    authorPost,
    tracking,
    profile,
    artTag,
    soloTag,
    sitemapCounts,
    sitemapPosts,
    sitemapProfiles,
    sitemapTags,
    atom,
  ] = await Promise.all([
    listPublicPostReads(database, { cursor: null, limit: 12 }),
    listPublicPostReads(database, { cursor: null, limit: 12, followingUserId: "viewer" }),
    listPublicPostReads(database, { cursor: null, limit: 12, tag: "solo" }),
    listPublicPostReads(database, { cursor: null, limit: 12, username: "banned" }),
    getPublishedPostRead(database, "banned-post"),
    getPublishedPostRead(database, "author-post"),
    getPublishedPostTrackingContext(database, "banned-post"),
    getPublicProfileRead(database, "banned"),
    getPublicTagRead(database, "art"),
    getPublicTagRead(database, "solo"),
    getPublicSitemapCounts(database),
    listPublicPostSitemapRecords(database, 0, 50),
    listPublicProfileSitemapRecords(database, 0, 50),
    listPublicTagSitemapRecords(database, 0, 50),
    listPublicAtomFeedRecords(database),
  ])
  return {
    feed: feed.posts.map((item) => item.id),
    feedCommentCounts: Object.fromEntries(feed.posts.map((item) => [item.id, item.commentCount])),
    followingFeed: followingFeed.posts.map((item) => item.id),
    tagFeed: tagFeed.posts.map((item) => item.id),
    profileFeed: profileFeed.posts.map((item) => item.id),
    post: post?.id ?? null,
    authorPostComments: authorPost?.structuredComments.map((comment) => comment.id) ?? [],
    tracking: tracking?.id ?? null,
    profile: profile?.username ?? null,
    artTag: artTag?.normalizedName ?? null,
    soloTag: soloTag?.normalizedName ?? null,
    sitemapCounts,
    sitemapPosts: sitemapPosts.map((record) => record.id),
    sitemapProfiles: sitemapProfiles.map((record) => record.username),
    sitemapTags: sitemapTags.map((record) => record.tag).toSorted(),
    atom: atom.map((record) => record.id),
  }
}

const visibleView = {
  feed: ["banned-post", "author-post"],
  feedCommentCounts: { "banned-post": 1, "author-post": 2 },
  followingFeed: ["banned-post"],
  tagFeed: ["banned-post"],
  profileFeed: ["banned-post"],
  post: "banned-post",
  authorPostComments: ["viewer-comment", "banned-comment"],
  tracking: "banned-post",
  profile: "banned",
  artTag: "art",
  soloTag: "solo",
  sitemapCounts: { posts: 2, profiles: 2, tags: 2 },
  sitemapPosts: ["author-post", "banned-post"],
  sitemapProfiles: ["author", "banned"],
  sitemapTags: ["art", "solo"],
  atom: ["banned-post", "author-post"],
}

describe("banned author visibility", () => {
  it("shows an author's content when they are not banned", async () => {
    const database = seedDatabase()

    expect(await publicView(database)).toEqual(visibleView)
  })

  it("hides a banned author's posts, profile, and comments from every public read", async () => {
    const database = seedDatabase()
    ban(database, null)

    expect(await publicView(database)).toEqual({
      feed: ["author-post"],
      feedCommentCounts: { "author-post": 1 },
      followingFeed: [],
      tagFeed: [],
      profileFeed: [],
      post: null,
      authorPostComments: ["viewer-comment"],
      tracking: null,
      profile: null,
      artTag: "art",
      soloTag: null,
      sitemapCounts: { posts: 1, profiles: 1, tags: 1 },
      sitemapPosts: ["author-post"],
      sitemapProfiles: ["author"],
      sitemapTags: ["art"],
      atom: ["author-post"],
    })
  })

  it("hides content during a timed ban and shows it again after the ban expires", async () => {
    const database = seedDatabase()

    ban(database, new Date(Date.now() + DAY_MS))
    expect((await publicView(database)).post).toBeNull()

    ban(database, new Date(Date.now() - DAY_MS))
    expect(await publicView(database)).toEqual(visibleView)
  })

  it("shows content again after an unban", async () => {
    const database = seedDatabase()
    ban(database, null)
    database
      .update(user)
      .set({ banned: false, banExpires: null })
      .where(eq(user.id, "banned"))
      .run()

    expect(await publicView(database)).toEqual(visibleView)
  })

  it("keeps a banned author's media for the owner and active administrators only", () => {
    const database = seedDatabase()
    ban(database, null)
    const row = database
      .select({
        ownerId: mediaAssets.ownerId,
        postStatus: posts.status,
        authorBanned: bannedAccount(posts.authorId),
      })
      .from(mediaAssets)
      .leftJoin(postMedia, eq(postMedia.mediaId, mediaAssets.id))
      .leftJoin(posts, eq(posts.id, postMedia.postId))
      .where(eq(mediaAssets.id, "banned-video"))
      .get()
    if (!row) throw new Error("The seeded media row is missing.")

    const audience = mediaAudience({
      published: row.postStatus === "published",
      authorBanned: row.authorBanned,
    })
    const viewers = database
      .select({ id: user.id, role: user.role, banned: user.banned, banExpires: user.banExpires })
      .from(user)
      .all()
    const access = Object.fromEntries(
      viewers.map((viewer) => [viewer.id, canViewMedia(audience, row.ownerId, viewer)]),
    )

    expect(audience).toBe("owner-or-admin")
    expect(canViewMedia(audience, row.ownerId, null)).toBeFalse()
    expect(access).toEqual({ banned: true, author: false, viewer: false, admin: true })
  })
})
