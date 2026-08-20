import { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { z } from "zod"

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname
const journalSchema = z.object({
  version: z.string(),
  dialect: z.literal("sqlite"),
  entries: z.array(
    z.object({
      idx: z.number(),
      version: z.string(),
      when: z.number(),
      tag: z.string(),
      breakpoints: z.boolean(),
    }),
  ),
})
const migratedAccountSchema = z.object({
  issuer: z.string(),
  account_id: z.string(),
})
const tableColumnSchema = z.object({
  name: z.string(),
  notnull: z.number(),
})
const tableIndexSchema = z.object({
  name: z.string(),
  unique: z.number(),
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
  const journal = journalSchema.parse(JSON.parse(await readFile(journalPath, "utf8")))
  return journal
}

describe("Better Auth account issuer migration", () => {
  it("backfills a populated credential account before enforcing the issuer constraints", async () => {
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

      await writeFile(journalPath, JSON.stringify(journal))
      migrate(database, { migrationsFolder: temporaryFolder })

      const account = migratedAccountSchema.parse(
        client.query("SELECT issuer, account_id FROM account WHERE id = 'account-1'").get(),
      )
      const issuerColumn = z
        .array(tableColumnSchema)
        .parse(client.query("PRAGMA table_info('account')").all())
        .find((column) => column.name === "issuer")
      const issuerIndex = z
        .array(tableIndexSchema)
        .parse(client.query("PRAGMA index_list('account')").all())
        .find((index) => index.name === "account_issuer_accountId_uidx")

      expect(account).toEqual({ issuer: "local:credential", account_id: "user-1" })
      expect(issuerColumn?.notnull).toBe(1)
      expect(issuerIndex?.unique).toBe(1)
    } finally {
      client.close()
      await rm(temporaryFolder, { recursive: true })
    }
  })
})
