import { migrate } from "drizzle-orm/bun-sqlite/migrator"

import { createSqliteDatabase } from "./database"

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname

export function createMigratedTestDatabase() {
  const database = createSqliteDatabase()
  migrate(database, { migrationsFolder })
  return database
}
