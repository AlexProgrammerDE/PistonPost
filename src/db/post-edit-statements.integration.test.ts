import { describe, expect, test } from "bun:test"

import { cacheInvalidationJob } from "@/server/jobs"

import { createPost, createUser } from "./factories"
import { postEditStatements } from "./post-edit-statements"
import { mediaAssets, postMedia, posts, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

function fixture() {
  const database = createMigratedTestDatabase()
  database
    .insert(user)
    .values([
      createUser(),
      createUser({ id: "other", email: "other@example.com" }),
      createUser({ id: "admin", email: "admin@example.com", role: "admin" }),
    ])
    .run()
  database
    .insert(posts)
    .values(
      createPost({
        id: "post",
        type: "images",
        status: "published",
        publishedAt: new Date(),
        textContent: null,
      }),
    )
    .run()
  const ids = Array.from({ length: 3 }, () => crypto.randomUUID())
  database
    .insert(mediaAssets)
    .values(
      ids.map((id) => ({
        id,
        ownerId: "test-user",
        kind: "image" as const,
        provider: "r2" as const,
        status: "ready" as const,
        originalFilename: "cat.png",
        mimeType: "image/png",
        byteSize: 10,
        altText: "Original",
        providerMetadata: { editPostId: "post" },
      })),
    )
    .run()
  const [first = "", second = "", added = ""] = ids
  database
    .insert(postMedia)
    .values([
      { postId: "post", mediaId: first, ordinal: 0, caption: "Keep this caption" },
      { postId: "post", mediaId: second, ordinal: 1 },
    ])
    .run()
  return { database, first, second, added }
}

function save(
  database: ReturnType<typeof createMigratedTestDatabase>,
  images: { id: string; altText: string }[] | undefined,
  version = 1,
  actorId = "test-user",
) {
  const invalidate = cacheInvalidationJob("post")
  const statements = postEditStatements(
    {
      id: "post",
      version,
      actorId,
      title: "Edited gallery",
      textContent: null,
      visibility: "unlisted",
      tags: [{ id: "tag-cats", display: "Cats", normalized: "cats", ordinal: 0 }],
      images,
    },
    invalidate,
  )
  const changes = database.$client.transaction(() =>
    statements.map(({ sql, params }) => database.$client.query(sql).run(...params).changes),
  )()
  return changes.at(-1)
}

describe("atomic post edits", () => {
  test("adds, removes, reorders, and edits alt text while preserving captions", () => {
    const { database, first, second, added } = fixture()
    try {
      expect(
        save(database, [
          { id: added, altText: "New cat" },
          { id: first, altText: "Updated cat" },
        ]),
      ).toBe(1)
      expect(
        database.$client
          .query("select media_id, ordinal, caption from post_media order by ordinal")
          .all(),
      ).toEqual([
        { media_id: added, ordinal: 0, caption: null },
        { media_id: first, ordinal: 1, caption: "Keep this caption" },
      ])
      expect(
        database.$client.query("select alt_text from media_assets where id = ?").get(first),
      ).toEqual({ alt_text: "Updated cat" })
      expect(
        database.$client
          .query("select version, title, visibility from posts where id = 'post'")
          .get(),
      ).toEqual({ version: 2, title: "Edited gallery", visibility: "unlisted" })
      expect(
        database.$client
          .query("select payload from outbox where id = ?")
          .get(`media.cleanup:${second}`),
      ).toBeTruthy()
      expect(
        database.$client
          .query("select count(*) as count from outbox where kind = 'cache.invalidate'")
          .get(),
      ).toEqual({ count: 1 })
      expect(
        database.$client
          .query("select display_name from tags join post_tags on tags.id = post_tags.tag_id")
          .get(),
      ).toEqual({ display_name: "Cats" })
      expect(
        save(
          database,
          [
            { id: first, altText: "" },
            { id: added, altText: "" },
          ],
          2,
        ),
      ).toBe(1)
      expect(
        database.$client.query("select alt_text from media_assets where id = ?").get(first),
      ).toEqual({ alt_text: null })
    } finally {
      database.$client.close()
    }
  })

  test("a stale save changes neither gallery, metadata, tags, nor cleanup work", () => {
    const { database, first, second, added } = fixture()
    try {
      save(database, [
        { id: second, altText: "Winner" },
        { id: first, altText: "Kept" },
      ])
      const before = database.$client.serialize()
      expect(save(database, [{ id: added, altText: "Stale" }])).toBe(0)
      expect(database.$client.serialize()).toEqual(before)
    } finally {
      database.$client.close()
    }
  })

  for (const invalid of [
    "foreign",
    "wrong-post",
    "attached-elsewhere",
    "pending",
    "video",
    "cleanup",
    "missing",
    "unauthorized",
    "deleted",
  ] as const) {
    test(`rejects ${invalid} without partial changes`, () => {
      const { database, added } = fixture()
      try {
        if (invalid === "foreign")
          database.$client.run("update media_assets set owner_id = 'other' where id = ?", [added])
        if (invalid === "wrong-post")
          database.$client.run("update media_assets set provider_metadata = '{}' where id = ?", [
            added,
          ])
        if (invalid === "pending")
          database.$client.run("update media_assets set status = 'pending' where id = ?", [added])
        if (invalid === "video")
          database.$client.run("update media_assets set kind = 'video' where id = ?", [added])
        if (invalid === "cleanup")
          database.$client.run(
            "insert into outbox (id, kind, payload) values (?, 'media.cleanup', '{}')",
            [`media.cleanup:${added}`],
          )
        if (invalid === "deleted")
          database.$client.run("update posts set status = 'deleted' where id = 'post'")
        if (invalid === "attached-elsewhere") {
          database
            .insert(posts)
            .values(createPost({ id: "elsewhere" }))
            .run()
          database
            .insert(postMedia)
            .values({ postId: "elsewhere", mediaId: added, ordinal: 0 })
            .run()
        }
        const before = database.$client.serialize()
        expect(
          save(
            database,
            [{ id: invalid === "missing" ? "missing" : added, altText: "Changed" }],
            1,
            invalid === "unauthorized" ? "other" : "test-user",
          ),
        ).toBe(0)
        expect(database.$client.serialize()).toEqual(before)
      } finally {
        database.$client.close()
      }
    })
  }

  test("admins can retain another owner's images and add images on their behalf", () => {
    const { database, first, added } = fixture()
    try {
      database.$client.run("update media_assets set owner_id = 'admin' where id = ?", [added])
      expect(
        save(
          database,
          [
            { id: added, altText: "Added" },
            { id: first, altText: "Retained" },
          ],
          1,
          "admin",
        ),
      ).toBe(1)
      expect(
        database.$client.query("select owner_id from media_assets where id = ?").get(added),
      ).toEqual({ owner_id: "test-user" })
    } finally {
      database.$client.close()
    }
  })

  test("metadata-only saves preserve the current gallery", () => {
    const { database } = fixture()
    try {
      const before = database.$client.query("select * from post_media order by ordinal").all()
      expect(save(database, undefined)).toBe(1)
      expect(database.$client.query("select * from post_media order by ordinal").all()).toEqual(
        before,
      )
    } finally {
      database.$client.close()
    }
  })

  test("rolls back the complete edit if a later statement fails", () => {
    const { database, added } = fixture()
    try {
      database.$client.run(
        "create trigger reject_post_edit before update on posts begin select raise(abort, 'test failure'); end",
      )
      const before = database.$client.serialize()
      expect(() => save(database, [{ id: added, altText: "Changed" }])).toThrow("test failure")
      expect(database.$client.serialize()).toEqual(before)
    } finally {
      database.$client.close()
    }
  })

  test("saves a full 150-image gallery with bounded statement parameters", () => {
    const { database } = fixture()
    try {
      const images = Array.from({ length: 150 }, () => ({
        id: crypto.randomUUID(),
        altText: "Cat",
      }))
      database
        .insert(mediaAssets)
        .values(
          images.map(({ id }) => ({
            id,
            ownerId: "test-user",
            kind: "image" as const,
            provider: "r2" as const,
            status: "ready" as const,
            originalFilename: "cat.png",
            mimeType: "image/png",
            byteSize: 10,
            providerMetadata: { editPostId: "post" },
          })),
        )
        .run()
      expect(save(database, images)).toBe(1)
      expect(database.$client.query("select count(*) as count from post_media").get()).toEqual({
        count: 150,
      })
      expect(
        database.$client.query("select media_id from post_media order by ordinal").all(),
      ).toEqual(images.map(({ id }) => ({ media_id: id })))
      expect(
        postEditStatements(
          {
            id: "post",
            version: 2,
            actorId: "test-user",
            title: "Gallery",
            textContent: null,
            visibility: "public",
            tags: [],
            images,
          },
          cacheInvalidationJob("post"),
        ).every(({ params }) => params.length < 20),
      ).toBe(true)
    } finally {
      database.$client.close()
    }
  })
})
