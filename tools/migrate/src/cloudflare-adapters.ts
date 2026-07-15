import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { basename } from "node:path"

import { AwsClient } from "aws4fetch"
import { Upload } from "tus-js-client"

import type { ImportResult, LegacyCollection, MigrationOptions } from "./model"
import type { ImportedComment, ImportedPost, ImportedReaction, ImportedUser } from "./transform"
import type {
  MigrationDatabaseWriter,
  MigrationObjectWriter,
  MigrationVideoWriter,
  PersistedMedia,
} from "./writer"

type Parameter = string | number | null
type Query = { sql: string; params?: Parameter[] }

type CloudflareConfiguration = {
  accountId: string
  apiToken: string
  databaseId: string
  r2Bucket: string
  r2AccessKeyId: string
  r2SecretAccessKey: string
  r2SessionToken?: string
}

function requiredEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required migration environment variable ${name}.`)
  return value
}

export function cloudflareConfiguration(target: Exclude<MigrationOptions["target"], "local">) {
  const prefix = `PISTONPOST_${target.toLocaleUpperCase("en-US")}`
  return {
    accountId: requiredEnvironment("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requiredEnvironment("CLOUDFLARE_API_TOKEN"),
    databaseId: requiredEnvironment(`${prefix}_D1_DATABASE_ID`),
    r2Bucket: requiredEnvironment(`${prefix}_R2_BUCKET`),
    r2AccessKeyId: requiredEnvironment(`${prefix}_R2_ACCESS_KEY_ID`),
    r2SecretAccessKey: requiredEnvironment(`${prefix}_R2_SECRET_ACCESS_KEY`),
    r2SessionToken: process.env[`${prefix}_R2_SESSION_TOKEN`],
  } satisfies CloudflareConfiguration
}

export function cloudflareR2BaseUrl(accountId: string, bucket: string) {
  return `https://${accountId}.eu.r2.cloudflarestorage.com/${bucket}`
}

export function cloudflareR2ClientOptions(
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken?: string,
) {
  return { accessKeyId, secretAccessKey, sessionToken }
}

export function shouldUseBasicStreamUpload(size: number) {
  return size < 200_000_000
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function checkRecord(value: Readonly<Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean",
    ),
  )
}

export function cloudflareApiError(body: unknown) {
  if (!record(body) || !Array.isArray(body.errors)) return "Unknown Cloudflare API error."
  const messages = body.errors.flatMap((error) =>
    record(error) && typeof error.message === "string" ? [error.message] : [],
  )
  return messages.join("; ") || "Unknown Cloudflare API error."
}

class D1Api {
  readonly endpoint

