import { sql } from "drizzle-orm"
import { integer } from "drizzle-orm/sqlite-core"

export const now = sql`(unixepoch() * 1000)`

export function timestamp(name: string) {
  return integer(name, { mode: "timestamp_ms" })
}
