import { Database } from "bun:sqlite"

import { drizzle as drizzleBun } from "drizzle-orm/bun-sqlite"

import * as schema from "./schema"

export function createSqliteDatabase(filename = ":memory:") {
  const client = new Database(filename, { create: true, strict: true })
  client.run("PRAGMA foreign_keys = ON")
  return drizzleBun(client, { schema })
}

export type SqliteDatabaseClient = ReturnType<typeof createSqliteDatabase>
