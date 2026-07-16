import { afterEach, describe, expect, test } from "bun:test"

import { createMigratedTestDatabase } from "./test-database"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close()
})

function details(rows: unknown[]) {
  return rows
    .filter(
      (row): row is Readonly<Record<string, unknown>> =>
        row !== null && typeof row === "object" && !Array.isArray(row),
    )
    .map((row) => row.detail)
    .filter((detail): detail is string => typeof detail === "string")
    .join("\n")
}

function plan(query: string) {
  const database = createMigratedTestDatabase()
  databases.push(database)
  return details(database.$client.query(`EXPLAIN QUERY PLAN ${query}`).all())
}

describe("hot D1 query plans", () => {
  test("uses the discovery index for the public feed cursor", () => {
    expect(
      plan(`SELECT id FROM posts
        WHERE status = 'published' AND visibility = 'public'
          AND (published_at < 1000 OR (published_at = 1000 AND id < 'cursor'))
        ORDER BY published_at DESC, id DESC LIMIT 21`),
    ).toContain("posts_discovery_idx")
  })

  test("uses relationship indexes for comments, reactions, and owner media", () => {
    expect(
      plan(`SELECT id FROM comments
        WHERE post_id = 'post' AND status = 'published'
        ORDER BY created_at DESC LIMIT 26`),
    ).toContain("comments_post_status_created_idx")
    expect(
      plan("SELECT type, count(*) FROM reactions WHERE post_id = 'post' GROUP BY type"),
    ).toContain("reactions_post_type_idx")
    expect(
      plan(`SELECT id FROM media_assets
        WHERE owner_id = 'user' AND status = 'ready'
        ORDER BY created_at DESC LIMIT 21`),
    ).toContain("media_assets_owner_status_created_idx")
  })

  test("uses relationship indexes for the Following feed", () => {
    const followingPlan = plan(`SELECT id FROM posts
      WHERE status = 'published' AND visibility = 'public'
        AND (
          exists (
            select 1 from user_follows
            where follower_id = 'viewer' and followed_user_id = posts.author_id
          )
          or exists (
            select 1 from post_tags
            inner join tag_follows on tag_follows.tag_id = post_tags.tag_id
            where post_tags.post_id = posts.id and tag_follows.user_id = 'viewer'
          )
        )
      ORDER BY published_at DESC, id DESC LIMIT 13`)

    expect(followingPlan).toContain("posts_discovery_idx")
    expect(followingPlan).toContain("sqlite_autoindex_user_follows_1")
    expect(followingPlan).toContain("sqlite_autoindex_tag_follows_1")
  })
})
