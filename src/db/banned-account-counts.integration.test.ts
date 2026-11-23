import { afterEach, describe, expect, it } from "bun:test"

import { eq } from "drizzle-orm"

import { createPost, createUser } from "./factories"
import { listOwnedUnlistedPostReads } from "./owned-post-read-model"
import {
  countPostHearts,
  getPublicProfileRead,
  getPublishedPostRead,
  listPublicPostReads,
} from "./public-read-model"
import { comments, posts, profiles, reactions, user, userFollows } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The author has a public and an unlisted post. A fan and the account that the tests ban each
 * heart both posts, comment on the public post, and follow the author.
 */
function seedDatabase() {
  const database = createMigratedTestDatabase()
  close = () => {
    database.$client.close()
  }
  database
    .insert(user)
    .values([
      createUser({ id: "author", email: "author@example.com" }),
      createUser({ id: "fan", email: "fan@example.com" }),
      createUser({ id: "banned", email: "banned@example.com" }),
    ])
    .run()
  database
    .insert(profiles)
    .values([
      { userId: "author", username: "author", normalizedUsername: "author" },
      { userId: "fan", username: "fan", normalizedUsername: "fan" },
      { userId: "banned", username: "banned", normalizedUsername: "banned" },
    ])
    .run()
  database
    .insert(posts)
    .values([
      createPost({
        id: "public-post",
        authorId: "author",
        status: "published",
        publishedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
      createPost({
        id: "unlisted-post",
        authorId: "author",
        status: "published",
        visibility: "unlisted",
        publishedAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
    ])
    .run()
  database
    .insert(reactions)
    .values(
      ["fan", "banned"].flatMap((userId) => [
        { postId: "public-post", userId },
        { postId: "unlisted-post", userId },
      ]),
    )
    .run()
  database
    .insert(comments)
    .values(
      ["fan", "banned"].map((authorId) => ({
        id: `${authorId}-comment`,
        postId: "public-post",
        authorId,
        content: `From ${authorId}`,
      })),
    )
    .run()
  database
    .insert(userFollows)
    .values([
      { followerId: "fan", followedUserId: "author" },
      { followerId: "banned", followedUserId: "author" },
    ])
    .run()
  return database
}

type TestDatabase = ReturnType<typeof seedDatabase>

function ban(database: TestDatabase, banExpires: Date | null) {
  database.update(user).set({ banned: true, banExpires }).where(eq(user.id, "banned")).run()
}

async function counts(database: TestDatabase) {
  const [feed, detail, unlisted, publicHearts, profile] = await Promise.all([
    listPublicPostReads(database, { cursor: null, limit: 12 }),
    getPublishedPostRead(database, "public-post"),
    listOwnedUnlistedPostReads(database, {
      ownerId: "author",
      username: "author",
      cursor: null,
      limit: 12,
    }),
    countPostHearts(database, "public-post"),
    getPublicProfileRead(database, "author"),
  ])
  const feedPost = feed.posts.find((post) => post.id === "public-post")
  return {
    feedHearts: feedPost?.heartCount,
    feedComments: feedPost?.commentCount,
    detailHearts: detail?.heartCount,
    unlistedHearts: unlisted.posts[0]?.heartCount,
    publicHearts,
    followers: profile?.followerCount,
  }
}

const allCounted = {
  feedHearts: 2,
  feedComments: 2,
  detailHearts: 2,
  unlistedHearts: 2,
  publicHearts: 2,
  followers: 2,
}

const bannedLeftOut = {
  feedHearts: 1,
  feedComments: 1,
  detailHearts: 1,
  unlistedHearts: 1,
  publicHearts: 1,
  followers: 1,
}

describe("counts with banned accounts", () => {
  it("counts every heart, comment, and follower when nobody is banned", async () => {
    expect(await counts(seedDatabase())).toEqual(allCounted)
  })

  it("leaves out hearts, comments, and follows of a permanently banned account", async () => {
    const database = seedDatabase()
    ban(database, null)

    expect(await counts(database)).toEqual(bannedLeftOut)
  })

  it("leaves them out during a timed ban and counts them again after it expires", async () => {
    const database = seedDatabase()

    ban(database, new Date(Date.now() + DAY_MS))
    expect(await counts(database)).toEqual(bannedLeftOut)

    ban(database, new Date(Date.now() - DAY_MS))
    expect(await counts(database)).toEqual(allCounted)
  })
})
