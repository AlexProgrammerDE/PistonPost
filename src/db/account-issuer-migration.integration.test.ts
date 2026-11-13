import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { Schema } from "effect"

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname
const journalSchema = Schema.Struct({
  version: Schema.String,
  dialect: Schema.Literal("sqlite"),
  entries: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        idx: Schema.Finite,
        version: Schema.String,
        when: Schema.Finite,
        tag: Schema.String,
        breakpoints: Schema.Boolean,
      }),
    ),
  ),
})
const migratedAccountSchema = Schema.Struct({
  issuer: Schema.String,
  account_id: Schema.String,
})
const tableColumnSchema = Schema.Struct({
  name: Schema.String,
  notnull: Schema.Finite,
})
const tableIndexSchema = Schema.Struct({
  name: Schema.String,
  unique: Schema.Finite,
})

async function copyMigrations(targetFolder: string) {
  await mkdir(join(targetFolder, "meta"))
  const filenames = await readdir(migrationsFolder)
  await Promise.all(
    filenames
      .filter((filename) => filename.endsWith(".sql"))
      .map((filename) => copyFile(join(migrationsFolder, filename), join(targetFolder, filename))),
  )

  const journalPath = join(migrationsFolder, "meta", "_journal.json")
  const journal = Schema.decodeUnknownSync(journalSchema, { errors: "all" })(
    JSON.parse(await readFile(journalPath, "utf8")),
  )
  return journal
}

describe("Better Auth account issuer migration", () => {
  it("preserves credential accounts through issuer backfill and removal", async () => {
    const temporaryFolder = await mkdtemp(join(tmpdir(), "pistonpost-migrations-"))
    const client = new Database(":memory:", { create: true, strict: true })

    try {
      const journal = await copyMigrations(temporaryFolder)
      const journalPath = join(temporaryFolder, "meta", "_journal.json")
      const migrationsBeforeIssuer = {
        ...journal,
        entries: journal.entries.filter((entry) => entry.idx <= 17),
      }
      await writeFile(journalPath, JSON.stringify(migrationsBeforeIssuer))

      const database = drizzle(client)
      migrate(database, { migrationsFolder: temporaryFolder })
      client.run(
        `INSERT INTO user
          (id, name, email, email_verified, created_at, updated_at)
        VALUES
          ('user-1', 'Migration User', 'migration@example.com', 1, 1, 1)`,
      )
      client.run(
        `INSERT INTO account
          (id, account_id, provider_id, user_id, password, created_at, updated_at)
        VALUES
          ('account-1', 'legacy-account-id', 'credential', 'user-1', 'hash', 1, 1)`,
      )

      await writeFile(
        journalPath,
        JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx <= 20) }),
      )
      migrate(database, { migrationsFolder: temporaryFolder })

      const account = Schema.decodeUnknownSync(migratedAccountSchema, { errors: "all" })(
        client.query("SELECT issuer, account_id FROM account WHERE id = 'account-1'").get(),
      )
      const issuerColumn = Schema.decodeUnknownSync(
        Schema.mutable(Schema.Array(tableColumnSchema)),
        { errors: "all" },
      )(client.query("PRAGMA table_info('account')").all()).find(
        (column) => column.name === "issuer",
      )
      const issuerIndex = Schema.decodeUnknownSync(Schema.mutable(Schema.Array(tableIndexSchema)), {
        errors: "all",
      })(client.query("PRAGMA index_list('account')").all()).find(
        (index) => index.name === "account_issuer_accountId_uidx",
      )

      expect(account).toEqual({ issuer: "local:credential", account_id: "user-1" })
      expect(issuerColumn?.notnull).toBe(1)
      expect(issuerIndex?.unique).toBe(1)

      await writeFile(journalPath, JSON.stringify(journal))
      migrate(database, { migrationsFolder: temporaryFolder })

      const preservedAccount = client
        .query("SELECT id, account_id, provider_id, user_id, password FROM account WHERE id = ?")
        .get("account-1")
      expect(preservedAccount).toEqual({
        id: "account-1",
        account_id: "user-1",
        provider_id: "credential",
        user_id: "user-1",
        password: "hash",
      })
      expect(
        Schema.decodeUnknownSync(Schema.mutable(Schema.Array(tableColumnSchema)), {
          errors: "all",
        })(client.query("PRAGMA table_info('account')").all()),
      ).not.toContainEqual(expect.objectContaining({ name: "issuer" }))
      client.run(
        `INSERT INTO account
          (id, account_id, provider_id, user_id, password, created_at, updated_at)
        VALUES
          ('account-2', 'user-1', 'another-provider', 'user-1', NULL, 1, 1)`,
      )
      expect(client.query("SELECT COUNT(*) AS count FROM account").get()).toEqual({ count: 2 })
    } finally {
      client.close()
      await rm(temporaryFolder, { recursive: true })
    }
  })
})
