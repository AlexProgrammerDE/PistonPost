import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { Schema } from "effect"

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname
const journalSchema = Schema.Struct({
  version: Schema.String,
  dialect: Schema.Literal("sqlite"),
  entries: Schema.Array(
    Schema.Struct({
      idx: Schema.Finite,
      version: Schema.String,
      when: Schema.Finite,
      tag: Schema.String,
      breakpoints: Schema.Boolean,
    }),
  ),
})

describe("comment reply delete rule migration", () => {
  it("keeps existing reply links while foreign keys stay enforced, as on D1", async () => {
    const temporaryFolder = await mkdtemp(join(tmpdir(), "pistonpost-migrations-"))
    const client = new Database(":memory:", { create: true, strict: true })
    client.run("PRAGMA foreign_keys = ON")
    try {
      await cp(migrationsFolder, temporaryFolder, { recursive: true })
      const journalPath = join(temporaryFolder, "meta", "_journal.json")
      const journalText = await readFile(journalPath, "utf8")
      const journal = Schema.decodeUnknownSync(journalSchema, { errors: "all" })(
        JSON.parse(journalText),
      )
      // Seed replies on the schema that production has before the delete rule changes.
      await writeFile(
        journalPath,
        JSON.stringify({ ...journal, entries: journal.entries.filter(({ idx }) => idx <= 23) }),
      )

      const database = drizzle(client)
      migrate(database, { migrationsFolder: temporaryFolder })
      client.run(
        `INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
        VALUES ('author', 'Author', 'author@example.com', 1, 1, 1),
          ('replier', 'Replier', 'replier@example.com', 1, 1, 1)`,
      )
      client.run(
        `INSERT INTO posts (id, author_id, type, status, title, text_content)
        VALUES ('post', 'replier', 'text', 'draft', 'Post', 'Body')`,
      )
      client.run(
        `INSERT INTO comments (id, post_id, author_id, parent_id, content)
        VALUES ('parent', 'post', 'author', NULL, 'First'),
          ('reply', 'post', 'replier', 'parent', 'Reply')`,
      )

      await writeFile(journalPath, journalText)
      migrate(database, { migrationsFolder: temporaryFolder })

      expect(client.query("SELECT id, parent_id FROM comments ORDER BY id").all()).toEqual([
        { id: "parent", parent_id: null },
        { id: "reply", parent_id: "parent" },
      ])
      expect(
        client.query("SELECT name FROM sqlite_master WHERE name = '__comment_parents'").all(),
      ).toEqual([])

      client.run("DELETE FROM user WHERE id = 'author'")
      expect(client.query("SELECT id, parent_id FROM comments").all()).toEqual([
        { id: "reply", parent_id: null },
      ])
    } finally {
      client.close()
      await rm(temporaryFolder, { recursive: true })
    }
  })
})
