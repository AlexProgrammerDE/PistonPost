import { afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"

import { createPost, createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"

import { cacheInvalidationJob, mediaCleanupJob, videoAccessJob } from "./jobs"
import {
  adminMediaCleanupStatements,
  adminMediaPostHref,
  type AdminStatement,
  moderationStatements,
  retryJobStatements,
} from "./tables"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.$client.close()
})

function setup() {
  const db = createMigratedTestDatabase()
  databases.push(db)
  db.insert(schema.user)
    .values([createUser(), createUser({ id: "admin", email: "admin@example.com", role: "admin" })])
    .run()
  return db
}

type Database = ReturnType<typeof setup>

function run(db: Database, statements: readonly AdminStatement[]) {
  return db.$client.transaction(() =>
    statements.map(({ sql, params }) => db.$client.query(sql).run(...params).changes),
  )()
}

function outboxRow(db: Database, id: string) {
  return db.select().from(schema.outbox).where(eq(schema.outbox.id, id)).get()
}

function seedJob(db: Database, values: Partial<typeof schema.outbox.$inferInsert>) {
  db.insert(schema.emailCampaigns)
    .values({
      id: "campaign",
      status: "sending",
      subject: "Update",
      preview: "Preview",
      heading: "Update",
      message: "A product update",
    })
    .run()
  db.insert(schema.outbox)
    .values({ id: "job", kind: "email.product", payload: { type: "email.product" }, ...values })
    .run()
  db.insert(schema.emailCampaignDeliveries)
    .values({
      id: "job",
      campaignId: "campaign",
      recipientUserId: "test-user",
      status: "dead-lettered",
      completedAt: new Date(),
    })
    .run()
}

function retry(db: Database, now = Date.now()) {
  return run(
    db,
    retryJobStatements({ id: "job", actorId: "admin", auditId: crypto.randomUUID() }, now),
  )
}

function seedPost(db: Database, status: "published" | "moderated") {
  db.insert(schema.posts)
    .values(createPost({ id: "post", type: "video", status, publishedAt: new Date() }))
    .run()
}

function moderate(db: Database, action: "hide" | "restore") {
  const eventId = crypto.randomUUID()
  const jobs = [cacheInvalidationJob("post"), videoAccessJob("post", eventId)] as const
  return {
    jobs,
    changes: run(
      db,
      moderationStatements(
        {
          target: "post",
          id: "post",
          action,
          reason: "Breaks the rules",
          actorId: "admin",
          eventId,
          expectedStatus: action === "hide" ? "published" : "moderated",
          nextStatus: action === "hide" ? "moderated" : "published",
        },
        jobs,
        Date.now(),
      ),
    ),
  }
}

describe("administrator job retry", () => {
  test("resets a dead-lettered job, its delivery receipt, and records the retry", () => {
    const db = setup()
    seedJob(db, { deadLetteredAt: new Date(), lastError: "Queue retries exhausted." })
    expect(retry(db).at(-1)).toBe(1)
    expect(outboxRow(db, "job")).toMatchObject({ deadLetteredAt: null, lastError: null })
    expect(db.select().from(schema.emailCampaignDeliveries).get()).toMatchObject({
      status: "queued",
      completedAt: null,
    })
    expect(db.select().from(schema.auditEvents).get()).toMatchObject({
      action: "job.retry",
      actorId: "admin",
      entityId: "job",
    })
  })

  test("leaves a job that a worker holds or that already finished untouched", () => {
    for (const values of [
      { leaseExpiresAt: new Date(Date.now() + 60_000) },
      { processedAt: new Date(), completedReason: "provider-accepted" },
    ]) {
      const db = setup()
      seedJob(db, values)
      const before = outboxRow(db, "job")
      expect(retry(db).at(-1)).toBe(0)
      expect(outboxRow(db, "job")).toEqual(before)
      expect(db.select().from(schema.emailCampaignDeliveries).get()?.status).toBe("dead-lettered")
      expect(db.select().from(schema.auditEvents).all()).toHaveLength(0)
    }
  })

  test("recovers a job whose worker lease expired", () => {
    const db = setup()
    seedJob(db, { leaseExpiresAt: new Date(Date.now() - 1000), attempts: 2 })
    expect(retry(db).at(-1)).toBe(1)
    expect(outboxRow(db, "job")).toMatchObject({ leaseExpiresAt: null, attempts: 2 })
  })
})

