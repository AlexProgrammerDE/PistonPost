import { afterEach, describe, expect, it } from "bun:test"

import { createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import {
  EMAIL_CHANGE_AUDIT_ACTION,
  PREVIOUS_EMAIL_RETENTION_MS,
  redactExpiredPreviousEmails,
} from "./email-change-audit"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close()
})

const now = Date.parse("2026-03-01T00:00:00.000Z")

describe("email change audit retention", () => {
  it("removes previous addresses only from email changes past the retention window", async () => {
    const database = createMigratedTestDatabase()
    databases.push(database)
    database
      .insert(schema.user)
      .values(createUser({ id: "user" }))
      .run()
    const event = (id: string, action: string, age: number) => ({
      id,
      actorId: "user",
      action,
      entityType: "user",
      entityId: "user",
      metadata: { previousEmail: "old@example.com", source: "test" },
      createdAt: new Date(now - age),
    })
    database
      .insert(schema.auditEvents)
      .values([
        event("expired", EMAIL_CHANGE_AUDIT_ACTION, PREVIOUS_EMAIL_RETENTION_MS + 1),
        event("recent", EMAIL_CHANGE_AUDIT_ACTION, PREVIOUS_EMAIL_RETENTION_MS - 1),
        event("other-action", "auth.password-changed", PREVIOUS_EMAIL_RETENTION_MS + 1),
      ])
      .run()

    await redactExpiredPreviousEmails(database, now)

    const metadata = Object.fromEntries(
      database
        .select({ id: schema.auditEvents.id, metadata: schema.auditEvents.metadata })
        .from(schema.auditEvents)
        .all()
        .map((row) => [row.id, row.metadata]),
    )
    expect(metadata).toEqual({
      expired: { source: "test" },
      recent: { previousEmail: "old@example.com", source: "test" },
      "other-action": { previousEmail: "old@example.com", source: "test" },
    })
  })
})
