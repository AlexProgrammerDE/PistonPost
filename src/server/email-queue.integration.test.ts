import type { Database } from "bun:sqlite"
import { afterEach, describe, expect, mock, test } from "bun:test"

import { eq } from "drizzle-orm"

import { createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"
import { productEmailJob } from "@/email/jobs"

void mock.module("cloudflare:workers", () => ({
  cache: { purge: () => Promise.resolve({ success: true }) },
}))
const { handleQueue } = await import("./email-queue")

type Row = Record<string, unknown>

/** A D1 session over bun:sqlite with the statement surface Drizzle's D1 driver calls. */
function d1Binding(client: Database) {
  const prepare = (query: string, params: readonly unknown[] = []) => {
    const statement = client.query<Row, never[]>(query)
    const bound = params as never[]
    const rows = () => statement.all(...bound)
    return {
      rows,
      bind: (...next: unknown[]) => prepare(query, next),
      all: () => Promise.resolve({ results: rows(), success: true, meta: {} }),
      raw: () => Promise.resolve(statement.values(...bound)),
      first: () => Promise.resolve(statement.get(...bound)),
      run: () =>
        Promise.resolve({
          results: [],
          success: true,
          meta: { changes: statement.run(...bound).changes },
        }),
    }
  }
  type Statement = ReturnType<typeof prepare>
  const session = {
    prepare: (query: string) => prepare(query),
    batch: (statements: readonly Statement[]) =>
      Promise.resolve(
        client.transaction(() =>
          statements.map((statement) => ({ results: statement.rows(), success: true, meta: {} })),
        )(),
      ),
  }
  return { withSession: () => session } as unknown as D1Database
}

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close()
})

function setup() {
  const database = createMigratedTestDatabase()
  databases.push(database)
  const env = {
    DB: d1Binding(database.$client),
    ANALYTICS: { writeDataPoint: () => undefined },
  } as unknown as Cloudflare.Env
  return { database, env }
}

function queueMessage(body: unknown) {
  const acks: string[] = []
  return {
    acks,
    message: {
      id: "message-1",
      timestamp: new Date(),
      body,
      attempts: 5,
      ack: () => acks.push("ack"),
      retry: () => acks.push("retry"),
    } as unknown as Message,
  }
}

function seedCampaignDelivery(database: ReturnType<typeof setup>["database"]) {
  const job = productEmailJob("recipient", "campaign")
  database
    .insert(schema.user)
    .values(createUser({ id: "recipient", email: "recipient@example.com" }))
    .run()
  database
    .insert(schema.emailCampaigns)
    .values({
      id: "campaign",
      status: "sending",
      subject: "Update",
      preview: "Preview",
      heading: "Update",
      message: "A product update",
    })
    .run()
  database
    .insert(schema.outbox)
    .values({ id: job.idempotencyKey, kind: job.type, payload: job })
    .run()
  database
    .insert(schema.emailCampaignDeliveries)
    .values({ id: job.idempotencyKey, campaignId: "campaign", recipientUserId: "recipient" })
    .run()
  return job
}

function deliveryStatus(database: ReturnType<typeof setup>["database"], id: string) {
  return database
    .select({ status: schema.emailCampaignDeliveries.status })
    .from(schema.emailCampaignDeliveries)
    .where(eq(schema.emailCampaignDeliveries.id, id))
    .get()?.status
}

describe("dead-letter consumer", () => {
  test("keeps a campaign delivery that was already sent", async () => {
    const { database, env } = setup()
    const job = seedCampaignDelivery(database)
    const completedAt = new Date("2026-11-01T00:00:00.000Z")
    database
      .update(schema.outbox)
      .set({ processedAt: completedAt, completedReason: "provider-accepted" })
      .where(eq(schema.outbox.id, job.idempotencyKey))
      .run()
    database
      .update(schema.emailCampaignDeliveries)
      .set({ status: "sent", completedAt })
      .where(eq(schema.emailCampaignDeliveries.id, job.idempotencyKey))
      .run()
    const { acks, message } = queueMessage(job)

    await handleQueue(
      { queue: "jobs-dead-letter", messages: [message] } as unknown as MessageBatch,
      env,
    )

    expect(acks).toEqual(["ack"])
    expect(deliveryStatus(database, job.idempotencyKey)).toBe("sent")
    const outbox = database
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.id, job.idempotencyKey))
      .get()
    expect(outbox?.completedReason).toBe("provider-accepted")
    expect(outbox?.deadLetteredAt).toBeNull()
  })

  test("marks a queued campaign delivery as dead-lettered", async () => {
    const { database, env } = setup()
    const job = seedCampaignDelivery(database)
    const { acks, message } = queueMessage(job)

    await handleQueue(
      { queue: "jobs-dead-letter", messages: [message] } as unknown as MessageBatch,
      env,
    )

    expect(acks).toEqual(["ack"])
    expect(deliveryStatus(database, job.idempotencyKey)).toBe("dead-lettered")
    const outbox = database
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.id, job.idempotencyKey))
      .get()
    expect(outbox?.completedReason).toBe("dead-lettered")
    expect(outbox?.deadLetteredAt).toBeInstanceOf(Date)
  })
})