  constructor(readonly configuration: CloudflareConfiguration) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${configuration.accountId}/d1/database/${configuration.databaseId}/query`
  }

  async execute(query: Query | Query[]) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.configuration.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(Array.isArray(query) ? { batch: query } : query),
    })
    const body: unknown = await response.json()
    if (!response.ok || !record(body) || body.success !== true || !Array.isArray(body.result)) {
      throw new Error(
        `Cloudflare D1 query failed with status ${response.status}: ${cloudflareApiError(body)}`,
      )
    }
    return body.result
  }

  async rows(query: Query) {
    const results = await this.execute(query)
    const first = results[0]
    if (!record(first) || !Array.isArray(first.results)) return []
    return first.results.filter(record)
  }
}

function mappingId(collection: string, legacyId: string) {
  return new Bun.CryptoHasher("sha256")
    .update(`${collection}:${legacyId}`)
    .digest("hex")
    .slice(0, 32)
}

function timestamp(value: Date | undefined) {
  return value?.getTime() ?? null
}

function mappingQuery(runId: string, result: ImportResult): Query {
  const state = result.state === "already-present" ? "imported" : result.state
  const now = Date.now()
  return {
    sql: `INSERT INTO migration_mappings
      (id, run_id, source_collection, legacy_id, target_table, target_id, checksum, state, reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_collection, legacy_id) DO UPDATE SET
        run_id = excluded.run_id, target_id = excluded.target_id, checksum = excluded.checksum,
        state = excluded.state, reason = excluded.reason, updated_at = excluded.updated_at`,
    params: [
      mappingId(result.collection, result.legacyId),
      runId,
      result.collection,
      result.legacyId,
      result.targetTable,
      result.targetId ?? null,
      result.checksum ?? null,
      state,
      result.reason ?? null,
      now,
      now,
    ],
  }
}

export class CloudflareMigrationDatabaseWriter implements MigrationDatabaseWriter {
  readonly api

  constructor(configuration: CloudflareConfiguration) {
    this.api = new D1Api(configuration)
  }

  async initialize() {
    const rows = await this.api.rows({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_runs'",
    })
    if (rows.length !== 1) {
      throw new Error("D1 migrations are not applied. The migration_runs table is missing.")
    }
  }

  async beginRun(fingerprint: string, requestedRunId?: string) {
    const rows = await this.api.rows({
      sql: requestedRunId
        ? "SELECT id, source_fingerprint FROM migration_runs WHERE id = ? LIMIT 1"
        : "SELECT id, source_fingerprint FROM migration_runs WHERE source_fingerprint = ? LIMIT 1",
      params: [requestedRunId ?? fingerprint],
    })
    const existing = rows[0]
    if (requestedRunId && !existing)
      throw new Error(`Migration run ${requestedRunId} does not exist.`)
    if (existing) {
      if (existing.source_fingerprint !== fingerprint || typeof existing.id !== "string") {
        throw new Error("The resume run belongs to a different source fingerprint.")
      }
      await this.api.execute({
        sql: "UPDATE migration_runs SET state = 'running', last_error = NULL, finished_at = NULL WHERE id = ?",
        params: [existing.id],
      })
      return { id: existing.id, resumed: true }
    }
    const id = crypto.randomUUID()
    await this.api.execute({
      sql: "INSERT INTO migration_runs (id, source_fingerprint, state, counters, started_at) VALUES (?, ?, 'running', '{}', ?)",
      params: [id, fingerprint, Date.now()],
    })
    return { id, resumed: false }
  }

  async imported(collection: string, legacyId: string) {
    const rows = await this.api.rows({
      sql: "SELECT id FROM migration_mappings WHERE source_collection = ? AND legacy_id = ? AND state = 'imported' LIMIT 1",
      params: [collection, legacyId],
    })
    return rows.length > 0
  }

  private async targetExists(table: "comments" | "media_assets" | "posts" | "user", id: string) {
    return (
      (await this.api.rows({ sql: `SELECT id FROM ${table} WHERE id = ? LIMIT 1`, params: [id] }))
        .length > 0
    )
  }

  private async conflict(
    runId: string,
    collection: LegacyCollection,
    legacyId: string,
    targetTable: string,
  ) {
    const result = {
      collection,
      legacyId,
      targetTable,
      state: "failed",
      reason: "Target ID belongs to a non-migration record.",
    } satisfies ImportResult
    await this.api.execute(mappingQuery(runId, result))
    return result
  }

  async writeUser(runId: string, value: ImportedUser) {
    if (await this.imported("users", value.legacyId)) {
      return {
        collection: "users",
        legacyId: value.legacyId,
        targetTable: "user",
        targetId: value.id,
        state: "already-present",
      } satisfies ImportResult
    }
    if (await this.targetExists("user", value.id)) {
      return this.conflict(runId, "users", value.legacyId, "user")
    }
    const result = {
      collection: "users",
      legacyId: value.legacyId,
      targetTable: "user",
      targetId: value.id,
      state: "imported",
    } satisfies ImportResult
    await this.api.execute([
      {
        sql: `INSERT INTO user
          (id, name, email, email_verified, image, created_at, updated_at, username, display_username, role, normalized_email)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          value.id,
          value.name,
          value.email,
          value.emailVerified ? 1 : 0,
          value.image,
          timestamp(value.createdAt),
          timestamp(value.createdAt),
          value.username,
          value.username,
          value.role,
          value.email,
        ],
      },
      {
        sql: `INSERT INTO profiles
          (user_id, username, normalized_username, bio, website, location, legacy_avatar_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          value.id,
          value.username,
          value.normalizedUsername,
          value.bio,
          value.website,
          value.location,
          value.image,
          timestamp(value.createdAt),
          timestamp(value.createdAt),
        ],
      },
      {
        sql: `INSERT INTO user_settings
          (user_id, email_notifications, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        params: [
          value.id,
          value.emailNotifications ? 1 : 0,
          value.theme,
          timestamp(value.createdAt),
          timestamp(value.createdAt),
        ],
      },
      mappingQuery(runId, result),
    ])
    return result
  }

  async writeMedia(runId: string, value: PersistedMedia) {
    const collection = (value.kind === "video" ? "videos" : "images") satisfies LegacyCollection
    if (await this.imported(collection, value.legacyId)) {
      return {
        collection,
        legacyId: value.legacyId,
        targetTable: "media_assets",
        targetId: value.id,
        checksum: value.checksum,
        state: "already-present",
      } satisfies ImportResult
    }
    if (await this.targetExists("media_assets", value.id)) {
      return this.conflict(runId, collection, value.legacyId, "media_assets")
    }
    const result = {
      collection,
      legacyId: value.legacyId,
      targetTable: "media_assets",
      targetId: value.id,
      checksum: value.checksum,
      state: "imported",
    } satisfies ImportResult
    await this.api.execute([
      {
        sql: `INSERT INTO media_assets
          (id, legacy_id, owner_id, kind, provider, status, r2_key, stream_uid, original_filename, mime_type,
           byte_size, width, height, duration_ms, checksum, alt_text, provider_metadata, created_at, finalized_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          value.id,
          value.legacyId,
          value.ownerId,
          value.kind,
          value.provider,
          value.status,
          value.kind === "image" ? value.objectKey : null,
          value.streamUid ?? null,
          value.filename,
          value.mimeType,
          value.byteSize,
          value.width,
          value.height,
          value.duration,
          value.checksum,
          value.altText,
          JSON.stringify({ legacyArchiveKey: value.objectKey }),
          timestamp(value.createdAt),
          value.status === "ready" ? Date.now() : null,
        ],
      },
      mappingQuery(runId, result),
    ])
    return result
  }

  async writePost(runId: string, value: ImportedPost) {
    if (await this.imported("posts", value.legacyId)) {
      return {
        collection: "posts",
        legacyId: value.legacyId,
        targetTable: "posts",
        targetId: value.id,
        state: "already-present",
      } satisfies ImportResult
    }
    if (await this.targetExists("posts", value.id)) {
      return this.conflict(runId, "posts", value.legacyId, "posts")
    }
    const result = {
      collection: "posts",
      legacyId: value.legacyId,
      targetTable: "posts",
      targetId: value.id,
      state: "imported",
    } satisfies ImportResult
    const queries: Query[] = [
      {
        sql: `INSERT INTO posts
          (id, legacy_id, author_id, type, status, visibility, title, text_content, created_at, updated_at, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          value.id,
          value.legacyId,
          value.authorId,
          value.type,
          value.status,
          value.visibility,
          value.title,
          value.textContent,
          timestamp(value.createdAt),
          timestamp(value.updatedAt),
          value.status === "published" ? timestamp(value.publishedAt) : null,
        ],
      },
    ]
    for (const [ordinal, tag] of value.tags.entries()) {
      queries.push(
        {
          sql: "INSERT INTO tags (id, display_name, normalized_name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(normalized_name) DO NOTHING",
          params: [tag.id, tag.name, tag.normalized, Date.now()],
        },
        {
          sql: "INSERT INTO post_tags (post_id, tag_id, ordinal) VALUES (?, ?, ?)",
          params: [value.id, tag.id, ordinal],
        },
      )
    }
    for (const [ordinal, mediaId] of value.mediaIds.entries()) {
      queries.push({
        sql: "INSERT INTO post_media (post_id, media_id, ordinal) VALUES (?, ?, ?)",
        params: [value.id, mediaId, ordinal],
      })
    }
    queries.push(mappingQuery(runId, result))
    await this.api.execute(queries)
    return result
  }

  async writeComment(runId: string, value: ImportedComment) {
    if (await this.imported("comments", value.legacyId)) {
      return {
        collection: "comments",
        legacyId: value.legacyId,
        targetTable: "comments",
        targetId: value.id,
        state: "already-present",
      } satisfies ImportResult
    }
    if (await this.targetExists("comments", value.id)) {
      return this.conflict(runId, "comments", value.legacyId, "comments")
    }
    const result = {
      collection: "comments",
      legacyId: value.legacyId,
      targetTable: "comments",
      targetId: value.id,
      state: "imported",
    } satisfies ImportResult
    await this.api.execute([
      {
        sql: "INSERT INTO comments (id, legacy_id, post_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params: [
          value.id,
          value.legacyId,
          value.postId,
          value.authorId,
          value.content,
          timestamp(value.createdAt),
          timestamp(value.updatedAt),
        ],
      },
      mappingQuery(runId, result),
    ])
    return result
  }

  async writeReaction(runId: string, value: ImportedReaction) {
    const legacyId = `${value.postId}:${value.userId}:${value.type}`
    if (await this.imported("reactions", legacyId)) {
      return {
        collection: "reactions",
        legacyId,
        targetTable: "reactions",
        state: "already-present",
      } satisfies ImportResult
    }
    const result = {
      collection: "reactions",
      legacyId,
      targetTable: "reactions",
      targetId: legacyId,
      state: "imported",
    } satisfies ImportResult
    await this.api.execute([
      {
        sql: "INSERT INTO reactions (post_id, user_id, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
        params: [
          value.postId,
          value.userId,
          value.type,
          timestamp(value.createdAt),
          timestamp(value.createdAt),
        ],
      },
      mappingQuery(runId, result),
    ])
    return result
  }

  async finishRun(runId: string, counters: Record<string, number>, verdict: "go" | "no-go") {
    await this.api.execute({
      sql: "UPDATE migration_runs SET state = ?, counters = ?, finished_at = ?, last_error = ? WHERE id = ?",
      params: [
        verdict === "go" ? "complete" : "failed",
        JSON.stringify(counters),
        Date.now(),
        verdict === "go" ? null : "Verification reported unresolved errors.",
        runId,
      ],
    })
  }

  async verify(runId: string) {
    const [rows, foreignKeyRows] = await Promise.all([
      this.api.rows({
        sql: `SELECT
          EXISTS(SELECT 1 FROM migration_runs WHERE id = ?) AS runExists,
          (SELECT COUNT(*) FROM user) AS users,
          (SELECT COUNT(*) FROM posts) AS posts,
          (SELECT COUNT(*) FROM comments) AS comments,
          (SELECT COUNT(*) FROM reactions) AS reactions,
          (SELECT COUNT(*) FROM media_assets) AS media,
          (SELECT COUNT(*) FROM posts WHERE status = 'published' AND visibility = 'public') AS publicPosts,
          (SELECT COUNT(*) FROM posts WHERE status = 'published' AND visibility = 'unlisted') AS unlistedPosts,
          (SELECT COUNT(*) FROM posts WHERE status = 'failed') AS failedPosts`,
        params: [runId],
      }),
      this.api.rows({ sql: "PRAGMA foreign_key_check" }),
    ])
    return {
      ...checkRecord(rows[0] ?? {}),
      foreignKeyViolations: foreignKeyRows.length,
    }
  }

  close() {}
}

