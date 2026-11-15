import { MAX_IMAGES_PER_POST } from "@/domain"
import type { InternalJob } from "@/server/jobs"

type Statement = { sql: string; params: (string | number | null)[] }

type PostEdit = {
  id: string
  version: number
  actorId: string
  title: string
  textContent: string | null
  visibility: "public" | "unlisted"
  tags: { id: string; normalized: string; display: string; ordinal: number }[]
  images?: { id: string; altText: string }[]
}

// The outbox insert claims this edit inside the same atomic batch as all content
// changes. Its unique ID gates every write, including when a competing save wins.
export function postEditStatements(input: PostEdit, invalidate: InternalJob): Statement[] {
  const now = Date.now()
  const guard = "exists (select 1 from outbox where id = ?)"
  const images = JSON.stringify(input.images ?? [])
  const statements: Statement[] = [
    {
      sql: `insert into outbox (id, kind, payload, attempts, available_at, created_at)
      select ?, ?, ?, 0, ?, ? from posts p
      where p.id = ? and p.version = ? and p.status != 'deleted'
        and (p.author_id = ? or exists (select 1 from user where id = ? and role = 'admin'))
        ${
          input.images
            ? `and p.type = 'images' and not exists (
          select 1 from json_each(?) selected
          where not exists (
            select 1 from media_assets m where m.id = json_extract(selected.value, '$.id')
              and m.kind = 'image' and m.status = 'ready'
              and not exists (select 1 from outbox where id = 'media.cleanup:' || m.id)
              and (exists (select 1 from post_media where post_id = p.id and media_id = m.id)
                or (m.owner_id = ? and json_extract(m.provider_metadata, '$.editPostId') = p.id
                  and not exists (select 1 from post_media where media_id = m.id)))
          ))`
            : ""
        }`,
      params: [
        invalidate.idempotencyKey,
        invalidate.type,
        JSON.stringify(invalidate),
        now,
        now,
        input.id,
        input.version,
        input.actorId,
        input.actorId,
        ...(input.images ? [images, input.actorId] : []),
      ],
    },
  ]

  if (input.images) {
    statements.push(
      {
        sql: `insert into outbox (id, kind, payload, attempts, available_at, created_at)
        select 'media.cleanup:' || media_id, 'media.cleanup',
          json_object('type', 'media.cleanup', 'idempotencyKey', 'media.cleanup:' || media_id, 'mediaId', media_id),
          0, ?, ? from post_media where post_id = ? and ${guard}
          and media_id not in (select json_extract(value, '$.id') from json_each(?))
        on conflict(id) do nothing`,
        params: [now, now, input.id, invalidate.idempotencyKey, images],
      },
      {
        // Move retained rows out of the target ordinal range before upserting the new order.
        sql: `update post_media set ordinal = ordinal + (select coalesce(max(ordinal), 0) + ${MAX_IMAGES_PER_POST + 1} from post_media where post_id = ?)
        where post_id = ? and ${guard}`,
        params: [input.id, input.id, invalidate.idempotencyKey],
      },
      {
        sql: `delete from post_media where post_id = ? and ${guard}
        and media_id not in (select json_extract(value, '$.id') from json_each(?))`,
        params: [input.id, invalidate.idempotencyKey, images],
      },
      {
        sql: `insert into post_media (post_id, media_id, ordinal)
        select ?, json_extract(value, '$.id'), cast(key as integer) from json_each(?) where ${guard}
        on conflict(post_id, media_id) do update set ordinal = excluded.ordinal`,
        params: [input.id, images, invalidate.idempotencyKey],
      },
      {
        sql: `update media_assets set alt_text = (
          select nullif(json_extract(value, '$.altText'), '') from json_each(?)
          where json_extract(value, '$.id') = media_assets.id),
          owner_id = (select author_id from posts where id = ?)
        where id in (select json_extract(value, '$.id') from json_each(?)) and ${guard}`,
        params: [images, input.id, images, invalidate.idempotencyKey],
      },
    )
  }
  statements.push({
    sql: `delete from post_tags where post_id = ? and ${guard}`,
    params: [input.id, invalidate.idempotencyKey],
  })
  for (const tag of input.tags) {
    statements.push(
      {
        sql: `insert into tags (id, display_name, normalized_name, created_at)
        select ?, ?, ?, ? where ${guard}
        on conflict(normalized_name) do update set display_name = excluded.display_name`,
        params: [tag.id, tag.display, tag.normalized, now, invalidate.idempotencyKey],
      },
      {
        sql: `insert into post_tags (post_id, tag_id, ordinal)
        select ?, id, ? from tags where normalized_name = ? and ${guard}`,
        params: [input.id, tag.ordinal, tag.normalized, invalidate.idempotencyKey],
      },
    )
  }
  statements.push({
    sql: `update posts set title = ?, text_content = ?, visibility = ?, updated_at = ?, version = version + 1
      where id = ? and version = ? and ${guard}`,
    params: [
      input.title,
      input.textContent,
      input.visibility,
      now,
      input.id,
      input.version,
      invalidate.idempotencyKey,
    ],
  })
  return statements
}
