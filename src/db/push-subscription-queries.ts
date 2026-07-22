import { and, eq, gt, isNull, or } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import * as schema from "@/db/schema"

type ReadDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

export async function listActivePushSubscriptionIds(
  database: ReadDatabase,
  recipientUserId: string,
) {
  const now = new Date()
  return database
    .select({ subscriptionId: schema.pushSubscriptions.id })
    .from(schema.pushSubscriptions)
    .innerJoin(schema.session, eq(schema.session.id, schema.pushSubscriptions.sessionId))
    .where(
      and(
        eq(schema.pushSubscriptions.userId, recipientUserId),
        isNull(schema.pushSubscriptions.disabledAt),
        gt(schema.session.expiresAt, now),
        or(
          isNull(schema.pushSubscriptions.expirationTime),
          gt(schema.pushSubscriptions.expirationTime, now),
        ),
      ),
    )
}
