import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { Effect } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { randomUuid } from "@/lib/server-uuid"
import type { AppRequestContext } from "@/server"
import {
  createRequestAuth,
  enqueueSecurityNotification,
  privateAuthResponse,
  recordAuthAudit,
} from "@/server/auth"
import { FEED_CACHE_TAG, ownerCacheTag, SITEMAP_CACHE_TAG } from "@/server/cache-tags"
import { cacheInvalidationTagsJob, videoAccessJob } from "@/server/jobs"
import { authorVideoPostIds } from "@/server/media-jobs"
import { bindingOperation } from "@/server/operation"

const auditedMutations = new Map([
  ["/delete-user", "auth.deletion-requested"],
  ["/passkey/add-passkey", "auth.passkey-added"],
  ["/passkey/delete-passkey", "auth.passkey-deleted"],
  ["/passkey/update-passkey", "auth.passkey-updated"],
  ["/two-factor/enable", "auth.two-factor-enabled"],
  ["/two-factor/disable", "auth.two-factor-disabled"],
])

const EMAIL_CHANGE_COMPLETE_PATH = "/email-otp/change-email"

// Better Auth admin plugin endpoints. The admin is the actor and the managed user is the entity.
const auditedAdminActions = new Map([
  ["/admin/ban-user", "admin.user-banned"],
  ["/admin/unban-user", "admin.user-unbanned"],
  ["/admin/set-role", "admin.user-role-set"],
  ["/admin/impersonate-user", "admin.impersonation-started"],
  ["/admin/stop-impersonating", "admin.impersonation-stopped"],
  ["/admin/remove-user", "admin.user-removed"],
  ["/admin/set-user-password", "admin.user-password-set"],
  ["/admin/revoke-user-session", "admin.user-session-revoked"],
  ["/admin/revoke-user-sessions", "admin.user-sessions-revoked"],
  ["/admin/update-user", "admin.user-updated"],
])

// A ban hides the user's public content and an unban shows it again, so both purge cached pages.
const contentVisibilityActions = new Set(["admin.user-banned", "admin.user-unbanned"])

type AdminAudit = {
  readonly action: string
  readonly actorId: string
  readonly targetUserId: string
  readonly metadata: Readonly<Record<string, string>>
}

function stringField(value: unknown, field: string) {
  if (typeof value !== "object" || value === null) return undefined
  const result: unknown = Reflect.get(value, field)
  return typeof result === "string" && result ? result : undefined
}

function roleMetadata(body: unknown): Readonly<Record<string, string>> {
  if (typeof body !== "object" || body === null) return {}
  const role: unknown = Reflect.get(body, "role")
  if (typeof role === "string") return { role }
  if (Array.isArray(role) && role.every((item) => typeof item === "string")) {
    return { role: role.join(",") }
  }
  return {}
}

function readJsonBody(request: Request): Promise<unknown> {
  return request
    .clone()
    .json()
    .then(
      (body: unknown) => body,
      () => undefined,
    )
}

const findSessionOwner = Effect.fn("Auth.findSessionOwner")(function* (
  context: AppRequestContext,
  sessionToken: string,
) {
  const rows = yield* bindingOperation("auth.admin-session-owner", () =>
    createD1Database(context.env.DB)
      .select({ userId: schema.session.userId })
      .from(schema.session)
      .where(eq(schema.session.token, sessionToken))
      .limit(1),
  )
  return rows[0]?.userId
})

/** Resolves the admin audit before the handler runs, because revocation deletes the session row. */
async function resolveAdminAudit(
  context: AppRequestContext,
  request: Request,
  path: string,
  action: string,
  session: {
    readonly user: { readonly id: string }
    readonly session: { readonly impersonatedBy?: string | null }
  } | null,
): Promise<AdminAudit | undefined> {
  if (!session) return undefined
  if (path === "/admin/stop-impersonating") {
    const adminId = session.session.impersonatedBy
    if (!adminId) return undefined
    return { action, actorId: adminId, targetUserId: session.user.id, metadata: {} }
  }
  const body = await readJsonBody(request)
  const sessionToken =
    path === "/admin/revoke-user-session" ? stringField(body, "sessionToken") : undefined
  const targetUserId = sessionToken
    ? await Effect.runPromise(findSessionOwner(context, sessionToken))
    : stringField(body, "userId")
  if (!targetUserId) return undefined
  return {
    action,
    actorId: session.user.id,
    targetUserId,
    metadata: path === "/admin/set-role" ? roleMetadata(body) : {},
  }
}

