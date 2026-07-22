import { createServerFn } from "@tanstack/react-start"
import { and, eq, gt, isNull, or } from "drizzle-orm"
import { z } from "zod"

import type { D1DatabaseClient } from "@/db"
import * as schema from "@/db/schema"
import { serverFunctionValidator } from "@/lib/server-function-error"
import {
  hashPushEndpoint,
  pushSubscriptionInputSchema,
  type PushSubscriptionInput,
} from "@/push/subscription"
import { conflictFailure, invalidInputFailure } from "@/server/server-function-failure"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"

const maxSubscriptionsPerUser = 10

export async function listActivePushSubscriptionIds(
  database: D1DatabaseClient,
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

async function activeSubscriptionCount(database: D1DatabaseClient, userId: string) {
  return (await listActivePushSubscriptionIds(database, userId)).length
}

async function saveSubscription(
  database: D1DatabaseClient,
  userId: string,
  sessionId: string,
  input: PushSubscriptionInput,
) {
  if (input.expirationTime !== null && input.expirationTime <= Date.now()) {
    throw invalidInputFailure("This push subscription has already expired.")
  }
  const endpointHash = await hashPushEndpoint(input.endpoint)
  const existing = await database
    .select({ id: schema.pushSubscriptions.id, userId: schema.pushSubscriptions.userId })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpointHash, endpointHash))
    .get()
  if (
    (!existing || existing.userId !== userId) &&
    (await activeSubscriptionCount(database, userId)) >= maxSubscriptionsPerUser
  ) {
    throw conflictFailure("Remove another push-enabled device before adding this one.")
  }

  const now = new Date()
  await database
    .insert(schema.pushSubscriptions)
    .values({
      id: existing?.id ?? crypto.randomUUID(),
      userId,
      sessionId,
      endpoint: input.endpoint,
      endpointHash,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      expirationTime: input.expirationTime === null ? null : new Date(input.expirationTime),
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpointHash,
      set: {
        userId,
        sessionId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        expirationTime: input.expirationTime === null ? null : new Date(input.expirationTime),
        lastSuccessAt: null,
        disabledAt: null,
        createdAt: now,
        updatedAt: now,
      },
    })
  return { enabled: true as const }
}

export const upsertPushSubscription = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(pushSubscriptionInputSchema))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    return saveSubscription(database, session.user.id, session.session.id, data)
  })

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(z.object({ endpoint: z.string().trim().min(1).max(2048) })))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const endpointHash = await hashPushEndpoint(data.endpoint)
    await database
      .delete(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.userId, session.user.id),
          eq(schema.pushSubscriptions.endpointHash, endpointHash),
        ),
      )
    return { enabled: false as const }
  })
