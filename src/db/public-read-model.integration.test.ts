import { afterEach, describe, expect, it } from "bun:test"

import { createPost, createUser } from "./factories"
import {
  getPublicSitemapCounts,
  getPublicTagRead,
  listPublicPostReads,
  listPublicPostSitemapRecords,
} from "./public-read-model"
import {
  mediaAssets,
  postMedia,
  posts,
  postTags,
  postViewCounts,
  profiles,
  reactions,
  tagFollows,
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

describe("following feed read model", () => {
  it("combines followed users and tags without duplicate or private posts", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    database
      .insert(user)
      .values([
        createUser({ id: "viewer", email: "viewer@example.com", name: "Viewer" }),
        createUser({ id: "followed", email: "followed@example.com", name: "Followed" }),
        createUser({ id: "tag-author", email: "tag@example.com", name: "Tag Author" }),
        createUser({ id: "other", email: "other@example.com", name: "Other" }),
      ])
      .run()
    database
      .insert(profiles)
      .values([
        { userId: "viewer", username: "viewer", normalizedUsername: "viewer" },
        { userId: "followed", username: "followed", normalizedUsername: "followed" },
        { userId: "tag-author", username: "tag-author", normalizedUsername: "tag-author" },
        { userId: "other", username: "other", normalizedUsername: "other" },
      ])
      .run()
    database
      .insert(posts)
      .values([
        createPost({
          id: "followed-and-tagged",
          authorId: "followed",
          status: "published",
          publishedAt: new Date("2026-01-04T00:00:00.000Z"),
        }),
        createPost({
          id: "tagged",
          authorId: "tag-author",
          status: "published",
          publishedAt: new Date("2026-01-03T00:00:00.000Z"),
        }),
        createPost({
          id: "followed",
          authorId: "followed",
          status: "published",
          publishedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
        createPost({
          id: "unlisted",
          authorId: "followed",
          status: "published",
          visibility: "unlisted",
          publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        createPost({
          id: "unrelated",
          authorId: "other",
          status: "published",
          publishedAt: new Date("2025-12-31T00:00:00.000Z"),
        }),
      ])
      .run()
    database.insert(postViewCounts).values({ postId: "followed", viewCount: 42 }).run()
    database.insert(reactions).values({ postId: "followed", userId: "viewer" }).run()
    database.insert(tags).values({ id: "art", displayName: "Art", normalizedName: "art" }).run()
    database
      .insert(postTags)
      .values([
        { postId: "followed-and-tagged", tagId: "art", ordinal: 0 },
        { postId: "tagged", tagId: "art", ordinal: 0 },
      ])
      .run()
    database.insert(userFollows).values({ followerId: "viewer", followedUserId: "followed" }).run()
    database.insert(tagFollows).values({ userId: "viewer", tagId: "art" }).run()

    const page = await listPublicPostReads(database, {
      cursor: null,
      followingUserId: "viewer",
      limit: 12,
    })

    expect(page.posts.map((post) => post.id)).toEqual(["followed-and-tagged", "tagged", "followed"])
    expect(page.posts.map((post) => post.viewCount)).toEqual([0, 0, 42])
    expect(page.posts.map((post) => post.heartCount)).toEqual([0, 0, 1])
    expect(page.nextCursor).toBeNull()
  })

  it("distinguishes empty tags and probationary content for search discovery", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    database
      .insert(user)
      .values([
        createUser({ id: "established", email: "established@example.com" }),
        createUser({
          id: "new-author",
          email: "new@example.com",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ])
      .run()
    database
      .insert(profiles)
      .values([
        {
          userId: "established",
          username: "established",
          normalizedUsername: "established",
        },
        { userId: "new-author", username: "new-author", normalizedUsername: "new-author" },
      ])
      .run()
    database
      .insert(posts)
      .values([
        createPost({
          id: "trusted-post",
          authorId: "established",
          status: "published",
          publishedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
        createPost({
          id: "probation-post",
          authorId: "new-author",
          status: "published",
          publishedAt: new Date(),
        }),
      ])
      .run()
    database
      .insert(tags)
      .values([
        { id: "trusted", displayName: "Trusted", normalizedName: "trusted" },
        { id: "probation", displayName: "Probation", normalizedName: "probation" },
        { id: "empty", displayName: "Empty", normalizedName: "empty" },
      ])
      .run()
    database
      .insert(postTags)
      .values([
        { postId: "trusted-post", tagId: "trusted", ordinal: 0 },
        { postId: "probation-post", tagId: "probation", ordinal: 0 },
      ])
      .run()

    expect(await getPublicTagRead(database, "empty")).toBeNull()
    expect((await getPublicTagRead(database, "probation"))?.searchIndexable).toBe(false)
    expect((await getPublicTagRead(database, "trusted"))?.searchIndexable).toBe(true)
    expect(await getPublicSitemapCounts(database)).toEqual({ posts: 1, profiles: 1, tags: 1 })
  })
})

describe("public sitemap read model", () => {
  it("hydrates ordered media for sitemap pages with more than 100 posts", async () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    const sitemapPostCount = 125
    const sitemapPosts = Array.from({ length: sitemapPostCount }, (_, index) => {
      const id = `sitemap-post-${index.toString().padStart(3, "0")}`
      const updatedAt = new Date(Date.UTC(2026, 0, 1, 0, index))
      return createPost({
        id,
        authorId: "sitemap-author",
        type: "images",
        title: `Sitemap post ${index.toString()}`,
        status: "published",
        publishedAt: updatedAt,
        updatedAt,
      })
    })

    database
      .insert(user)
      .values(createUser({ id: "sitemap-author", email: "sitemap@example.com" }))
      .run()
    database.insert(posts).values(sitemapPosts).run()
    database
      .insert(mediaAssets)
      .values(
        sitemapPosts.flatMap(
          (post): Array<typeof mediaAssets.$inferInsert> =>
            [0, 1].map((ordinal) => ({
              id: `${post.id}-media-${ordinal.toString()}`,
              ownerId: "sitemap-author",
              kind: "image",
              provider: "images",
              status: "ready",
              originalFilename: `${post.id}-${ordinal.toString()}.png`,
              mimeType: "image/png",
              byteSize: 1,
            })),
        ),
      )
      .run()
    database
      .insert(postMedia)
      .values(
        sitemapPosts.flatMap(
          (post): Array<typeof postMedia.$inferInsert> =>
            [1, 0].map((ordinal) => ({
              postId: post.id,
              mediaId: `${post.id}-media-${ordinal.toString()}`,
              ordinal,
            })),
        ),
      )
      .run()

    const records = await listPublicPostSitemapRecords(database, 10, 110)

    expect(records).toHaveLength(110)
    expect(records[0]?.id).toBe("sitemap-post-114")
    expect(records.at(-1)?.id).toBe("sitemap-post-005")
    expect(records[0]?.media.map((asset) => asset.id)).toEqual([
      "sitemap-post-114-media-0",
      "sitemap-post-114-media-1",
    ])
  })
})
