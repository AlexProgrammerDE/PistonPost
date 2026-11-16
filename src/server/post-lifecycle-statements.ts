import { mediaCleanupJob, type InternalJob } from "@/server/jobs"

export type Statement = { sql: string; params: (string | number | null)[] }

type AuditEvent = {
  id: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  metadata: Record<string, string | number | boolean | null>
}

const outboxGuard = "exists (select 1 from outbox where id = ?)"

function claimInvalidation(postCondition: string) {
  return `insert into outbox (id, kind, payload, attempts, available_at, created_at)
    select ?, ?, ?, 0, ?, ? from posts p where ${postCondition}`
}

function invalidationParams(invalidate: InternalJob, now: number) {
  return [invalidate.idempotencyKey, invalidate.type, JSON.stringify(invalidate), now, now]
}

/** Writes an audit event only when the guarded change claimed its outbox row. */
export function guardedAuditStatement(event: AuditEvent, guardId: string): Statement {
  return {
    sql: `insert into audit_events (id, actor_id, action, entity_type, entity_id, metadata, created_at)
      select ?, ?, ?, ?, ?, ?, ? where ${outboxGuard}`,
    params: [
      event.id,
      event.actorId,
      event.action,
      event.entityType,
      event.entityId,
      JSON.stringify(event.metadata),
      Date.now(),
      guardId,
    ],
  }
}

type PostPublish = { id: string; version: number; authorId: string }

/**
 * The cache invalidation claim succeeds only for the expected draft version.
 * The status change runs in the same batch and depends on that claim.
 * The last statement is the status change.
 */
export function postPublishStatements(input: PostPublish, invalidate: InternalJob): Statement[] {
  const now = Date.now()
  return [
    {
      sql: claimInvalidation(
        "p.id = ? and p.author_id = ? and p.version = ? and p.status = 'draft'",
      ),
      params: [...invalidationParams(invalidate, now), input.id, input.authorId, input.version],
    },
    {
      sql: `update posts set status = 'published', published_at = ?, updated_at = ?, version = version + 1
        where id = ? and version = ? and status = 'draft' and ${outboxGuard}`,
      params: [now, now, input.id, input.version, invalidate.idempotencyKey],
    },
  ]
}

type PostDelete = {
  id: string
  version: number
  actorId: string
  mediaIds: readonly string[]
  audit: AuditEvent | null
}

/**
 * Soft deletes a post and removes its comments, hearts, and tags in one atomic batch.
 * Every follow-up depends on the invalidation claim, which only succeeds for the
 * expected version of a post that the actor may delete. The last statement is the
 * status change.
 */
export function postDeleteStatements(input: PostDelete, invalidate: InternalJob): Statement[] {
  const now = Date.now()
  const guardId = invalidate.idempotencyKey
  return [
    {
      sql: claimInvalidation(
        `p.id = ? and p.version = ? and p.status != 'deleted'
          and (p.author_id = ? or exists (select 1 from user where id = ? and role = 'admin'))`,
      ),
      params: [
        ...invalidationParams(invalidate, now),
        input.id,
        input.version,
        input.actorId,
        input.actorId,
      ],
    },
    {
      sql: `delete from comments where post_id = ? and ${outboxGuard}`,
      params: [input.id, guardId],
    },
    {
      sql: `delete from reactions where post_id = ? and ${outboxGuard}`,
      params: [input.id, guardId],
    },
    {
      sql: `delete from post_tags where post_id = ? and ${outboxGuard}`,
      params: [input.id, guardId],
    },
    ...input.mediaIds.map((mediaId) => {
      const job = mediaCleanupJob(mediaId)
      return {
        sql: `insert into outbox (id, kind, payload, attempts, available_at, created_at)
          select ?, ?, ?, 0, ?, ? where ${outboxGuard}
          on conflict(id) do nothing`,
        params: [job.idempotencyKey, job.type, JSON.stringify(job), now, now, guardId],
      }
    }),
    ...(input.audit ? [guardedAuditStatement(input.audit, guardId)] : []),
    {
      sql: `update posts set status = 'deleted', deleted_at = ?, updated_at = ?, version = version + 1
        where id = ? and version = ? and status != 'deleted' and ${outboxGuard}`,
      params: [now, now, input.id, input.version, guardId],
    },
  ]
}
