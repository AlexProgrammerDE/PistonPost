import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"

import { assertMutationOrigin, requireAdministrator, requireRequestSession } from "./session"

const reportReasonSchema = z.enum(["spam", "harassment", "illegal", "copyright", "other"])
const reportTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("post"), id: z.string().trim().min(1).max(64) }),
  z.object({ type: z.literal("comment"), id: z.string().trim().min(1).max(64) }),
  z.object({ type: z.literal("profile"), id: z.string().trim().min(1).max(32) }),
])

export const createContentReport = createServerFn({ method: "POST" })
  .validator(
    z.object({
      target: reportTargetSchema,
      reason: reportReasonSchema,
      details: z.string().trim().max(1000).default(""),
    }),
  )
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const limited = await context.env.USER_RATE_LIMITER.limit({ key: session.user.id })
    if (!limited.success) throw new Error("The report rate limit was reached.")
    const database = createD1Database(context.env.DB)

    const targetExists =
      data.target.type === "post"
        ? await database
            .select({ id: schema.posts.id })
            .from(schema.posts)
            .where(and(eq(schema.posts.id, data.target.id), eq(schema.posts.status, "published")))
            .get()
        : data.target.type === "comment"
          ? await database
              .select({ id: schema.comments.id })
              .from(schema.comments)
              .innerJoin(schema.posts, eq(schema.posts.id, schema.comments.postId))
              .where(
                and(
                  eq(schema.comments.id, data.target.id),
                  eq(schema.comments.status, "published"),
                  eq(schema.posts.status, "published"),
                ),
              )
              .get()
          : await database
              .select({ id: schema.profiles.normalizedUsername })
              .from(schema.profiles)
              .where(
                eq(schema.profiles.normalizedUsername, data.target.id.toLocaleLowerCase("en-US")),
              )
              .get()
    if (!targetExists) throw new Error("The content could not be found.")

    const targetId =
      data.target.type === "profile" ? data.target.id.toLocaleLowerCase("en-US") : data.target.id
    const existing = await database
      .select({ id: schema.contentReports.id })
      .from(schema.contentReports)
      .where(
        and(
          eq(schema.contentReports.reporterId, session.user.id),
          eq(schema.contentReports.targetType, data.target.type),
          eq(schema.contentReports.targetId, targetId),
          eq(schema.contentReports.status, "open"),
        ),
      )
      .get()
    if (existing) throw new Error("You already reported this content.")

    const id = crypto.randomUUID()
    await database.insert(schema.contentReports).values({
      id,
      reporterId: session.user.id,
      targetType: data.target.type,
      targetId,
      reason: data.reason,
      details: data.details || null,
    })
    return { id }
  })

export const resolveContentReport = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      resolution: z.enum(["resolved", "dismissed"]),
    }),
  )
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireAdministrator(context)
    const database = createD1Database(context.env.DB)
    const report = await database
      .select({ id: schema.contentReports.id, status: schema.contentReports.status })
      .from(schema.contentReports)
      .where(eq(schema.contentReports.id, data.id))
      .get()
    if (!report) throw new Error("The report was not found.")
    if (report.status !== "open") throw new Error("This report has already been reviewed.")

    const now = new Date()
    await database.batch([
      database
        .update(schema.contentReports)
        .set({
          status: data.resolution,
          resolvedBy: session.user.id,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(schema.contentReports.id, data.id), eq(schema.contentReports.status, "open")),
        ),
      database.insert(schema.auditEvents).values({
        id: crypto.randomUUID(),
        actorId: session.user.id,
        action: `report.${data.resolution}`,
        entityType: "content-report",
        entityId: data.id,
        metadata: {},
      }),
    ])
    return { id: data.id, status: data.resolution }
  })
