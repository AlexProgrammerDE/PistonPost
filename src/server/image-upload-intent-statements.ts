import type { Statement } from "./post-lifecycle-statements"

/**
 * Counts the uploads that still use the post's image quota and finds the next free ordinal.
 * Failed and removed uploads free their quota but keep their ordinal. A new draft image that
 * reused one could collide with an attached image and be dropped when it finishes uploading.
 */
export function imageUploadIntentSlotsStatement(postId: string, ownerId: string): Statement {
  return {
    sql: `select
        count(*) filter (where owner_id = ? and status not in ('failed', 'deleted')) as count,
        max(
          coalesce(max(json_extract(provider_metadata, '$.ordinal')) + 1, 0),
          coalesce((select max(ordinal) + 1 from post_media where post_id = ?), 0)
        ) as nextOrdinal
      from media_assets
      where json_extract(provider_metadata, '$.postId') = ?
        or json_extract(provider_metadata, '$.editPostId') = ?`,
    params: [ownerId, postId, postId, postId],
  }
}
