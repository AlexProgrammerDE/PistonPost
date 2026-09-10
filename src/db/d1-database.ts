import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"

import * as schema from "./schema"

export type D1DatabaseClient = DrizzleD1Database<typeof schema> & {
  $client: D1DatabaseSession
}

/** Create one session per operation and reuse it for ORM queries and raw SQL. */
export function createD1Database(
  binding: D1Database,
  constraint: D1SessionConstraint = "first-primary",
): D1DatabaseClient {
  const session = binding.withSession(constraint)
  // Drizzle 0.45.2 only uses prepare() and batch(), both provided by D1 sessions.
  // Its input type still requires a full binding. Expose the actual session type
  // on $client so raw queries share its consistency guarantees.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- D1 sessions implement the driver's complete runtime contract.
  const database = drizzle(session as unknown as D1Database, { schema })
  return Object.assign(database, { $client: session })
}
