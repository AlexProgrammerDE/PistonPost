import { drizzle, type AnyD1Database } from "drizzle-orm/d1"

import * as schema from "./schema"

export function createD1Database(binding: AnyD1Database) {
  return drizzle(binding, { schema })
}

export type D1DatabaseClient = ReturnType<typeof createD1Database>