describe("administrator media cleanup", () => {
  const mediaId = "0b0d6c35-7f1c-4a55-9d4d-2f4b1c1e9a10"
  const job = mediaCleanupJob(mediaId)
  const cleanup = (db: Database) =>
    run(
      db,
      adminMediaCleanupStatements(
        { mediaId, actorId: "admin", auditId: crypto.randomUUID() },
        Date.now(),
      ),
    )

  test("queues a new cleanup and records it", () => {
    const db = setup()
    expect(cleanup(db)[0]).toBe(1)
    expect(outboxRow(db, job.idempotencyKey)).toMatchObject({ kind: "media.cleanup", payload: job })
    expect(db.select().from(schema.auditEvents).get()?.action).toBe("media.cleanup")
  })

  test("revives a dead-lettered cleanup instead of silently doing nothing", () => {
    const db = setup()
    db.insert(schema.outbox)
      .values({
        id: job.idempotencyKey,
        kind: job.type,
        payload: job,
        attempts: 5,
        deadLetteredAt: new Date(),
        completedReason: "dead-lettered",
      })
      .run()
    expect(cleanup(db)[0]).toBe(1)
    expect(outboxRow(db, job.idempotencyKey)).toMatchObject({
      deadLetteredAt: null,
      processedAt: null,
      completedReason: null,
    })
    expect(db.select().from(schema.auditEvents).all()).toHaveLength(1)
  })

  test("reports a cleanup that a worker currently holds", () => {
    const db = setup()
    db.insert(schema.outbox)
      .values({
        id: job.idempotencyKey,
        kind: job.type,
        payload: job,
        attempts: 1,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .run()
    expect(cleanup(db)[0]).toBe(0)
    expect(db.select().from(schema.auditEvents).all()).toHaveLength(0)
  })
})

describe("administrator moderation", () => {
  test("hides a post with its audit event and follow-up jobs in one change", () => {
    const db = setup()
    seedPost(db, "published")
    const { changes, jobs } = moderate(db, "hide")
    expect(changes.at(-1)).toBe(1)
    expect(db.select().from(schema.posts).get()).toMatchObject({
      status: "moderated",
      moderationReason: "Breaks the rules",
    })
    expect(
      db
        .select({ id: schema.outbox.id })
        .from(schema.outbox)
        .all()
        .map(({ id }) => id)
        .toSorted(),
    ).toEqual(jobs.map((job) => job.idempotencyKey).toSorted())
    expect(db.select().from(schema.auditEvents).get()).toMatchObject({
      action: "post.hide",
      metadata: { reason: "Breaks the rules" },
    })
  })

  test("writes no audit event or jobs when another moderator changed the post first", () => {
    const db = setup()
    seedPost(db, "moderated")
    expect(moderate(db, "hide").changes.at(-1)).toBe(0)
    expect(db.select().from(schema.posts).get()?.status).toBe("moderated")
    expect(db.select().from(schema.outbox).all()).toHaveLength(0)
    expect(db.select().from(schema.auditEvents).all()).toHaveLength(0)
  })
})

function mediaHrefs(db: Database) {
  return db
    .select({ id: schema.mediaAssets.id, href: adminMediaPostHref })
    .from(schema.mediaAssets)
    .orderBy(schema.mediaAssets.id)
    .all()
}

describe("administrator media rows", () => {
  test("link attached media to its post and leave unattached media without a link", () => {
    const db = setup()
    seedPost(db, "published")
    db.insert(schema.mediaAssets)
      .values(
        ["attached", "loose"].map((id) => ({
          id,
          kind: "image" as const,
          provider: "images" as const,
          originalFilename: `${id}.png`,
          mimeType: "image/png",
          byteSize: 1,
        })),
      )
      .run()
    db.insert(schema.postMedia).values({ postId: "post", mediaId: "attached", ordinal: 0 }).run()

    expect(mediaHrefs(db)).toEqual([
      { id: "attached", href: "/post/post" },
      { id: "loose", href: null },
    ])
  })
})
