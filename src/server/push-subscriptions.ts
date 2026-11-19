import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { DateTime, Clock, Schema, Effect } from "effect"

import type { D1DatabaseClient } from "@/db/d1-database"
import { listActivePushSubscriptionIds } from "@/db/push-subscription-queries"
import * as schema from "@/db/schema"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { randomUuid } from "@/lib/server-uuid"
import {
  hashPushEndpoint,
  pushSubscriptionInputSchema,
  type PushSubscriptionInput,
} from "@/push/subscription"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import {
  conflictFailure,
  invalidInputFailure,
  rateLimitedFailure,
} from "@/server/server-function-failure"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"

const maxSubscriptionsPerUser = 10

function limitPushChanges(limiter: RateLimit, userId: string) {
  return bindingOperation("limitPushChanges.operation", () =>
    limiter.limit({ key: `push-subscription:${userId}` }),
  ).pipe(
    Effect.flatMap((limited) =>
      limited.success
        ? Effect.void
        : Effect.fail(
            rateLimitedFailure(
              "You're changing notifications too fast. Wait a minute and try again.",
            ),
          ),
    ),
  )
}

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
  if (input.expirationTime !== null && input.expirationTime <= (yield* Clock.currentTimeMillis)) {
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

  const now = yield* DateTime.nowAsDate
  const id = existing?.id ?? (yield* randomUuid)
  const expirationTime =
    input.expirationTime === null
      ? null
      : DateTime.toDateUtc(DateTime.makeUnsafe(input.expirationTime))
  yield* bindingOperation("saveSubscription.operation", () =>
    database
      .insert(schema.pushSubscriptions)
      .values({
        id,
        userId,
        sessionId,
        endpoint: input.endpoint,
        endpointHash,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        expirationTime,
      })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpointHash,
        set: {
          userId,
          sessionId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          expirationTime,
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
        yield* limitPushChanges(context.env.USER_RATE_LIMITER, session.user.id)
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
        yield* limitPushChanges(context.env.USER_RATE_LIMITER, session.user.id)
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
