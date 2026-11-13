import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { Schema, Effect } from "effect"

import * as schema from "@/db/schema"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { TURNSTILE_ACTIONS } from "@/lib/turnstile"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import {
  conflictFailure,
  notFoundFailure,
  rateLimitedFailure,
} from "@/server/server-function-failure"
import {
  administratorServerFunctionMiddleware,
  authenticatedServerFunctionMiddleware,
} from "@/server/server-function-middleware"
import { turnstileTokenSchema, verifyRequestTurnstile } from "@/server/turnstile"

const reportReasonSchema = Schema.Literals(["spam", "harassment", "illegal", "copyright", "other"])
const reportTargetSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("post"),
    id: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
  }),
  Schema.Struct({
    type: Schema.Literal("comment"),
    id: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
  }),
  Schema.Struct({
    type: Schema.Literal("profile"),
    id: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(32)),
  }),
])

export const createContentReport = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        target: reportTargetSchema,
        reason: reportReasonSchema,
        details: Schema.Trim.check(Schema.isMaxLength(1000)).pipe(
          Schema.withDecodingDefaultType(Effect.sync(() => "" as const)),
        ),
        turnstileToken: turnstileTokenSchema,
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const limited = yield* bindingOperation("createContentReport.limited", () =>
          context.env.USER_RATE_LIMITER.limit({ key: session.user.id }),
        )
        if (!limited.success) return yield* rateLimitedFailure("The report rate limit was reached.")
        yield* verifyRequestTurnstile(context, data.turnstileToken, TURNSTILE_ACTIONS.createReport)

        const targetExists =
          data.target.type === "post"
            ? yield* bindingOperation("createContentReport.operation", () =>
                database
                  .select({ id: schema.posts.id })
                  .from(schema.posts)
                  .where(
                    and(eq(schema.posts.id, data.target.id), eq(schema.posts.status, "published")),
                  )
                  .get(),
              )
            : data.target.type === "comment"
              ? yield* bindingOperation("createContentReport.operation", () =>
                  database
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
                    .get(),
                )
              : yield* bindingOperation("createContentReport.operation", () =>
                  database
                    .select({ id: schema.profiles.normalizedUsername })
                    .from(schema.profiles)
                    .where(
                      eq(
                        schema.profiles.normalizedUsername,
                        data.target.id.toLocaleLowerCase("en-US"),
                      ),
                    )
                    .get(),
                )
        if (!targetExists) return yield* notFoundFailure("The content could not be found.")

        const targetId =
          data.target.type === "profile"
            ? data.target.id.toLocaleLowerCase("en-US")
            : data.target.id
        const existing = yield* bindingOperation("createContentReport.existing", () =>
          database
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
            .get(),
        )
        if (existing) return yield* conflictFailure("You already reported this content.")

        const id = crypto.randomUUID()
        return yield* Effect.gen(function* () {
          yield* bindingOperation("createContentReport.operation", () =>
            database.insert(schema.contentReports).values({
              id,
              reporterId: session.user.id,
              targetType: data.target.type,
              targetId,
              reason: data.reason,
              details: data.details || null,
            }),
          )
          return { id }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

export const resolveContentReport = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        id: Schema.String.check(Schema.isUUID()),
        resolution: Schema.Literals(["resolved", "dismissed"]),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const report = yield* bindingOperation("resolveContentReport.report", () =>
          database
            .select({ id: schema.contentReports.id, status: schema.contentReports.status })
            .from(schema.contentReports)
            .where(eq(schema.contentReports.id, data.id))
            .get(),
        )
        if (!report) return yield* notFoundFailure("The report was not found.")
        if (report.status !== "open") {
          return yield* conflictFailure("This report has already been reviewed.")
        }

        const now = new Date()
        return yield* Effect.gen(function* () {
          yield* bindingOperation("resolveContentReport.operation", () =>
            database.batch([
              database
                .update(schema.contentReports)
                .set({
                  status: data.resolution,
                  resolvedBy: session.user.id,
                  resolvedAt: now,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(schema.contentReports.id, data.id),
                    eq(schema.contentReports.status, "open"),
                  ),
                ),
              database.insert(schema.auditEvents).values({
                id: crypto.randomUUID(),
                actorId: session.user.id,
                action: `report.${data.resolution}`,
                entityType: "content-report",
                entityId: data.id,
                metadata: {},
              }),
            ]),
          )
          return { id: data.id, status: data.resolution }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )
