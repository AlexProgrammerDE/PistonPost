import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { Schema } from "effect"

import { isValidUsername } from "@/domain/validation"

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

const renamedRow = Schema.Struct({
  user_id: Schema.String,
  username: Schema.String,
  normalized_username: Schema.String,
  user_username: Schema.NullOr(Schema.String),
  display_username: Schema.NullOr(Schema.String),
})

describe("dot-only username migration", () => {
  it("renames dot-only usernames in profiles and users and leaves other names alone", async () => {
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
      const renameMigration = journal.entries.find(({ tag }) =>
        tag.endsWith("rename-dot-only-usernames"),
      )
      if (!renameMigration) throw new Error("The dot-only username migration is missing.")
      // Seed the schema production has before the rename runs.
      await writeFile(
        journalPath,
        JSON.stringify({
          ...journal,
          entries: journal.entries.filter(({ idx }) => idx < renameMigration.idx),
        }),
      )

      const database = drizzle(client)
      migrate(database, { migrationsFolder: temporaryFolder })
      client.run(
        `INSERT INTO user (id, name, email, email_verified, username, display_username, created_at, updated_at)
        VALUES ('dot', 'Dot', 'dot@example.com', 1, '.', '.', 1, 1),
          ('dots', 'Dots', 'dots@example.com', 1, '..', '..', 1, 1),
          ('alice', 'Alice', 'alice@example.com', 1, 'alice', 'Alice', 1, 1)`,
      )
      client.run(
        `INSERT INTO profiles (user_id, username, normalized_username, created_at, updated_at)
        VALUES ('dot', '.', '.', 1, 1), ('dots', '..', '..', 1, 1), ('alice', 'Alice', 'alice', 1, 1)`,
      )

      await writeFile(journalPath, journalText)
      migrate(database, { migrationsFolder: temporaryFolder })

      const rows = client
        .query(
          `SELECT profiles.user_id, profiles.username, profiles.normalized_username,
            user.username AS user_username, user.display_username
          FROM profiles JOIN user ON user.id = profiles.user_id
          ORDER BY profiles.user_id`,
        )
        .all()
        .map((row) => Schema.decodeUnknownSync(renamedRow)(row))

      const [alice, dot, dots] = rows
      expect(alice).toEqual({
        user_id: "alice",
        username: "Alice",
        normalized_username: "alice",
        user_username: "alice",
        display_username: "Alice",
      })
      for (const renamed of [dot, dots]) {
        expect(renamed?.username).toMatch(/^user-[0-9a-f]{8}$/u)
        expect(isValidUsername(renamed?.username ?? "")).toBe(true)
        expect(renamed?.normalized_username).toBe(renamed?.username)
        expect(renamed?.user_username).toBe(renamed?.username)
        expect(renamed?.display_username).toBe(renamed?.username)
      }
      expect(dot?.username).not.toBe(dots?.username)
      expect(
        client.query("SELECT name FROM sqlite_master WHERE name = '__dot_username_renames'").all(),
      ).toEqual([])
    } finally {
      client.close()
      await rm(temporaryFolder, { recursive: true })
    }
  })
})