const recordAdminAuditEffect = Effect.fn("Auth.recordAdminAudit")(function* (
  context: AppRequestContext,
  audit: AdminAudit,
) {
  const database = createD1Database(context.env.DB)
  const auditEventId = yield* randomUuid
  const changesVisibility = contentVisibilityActions.has(audit.action)
  // Stream videos are reachable by their public UID, so a ban must also switch them to signed
  // URLs. Each job re-reads the ban state when it runs, so ban and unban jobs converge.
  const videoPostIds = changesVisibility
    ? yield* authorVideoPostIds(database, audit.targetUserId)
    : []
  const jobs = changesVisibility
    ? [
        cacheInvalidationTagsJob(
          `account-ban:${audit.targetUserId}`,
          [ownerCacheTag(audit.targetUserId), FEED_CACHE_TAG, SITEMAP_CACHE_TAG],
          `cache.invalidate:account-ban:${audit.targetUserId}:${auditEventId}`,
        ),
        ...videoPostIds.map((postId) => videoAccessJob(postId, auditEventId)),
      ]
    : []
  yield* Effect.gen(function* () {
    yield* bindingOperation("auth.admin-audit", () =>
      database.batch([
        database.insert(schema.auditEvents).values({
          id: auditEventId,
          actorId: audit.actorId,
          action: audit.action,
          entityType: "user",
          entityId: audit.targetUserId,
          metadata: audit.metadata,
        }),
        ...jobs.map((job) =>
          database
            .insert(schema.outbox)
            .values({ id: job.idempotencyKey, kind: job.type, payload: job })
            .onConflictDoNothing(),
        ),
      ]),
    )
    // Queues accept at most 100 messages per sendBatch call.
    for (let start = 0; start < jobs.length; start += 100) {
      const chunk = jobs.slice(start, start + 100)
      yield* bindingOperation("auth.admin-visibility-jobs", () =>
        context.env.JOBS.sendBatch(chunk.map((job) => ({ body: job }))),
      )
    }
  }).pipe(Effect.uninterruptible)
})

async function handleAuth({ request, context }: { request: Request; context: AppRequestContext }) {
  const auth = await createRequestAuth(context)
  const path = new URL(request.url).pathname.replace("/api/auth", "")
  const isPost = request.method === "POST"
  const action = isPost ? auditedMutations.get(path) : undefined
  const adminAction = isPost ? auditedAdminActions.get(path) : undefined
  // The code-based email change completes at /email-otp/change-email.
  const sendsSecurityNotification =
    path === "/change-password" || path === EMAIL_CHANGE_COMPLETE_PATH
  const session =
    action || adminAction || sendsSecurityNotification
      ? await auth.api.getSession({ headers: request.headers })
      : null
  const adminAudit = adminAction
    ? await resolveAdminAudit(context, request, path, adminAction, session)
    : undefined
  const response = await auth.handler(request)

  if (action && session?.user.id && response.ok) {
    context.executionContext.waitUntil(recordAuthAudit(context, action, session.user.id))
  }

  if (adminAudit && response.ok) {
    context.executionContext.waitUntil(
      Effect.runPromise(recordAdminAuditEffect(context, adminAudit)),
    )
  }

  const notificationAction =
    path === "/change-password"
      ? "auth.password-changed"
      : path === EMAIL_CHANGE_COMPLETE_PATH
        ? "auth.email-change-requested"
        : undefined
  if (notificationAction && session?.user.id && response.ok) {
    context.executionContext.waitUntil(
      enqueueSecurityNotification(context, session.user.id, notificationAction, session.user.id),
    )
  }

  return privateAuthResponse(response)
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handleAuth,
      POST: handleAuth,
    },
  },
})
