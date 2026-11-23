import { Database } from "bun:sqlite"
import { afterEach, describe, expect, it } from "bun:test"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { Schema } from "effect"

import { createUser } from "./factories"
import { contentReports, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

describe("content reports", () => {
  it("retains moderation evidence when the reporter account is deleted", () => {
    const database = createMigratedTestDatabase()
    close = () => {
      database.$client.close()
    }
    const reporter = createUser({ id: "reporter" })
    database.insert(user).values(reporter).run()
    database
      .insert(contentReports)
      .values({
        id: "report-one",
        reporterId: reporter.id,
        targetType: "post",
        targetId: "post-one",
        reason: "spam",
      })
      .run()

    database
      .delete(user)
      .where(sql`true`)
      .run()

    expect(database.select().from(contentReports).get()?.reporterId).toBeNull()
  })

  it("enforces report details at the database boundary", () => {
    const database = createMigratedTestDatabase()
    close = () => {
      database.$client.close()
    }

    expect(() => {
      database
        .insert(contentReports)
        .values({
          id: "invalid-report",
          targetType: "profile",
          targetId: "alex",
          reason: "other",
          details: "x".repeat(1001),
        })
        .run()
    }).toThrow()
  })

  it("keeps one open report per reporter and target, even when submissions race", () => {
    const database = createMigratedTestDatabase()
    close = () => {
      database.$client.close()
    }
    database
      .insert(user)
      .values(createUser({ id: "reporter" }))
      .run()
    const submit = (id: string) =>
      database
        .insert(contentReports)
        .values({
          id,
          reporterId: "reporter",
          targetType: "post",
          targetId: "post-one",
          reason: "spam",
        })
        .onConflictDoNothing()
        .returning({ id: contentReports.id })
        .all()

    expect(submit("first")).toEqual([{ id: "first" }])
    expect(submit("second")).toEqual([])

    database
      .update(contentReports)
      .set({ status: "dismissed" })
      .where(eq(contentReports.id, "first"))
      .run()
    expect(submit("after-review")).toEqual([{ id: "after-review" }])
  })

  it("keeps open reports whose reporter account was deleted", () => {
    const database = createMigratedTestDatabase()
    close = () => {
      database.$client.close()
    }
    for (const id of ["orphan-one", "orphan-two"]) {
      database
        .insert(contentReports)
        .values({ id, targetType: "profile", targetId: "alex", reason: "other" })
        .run()
    }

    expect(database.select().from(contentReports).all()).toHaveLength(2)
  })
})

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
const reportRow = Schema.Struct({
  id: Schema.String,
  status: Schema.String,
  resolved_at: Schema.NullOr(Schema.Finite),
})

describe("duplicate open report migration", () => {
  it("dismisses later duplicate open reports before adding the unique index", async () => {
    const temporaryFolder = await mkdtemp(join(tmpdir(), "pistonpost-migrations-"))
    const client = new Database(":memory:", { create: true, strict: true })
    client.run("PRAGMA foreign_keys = ON")
    try {
      await cp(migrationsFolder, temporaryFolder, { recursive: true })
      const journalPath = join(temporaryFolder, "meta", "_journal.json")
      const journalText = await readFile(journalPath, "utf8")
      const journal = Schema.decodeUnknownSync(journalSchema)(JSON.parse(journalText))
      const dedupe = journal.entries.find(({ tag }) =>
        tag.endsWith("dismiss-duplicate-open-reports"),
      )
      if (!dedupe) throw new Error("The duplicate report migration is missing.")
      await writeFile(
        journalPath,
        JSON.stringify({
          ...journal,
          entries: journal.entries.filter(({ idx }) => idx < dedupe.idx),
        }),
      )

      const database = drizzle(client)
      migrate(database, { migrationsFolder: temporaryFolder })
      client.run(
        `INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
        VALUES ('reporter', 'Reporter', 'reporter@example.com', 1, 1, 1),
          ('other', 'Other', 'other@example.com', 1, 1, 1)`,
      )
      client.run(
        `INSERT INTO content_reports (id, reporter_id, target_type, target_id, reason, status, created_at, updated_at)
        VALUES ('kept', 'reporter', 'post', 'post-one', 'spam', 'open', 1, 1),
          ('duplicate-a', 'reporter', 'post', 'post-one', 'other', 'open', 2, 2),
          ('duplicate-b', 'reporter', 'post', 'post-one', 'spam', 'open', 3, 3),
          ('reviewed', 'reporter', 'post', 'post-one', 'spam', 'resolved', 0, 0),
          ('other-target', 'reporter', 'comment', 'post-one', 'spam', 'open', 2, 2),
          ('other-reporter', 'other', 'post', 'post-one', 'spam', 'open', 2, 2),
          ('orphan-one', NULL, 'post', 'post-one', 'spam', 'open', 1, 1),
          ('orphan-two', NULL, 'post', 'post-one', 'spam', 'open', 2, 2)`,
      )

      await writeFile(journalPath, journalText)
      migrate(database, { migrationsFolder: temporaryFolder })

      const rows = client
        .query("SELECT id, status, resolved_at FROM content_reports ORDER BY id")
        .all()
        .map((row) => Schema.decodeUnknownSync(reportRow)(row))
      expect(rows.map(({ id, status }) => [id, status])).toEqual([
        ["duplicate-a", "dismissed"],
        ["duplicate-b", "dismissed"],
        ["kept", "open"],
        ["orphan-one", "open"],
        ["orphan-two", "open"],
        ["other-reporter", "open"],
        ["other-target", "open"],
        ["reviewed", "resolved"],
      ])
      expect(rows.find(({ id }) => id === "duplicate-a")?.resolved_at).toBeGreaterThan(0)
      expect(() => {
        client.run(
          `INSERT INTO content_reports (id, reporter_id, target_type, target_id, reason)
          VALUES ('late', 'reporter', 'post', 'post-one', 'spam')`,
        )
      }).toThrow()
    } finally {
      client.close()
      await rm(temporaryFolder, { recursive: true })
    }
  })
})
