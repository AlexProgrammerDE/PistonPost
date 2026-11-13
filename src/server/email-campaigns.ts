import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, sql } from "drizzle-orm"
import { Schema, Effect } from "effect"

import * as schema from "@/db/schema"
import { productEmailBatchJob, productUpdateMessage, renderEmail } from "@/email"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import { conflictFailure, notFoundFailure } from "@/server/server-function-failure"
import { administratorServerFunctionMiddleware } from "@/server/server-function-middleware"

const campaignInput = Schema.Struct({
  subject: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(160)),
  preview: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(200)),
  heading: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
  message: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(2000)),
  actionLabel: Schema.Trim.check(Schema.isMaxLength(80)),
  actionUrl: Schema.Trim.check(Schema.isMaxLength(2048)),
}).check(
  Schema.makeFilter((value) => {
    if (Boolean(value.actionLabel) !== Boolean(value.actionUrl)) {
      return "Add both an action label and URL, or leave both empty."
    }
    if (value.actionUrl) {
      try {
        const url = new URL(value.actionUrl)
        if (url.protocol !== "https:") return "The action URL must be a valid HTTPS URL."
      } catch {
        return "The action URL must be a valid HTTPS URL."
      }
    }
    return true
  }),
)

export type EmailCampaignInput = (typeof campaignInput)["Type"]

function campaignContent(input: EmailCampaignInput, baseURL: string) {
  return productUpdateMessage({
    ...input,
    actionLabel: input.actionLabel || null,
    actionUrl: input.actionUrl || null,
    unsubscribeUrl: new URL("/settings/notifications", baseURL).toString(),
  })
}

export const getEmailCampaigns = createServerFn({ method: "GET" })
  .middleware([administratorServerFunctionMiddleware])
  .handler(({ context }) =>
    runRequestEffect(
      bindingOperation("getEmailCampaigns.operation", () =>
        context.database
          .select({
            id: schema.emailCampaigns.id,
            subject: schema.emailCampaigns.subject,
            preview: schema.emailCampaigns.preview,
            heading: schema.emailCampaigns.heading,
            message: schema.emailCampaigns.message,
            actionLabel: schema.emailCampaigns.actionLabel,
            actionUrl: schema.emailCampaigns.actionUrl,
            status: schema.emailCampaigns.status,
            createdAt: schema.emailCampaigns.createdAt,
            sentAt: schema.emailCampaigns.sentAt,
            queued: sql<number>`(select count(*) from email_campaign_deliveries where email_campaign_deliveries.campaign_id = ${schema.emailCampaigns.id})`,
            sent: sql<number>`(select count(*) from email_campaign_deliveries where email_campaign_deliveries.campaign_id = ${schema.emailCampaigns.id} and email_campaign_deliveries.status = 'sent')`,
            skipped: sql<number>`(select count(*) from email_campaign_deliveries where email_campaign_deliveries.campaign_id = ${schema.emailCampaigns.id} and email_campaign_deliveries.status = 'skipped')`,
          })
          .from(schema.emailCampaigns)
          .orderBy(desc(schema.emailCampaigns.createdAt))
          .limit(100),
      ),
    ),
  )

export const previewEmailCampaign = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(serverFunctionValidator(campaignInput))
  .handler(({ context, data }) =>
    runRequestEffect(
      bindingOperation("previewEmailCampaign.operation", () =>
        renderEmail(campaignContent(data, context.runtime.config.PUBLIC_APP_URL.toString())),
      ),
    ),
  )

export const createEmailCampaign = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(serverFunctionValidator(campaignInput))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const id = crypto.randomUUID()
        return yield* Effect.gen(function* () {
          yield* bindingOperation("createEmailCampaign.operation", () =>
            database.batch([
              database.insert(schema.emailCampaigns).values({
                id,
                createdBy: session.user.id,
                subject: data.subject,
                preview: data.preview,
                heading: data.heading,
                message: data.message,
                actionLabel: data.actionLabel || null,
                actionUrl: data.actionUrl || null,
              }),
              database.insert(schema.auditEvents).values({
                id: crypto.randomUUID(),
                actorId: session.user.id,
                action: "email-campaign.create",
                entityType: "email-campaign",
                entityId: id,
                metadata: {},
              }),
            ]),
          )
          return { id }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )

export const sendEmailCampaign = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(serverFunctionValidator(Schema.Struct({ id: Schema.String.check(Schema.isUUID()) })))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const campaign = yield* bindingOperation("sendEmailCampaign.campaign", () =>
          database
            .select({ status: schema.emailCampaigns.status })
            .from(schema.emailCampaigns)
            .where(eq(schema.emailCampaigns.id, data.id))
            .get(),
        )
        if (!campaign) return yield* notFoundFailure("The email campaign was not found.")
        if (campaign.status !== "draft") {
          return yield* conflictFailure("This campaign has already been sent.")
        }
        const job = productEmailBatchJob(data.id, null)
        return yield* Effect.gen(function* () {
          yield* bindingOperation("sendEmailCampaign.operation", () =>
            database.batch([
              database
                .update(schema.emailCampaigns)
                .set({ status: "sending", updatedAt: new Date() })
                .where(
                  and(
                    eq(schema.emailCampaigns.id, data.id),
                    eq(schema.emailCampaigns.status, "draft"),
                  ),
                ),
              database
                .insert(schema.outbox)
                .values({ id: job.idempotencyKey, kind: job.type, payload: job })
                .onConflictDoNothing(),
              database.insert(schema.auditEvents).values({
                id: crypto.randomUUID(),
                actorId: session.user.id,
                action: "email-campaign.send",
                entityType: "email-campaign",
                entityId: data.id,
                metadata: {},
              }),
            ]),
          )
          context.executionContext.waitUntil(context.env.JOBS.send(job))
          return { id: data.id }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )
