import { drizzle, type AnyD1Database, type DrizzleD1Database } from "drizzle-orm/d1"

import * as schema from "./schema"

/** Use the primary directly for mutations, authorization, and standalone fresh reads. */
export function createD1Database(binding: AnyD1Database) {
  return drizzle(binding, { schema })
}

export type D1DatabaseClient = ReturnType<typeof createD1Database>

/** Create one session per read operation and reuse it for all related queries. */
export function createD1ReadDatabase(
  binding: D1Database,
  constraint: D1SessionConstraint,
): DrizzleD1Database<typeof schema> {
  const session = binding.withSession(constraint)
  // Drizzle 0.45.2 only uses prepare() and batch(), both provided by D1 sessions.
  // Its D1 input type still requires the full binding. Keep that type assertion
  // here and omit $client from the return type so callers cannot use binding APIs.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- D1 sessions implement the driver's complete runtime contract.
  return drizzle(session as unknown as D1Database, { schema })
}