export class CloudflareR2Writer implements MigrationObjectWriter {
  readonly client
  readonly baseUrl

  constructor(readonly configuration: CloudflareConfiguration) {
    this.client = new AwsClient({
      ...cloudflareR2ClientOptions(
        configuration.r2AccessKeyId,
        configuration.r2SecretAccessKey,
        configuration.r2SessionToken,
      ),
      service: "s3",
      region: "auto",
    })
    this.baseUrl = cloudflareR2BaseUrl(configuration.accountId, configuration.r2Bucket)
  }

  private url(key: string) {
    return `${this.baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`
  }

  async put(key: string, sourcePath: string, checksum: string, contentType: string) {
    const url = this.url(key)
    const existing = await this.client.fetch(url, { method: "HEAD" })
    if (existing.ok) {
      if (existing.headers.get("x-amz-meta-sha256") !== checksum) {
        throw new Error(`R2 object checksum conflict at ${key}.`)
      }
      return
    }
    if (existing.status !== 404) throw new Error(`R2 HEAD failed with status ${existing.status}.`)
    const response = await this.client.fetch(url, {
      method: "PUT",
      headers: { "content-type": contentType, "x-amz-meta-sha256": checksum },
      body: Bun.file(sourcePath),
    })
    if (!response.ok) throw new Error(`R2 upload failed with status ${response.status}.`)
  }
}

