import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { Schema, Effect } from "effect"

import type { D1DatabaseClient } from "@/db"
import { listActivePushSubscriptionIds } from "@/db/push-subscription-queries"
import * as schema from "@/db/schema"
import { serverFunctionValidator } from "@/lib/server-function-error"
import {
  hashPushEndpoint,
  pushSubscriptionInputSchema,
  type PushSubscriptionInput,
} from "@/push/subscription"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import { conflictFailure, invalidInputFailure } from "@/server/server-function-failure"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"

const maxSubscriptionsPerUser = 10

const activeSubscriptionCount = Effect.fn("activeSubscriptionCount")(function* (
  database: D1DatabaseClient,
  userId: string,
) {
  return (yield* bindingOperation("activeSubscriptionCount.operation", () =>
    listActivePushSubscriptionIds(database, userId),
  )).length
})

const saveSubscription = Effect.fn("saveSubscription")(function* (
  database: D1DatabaseClient,
  userId: string,
  sessionId: string,
  input: PushSubscriptionInput,
) {
  if (input.expirationTime !== null && input.expirationTime <= Date.now()) {
    return yield* invalidInputFailure("This push subscription has already expired.")
  }
  const endpointHash = yield* bindingOperation("saveSubscription.endpointHash", () =>
    hashPushEndpoint(input.endpoint),
  )
  const existing = yield* bindingOperation("saveSubscription.existing", () =>
    database
      .select({ id: schema.pushSubscriptions.id, userId: schema.pushSubscriptions.userId })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpointHash, endpointHash))
      .get(),
  )
  if (
    (!existing || existing.userId !== userId) &&
    (yield* activeSubscriptionCount(database, userId)) >= maxSubscriptionsPerUser
  ) {
    return yield* conflictFailure("Remove another push-enabled device before adding this one.")
  }

  const now = new Date()
  yield* bindingOperation("saveSubscription.operation", () =>
    database
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
      }),
  )
  return { enabled: true as const }
})

export const upsertPushSubscription = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(pushSubscriptionInputSchema))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        return yield* saveSubscription(database, session.user.id, session.session.id, data).pipe(
          Effect.uninterruptible,
        )
      }),
    ),
  )

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        endpoint: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(2048)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const endpointHash = yield* bindingOperation("removePushSubscription.endpointHash", () =>
          hashPushEndpoint(data.endpoint),
        )
        return yield* Effect.gen(function* () {
          yield* bindingOperation("removePushSubscription.operation", () =>
            database
              .delete(schema.pushSubscriptions)
              .where(
                and(
                  eq(schema.pushSubscriptions.userId, session.user.id),
                  eq(schema.pushSubscriptions.endpointHash, endpointHash),
                ),
              ),
          )
          return { enabled: false as const }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )
