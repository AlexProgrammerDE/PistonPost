import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import * as schema from "@/db/schema"
import { productEmailBatchJob, productUpdateMessage, renderEmail } from "@/email"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { conflictFailure, notFoundFailure } from "@/server/server-function-failure"
import { administratorServerFunctionMiddleware } from "@/server/server-function-middleware"

const campaignInput = z
  .object({
    subject: z.string().trim().min(1).max(160),
    preview: z.string().trim().min(1).max(200),
    heading: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(2000),
    actionLabel: z.string().trim().max(80),
    actionUrl: z.string().trim().max(2048),
  })
  .superRefine((value, context) => {
    if (Boolean(value.actionLabel) !== Boolean(value.actionUrl)) {
      context.addIssue({
        code: "custom",
        message: "Add both an action label and URL, or leave both empty.",
      })
      return
    }
    if (value.actionUrl) {
      try {
        const url = new URL(value.actionUrl)
        if (url.protocol !== "https:") throw new Error("The URL must use HTTPS.")
      } catch {
        context.addIssue({ code: "custom", message: "The action URL must be a valid HTTPS URL." })
      }
    }
  })

export type EmailCampaignInput = z.infer<typeof campaignInput>

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
  .handler(async ({ context }) =>
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
  )

export const previewEmailCampaign = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(serverFunctionValidator(campaignInput))
  .handler(({ context, data }) =>
    renderEmail(campaignContent(data, context.runtime.config.PUBLIC_APP_URL.toString())),
  )

export const createEmailCampaign = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(serverFunctionValidator(campaignInput))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const id = crypto.randomUUID()
    await database.batch([
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
    ])
    return { id }
  })

export const sendEmailCampaign = createServerFn({ method: "POST" })
  .middleware([administratorServerFunctionMiddleware])
  .validator(serverFunctionValidator(z.object({ id: z.string().uuid() })))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const campaign = await database
      .select({ status: schema.emailCampaigns.status })
      .from(schema.emailCampaigns)
      .where(eq(schema.emailCampaigns.id, data.id))
      .get()
    if (!campaign) throw notFoundFailure("The email campaign was not found.")
    if (campaign.status !== "draft") {
      throw conflictFailure("This campaign has already been sent.")
    }
    const job = productEmailBatchJob(data.id, null)
    await database.batch([
      database
        .update(schema.emailCampaigns)
        .set({ status: "sending", updatedAt: new Date() })
        .where(
          and(eq(schema.emailCampaigns.id, data.id), eq(schema.emailCampaigns.status, "draft")),
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
    ])
    context.executionContext.waitUntil(context.env.JOBS.send(job))
    return { id: data.id }
  })