export class CloudflareStreamWriter implements MigrationVideoWriter {
  readonly endpoint

  constructor(readonly configuration: CloudflareConfiguration) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${configuration.accountId}/stream`
  }

  async upload(sourcePath: string, checksum: string, creator: string) {
    const details = await stat(sourcePath)
    if (shouldUseBasicStreamUpload(details.size)) {
      const form = new FormData()
      form.append("file", Bun.file(sourcePath), basename(sourcePath))
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.configuration.apiToken}`,
          "Upload-Creator": creator,
        },
        body: form,
      })
      const body: unknown = await response.json()
      if (
        !response.ok ||
        !record(body) ||
        body.success !== true ||
        !record(body.result) ||
        typeof body.result.uid !== "string"
      ) {
        throw new Error(
          `Stream upload failed with status ${response.status}: ${cloudflareApiError(body)}`,
        )
      }
      const videoStatus = await this.status(body.result.uid)
      return { uid: body.result.uid, ready: videoStatus.ready }
    }
    let uid: string | undefined
    await new Promise<void>((resolveUpload, reject) => {
      const upload = new Upload(createReadStream(sourcePath), {
        endpoint: this.endpoint,
        uploadSize: details.size,
        chunkSize: 52_428_800,
        retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
        removeFingerprintOnSuccess: true,
        headers: {
          authorization: `Bearer ${this.configuration.apiToken}`,
          "Upload-Creator": creator,
        },
        metadata: { name: basename(sourcePath), checksum },
        onAfterResponse: (_request, response) => {
          uid ??= response.getHeader("stream-media-id")
        },
        onError: reject,
        onSuccess: () => resolveUpload(),
      })
      upload.start()
    })
    if (!uid) throw new Error("Stream upload completed without a media ID.")
    const videoStatus = await this.status(uid)
    return { uid, ready: videoStatus.ready }
  }

  async status(uid: string) {
    const response = await fetch(`${this.endpoint}/${encodeURIComponent(uid)}`, {
      headers: { authorization: `Bearer ${this.configuration.apiToken}` },
    })
    const body: unknown = await response.json()
    if (!response.ok || !record(body) || !record(body.result)) {
      throw new Error(`Stream status failed with status ${response.status}.`)
    }
    const state = record(body.result.status) ? body.result.status.state : undefined
    return { ready: body.result.readyToStream === true, failed: state === "error" }
  }
}

export function createCloudflareAdapters(target: Exclude<MigrationOptions["target"], "local">) {
  const configuration = cloudflareConfiguration(target)
  const objectWriter = new CloudflareR2Writer(configuration)
  return {
    database: new CloudflareMigrationDatabaseWriter(configuration),
    objectWriter,
    videoWriter: new CloudflareStreamWriter(configuration),
  }
}
