import type { Statement } from "./post-lifecycle-statements"

// An upload can finish only while it is pending and nobody has queued its cleanup.
const uploadable = `status = 'pending'
  and not exists (select 1 from outbox where id = 'media.cleanup:' || media_assets.id)`

/** Records the object key before the R2 write so cleanup can find a partial upload. */
export function reserveImageUploadKeyStatement(assetId: string, r2Key: string): Statement {
  return {
    sql: `update media_assets set r2_key = ? where id = ? and ${uploadable}`,
    params: [r2Key, assetId],
  }
}

type FinalizedImage = {
  assetId: string
  r2Key: string
  /** Unique per attempt. Follow-up writes run only for the attempt that finalized the asset. */
  finalizeToken: string
  mimeType: string
  byteSize: number
  width: number
  height: number
  checksum: string
  providerMetadata: Record<string, unknown>
}

type FinalizeTarget =
  | { kind: "draft-image"; postId: string; ordinal: number }
  | { kind: "edit-image" }
  | {
      kind: "avatar"
      userId: string
      image: string
      auditEventId: string
    }

/**
 * Marks a pending upload as ready and links it in one atomic batch.
 * The first statement is the status change. When it changes no rows, every
 * follow-up is skipped.
 */
export function finalizeImageUploadStatements(
  image: FinalizedImage,
  target: FinalizeTarget,
): Statement[] {
  const now = Date.now()
  const guard = `exists (select 1 from media_assets where id = ?
    and status = 'ready' and json_extract(provider_metadata, '$.finalizeToken') = ?)`
  const guardParams = [image.assetId, image.finalizeToken]
  // A draft image may join only a post that is still a draft. Publishing checks the attached media
  // once, so an upload that finishes after the post went live must not attach itself afterwards.
  const draftCondition =
    target.kind === "draft-image"
      ? "and exists (select 1 from posts where id = ? and status = 'draft' and type = 'images')"
      : ""
  const statements: Statement[] = [
    {
      sql: `update media_assets set status = 'ready', mime_type = ?, byte_size = ?, width = ?, height = ?,
          checksum = ?, provider_metadata = ?, finalized_at = ?
        where id = ? and r2_key = ? and ${uploadable} ${draftCondition}`,
      params: [
        image.mimeType,
        image.byteSize,
        image.width,
        image.height,
        image.checksum,
        JSON.stringify({ ...image.providerMetadata, finalizeToken: image.finalizeToken }),
        now,
        image.assetId,
        image.r2Key,
        ...(target.kind === "draft-image" ? [target.postId] : []),
      ],
    },
  ]

  if (target.kind === "draft-image") {
    statements.push({
      sql: `insert into post_media (post_id, media_id, ordinal)
        select ?, ?, ? where ${guard}
        on conflict do nothing`,
      params: [target.postId, image.assetId, target.ordinal, ...guardParams],
    })
  }

  if (target.kind === "avatar") {
    // Read the replaced avatar inside the batch. A value read before the batch can be stale when
    // two avatar uploads finish together, which would leave the overwritten avatar without cleanup.
    // The statement returns the queued media ID so the caller can send the job right away.
    statements.push(
      {
        sql: `insert into outbox (id, kind, payload, attempts, available_at, created_at)
          select 'media.cleanup:' || avatar_media_id, 'media.cleanup',
            json_object('type', 'media.cleanup', 'idempotencyKey', 'media.cleanup:' || avatar_media_id,
              'mediaId', avatar_media_id),
            0, ?, ?
          from profiles
          where user_id = ? and avatar_media_id is not null and avatar_media_id <> ? and ${guard}
          on conflict(id) do nothing
          returning json_extract(payload, '$.mediaId') as mediaId`,
        params: [now, now, target.userId, image.assetId, ...guardParams],
      },
      {
        sql: `update profiles set avatar_media_id = ?, updated_at = ? where user_id = ? and ${guard}`,
        params: [image.assetId, now, target.userId, ...guardParams],
      },
      {
        sql: `update user set image = ? where id = ? and ${guard}`,
        params: [target.image, target.userId, ...guardParams],
      },
      {
        sql: `insert into audit_events (id, actor_id, action, entity_type, entity_id, metadata, created_at)
        select ?, ?, 'avatar.updated', 'media', ?, '{}', ? where ${guard}`,
        params: [target.auditEventId, target.userId, image.assetId, now, ...guardParams],
      },
    )
  }

  return statements
}
