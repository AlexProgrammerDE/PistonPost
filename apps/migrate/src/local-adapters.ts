import { createHash } from "node:crypto"
import { createReadStream, mkdirSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"

import { createSqliteDatabase } from "@pistonpost/db/database"
import * as schema from "@pistonpost/db/schema"
import { and, eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"

import type { ImportResult, LegacyCollection } from "./model"
import type { ImportedComment, ImportedPost, ImportedReaction, ImportedUser } from "./transform"
import type {
  MigrationDatabaseWriter,
  MigrationObjectWriter,
  MigrationVideoWriter,
  PersistedMedia,
} from "./writer"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname

async function fileChecksum(path: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

function scalarCount(value: unknown) {
  if (
    value !== null &&
    typeof value === "object" &&
    "count" in value &&
    typeof value.count === "number"
  ) {
    return value.count
  }
  throw new Error("Count query did not return a numeric count.")
}

function mappingId(collection: string, legacyId: string) {
  return new Bun.CryptoHasher("sha256")
    .update(`${collection}:${legacyId}`)
    .digest("hex")
    .slice(0, 32)
}

export class LocalMigrationDatabaseWriter implements MigrationDatabaseWriter {
  readonly database

  constructor(readonly path: string) {
    mkdirSync(dirname(resolve(path)), { recursive: true })
    this.database = createSqliteDatabase(path)
  }

  async initialize() {
    await mkdir(dirname(resolve(this.path)), { recursive: true })
    migrate(this.database, { migrationsFolder })
  }

  async beginRun(fingerprint: string, requestedRunId?: string) {
    const existing = requestedRunId
      ? this.database
          .select({
            id: schema.migrationRuns.id,
            fingerprint: schema.migrationRuns.sourceFingerprint,
          })
          .from(schema.migrationRuns)
          .where(eq(schema.migrationRuns.id, requestedRunId))
          .get()
      : this.database
          .select({
            id: schema.migrationRuns.id,
            fingerprint: schema.migrationRuns.sourceFingerprint,
          })
          .from(schema.migrationRuns)
          .where(eq(schema.migrationRuns.sourceFingerprint, fingerprint))
          .get()
    if (requestedRunId && !existing)
      throw new Error(`Migration run ${requestedRunId} does not exist.`)
    if (existing && existing.fingerprint !== fingerprint) {
      throw new Error("The resume run belongs to a different source fingerprint.")
    }
    if (existing) {
      this.database
        .update(schema.migrationRuns)
        .set({ state: "running", lastError: null, finishedAt: null })
        .where(eq(schema.migrationRuns.id, existing.id))
        .run()
      return { id: existing.id, resumed: true }
    }
    const id = crypto.randomUUID()
    this.database
      .insert(schema.migrationRuns)
      .values({ id, sourceFingerprint: fingerprint, state: "running" })
      .run()
    return { id, resumed: false }
  }

  async imported(collection: string, legacyId: string) {
    return Boolean(
      this.database
        .select({ id: schema.migrationMappings.id })
        .from(schema.migrationMappings)
        .where(
          and(
            eq(schema.migrationMappings.sourceCollection, collection),
            eq(schema.migrationMappings.legacyId, legacyId),
            eq(schema.migrationMappings.state, "imported"),
          ),
        )
        .get(),
    )
  }

  private mapping(runId: string, result: ImportResult) {
    const state = result.state === "already-present" ? "imported" : result.state
    this.database
      .insert(schema.migrationMappings)
      .values({
        id: mappingId(result.collection, result.legacyId),
        runId,
        sourceCollection: result.collection,
        legacyId: result.legacyId,
        targetTable: result.targetTable,
        targetId: result.targetId,
        checksum: result.checksum,
        state,
        reason: result.reason,
      })
      .onConflictDoUpdate({
        target: [schema.migrationMappings.sourceCollection, schema.migrationMappings.legacyId],
        set: {
          runId,
          targetId: result.targetId,
          checksum: result.checksum,
          state,
          reason: result.reason,
          updatedAt: new Date(),
        },
      })
      .run()
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
    const existing = this.database
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, value.id))
      .get()
    if (existing) {
      return this.mapping(runId, {
        collection: "users",
        legacyId: value.legacyId,
        targetTable: "user",
        state: "failed",
        reason: "Target ID belongs to a non-migration record.",
      })
    }
    this.database.transaction((transaction) => {
      transaction
        .insert(schema.user)
        .values({
          id: value.id,
          name: value.name,
          email: value.email,
          normalizedEmail: value.email,
          emailVerified: value.emailVerified,
          image: value.image,
          username: value.username,
          displayUsername: value.username,
          role: value.role,
          createdAt: value.createdAt,
          updatedAt: value.createdAt,
        })
        .run()
      transaction
        .insert(schema.profiles)
        .values({
          userId: value.id,
          username: value.username,
          normalizedUsername: value.normalizedUsername,
          bio: value.bio,
          website: value.website,
          location: value.location,
          legacyAvatarUrl: value.image,
          createdAt: value.createdAt,
          updatedAt: value.createdAt,
        })
        .run()
      transaction
        .insert(schema.userSettings)
        .values({
          userId: value.id,
          emailNotifications: value.emailNotifications,
          theme: value.theme,
          createdAt: value.createdAt,
          updatedAt: value.createdAt,
        })
        .run()
    })
    return this.mapping(runId, {
      collection: "users",
      legacyId: value.legacyId,
      targetTable: "user",
      targetId: value.id,
      state: "imported",
    })
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
    const existing = this.database
      .select({ id: schema.mediaAssets.id })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, value.id))
      .get()
    if (existing) {
      return this.mapping(runId, {
        collection,
        legacyId: value.legacyId,
        targetTable: "media_assets",
        state: "failed",
        reason: "Target ID belongs to a non-migration record.",
      })
    }
    this.database
      .insert(schema.mediaAssets)
      .values({
        id: value.id,
        legacyId: value.legacyId,
        ownerId: value.ownerId,
        kind: value.kind,
        provider: value.provider,
        status: value.status,
        r2Key: value.kind === "image" ? value.objectKey : null,
        streamUid: value.streamUid,
        originalFilename: value.filename,
        mimeType: value.mimeType,
        byteSize: value.byteSize,
        width: value.width,
        height: value.height,
        duration: value.duration,
        checksum: value.checksum,
        altText: value.altText,
        providerMetadata: { legacyArchiveKey: value.objectKey },
        createdAt: value.createdAt,
        finalizedAt: value.status === "ready" ? new Date() : null,
      })
      .run()
    return this.mapping(runId, {
      collection,
      legacyId: value.legacyId,
      targetTable: "media_assets",
      targetId: value.id,
      checksum: value.checksum,
      state: "imported",
    })
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
    const existing = this.database
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(eq(schema.posts.id, value.id))
      .get()
    if (existing)
      return this.mapping(runId, {
        collection: "posts",
        legacyId: value.legacyId,
        targetTable: "posts",
        state: "failed",
        reason: "Target ID belongs to a non-migration record.",
      })
    this.database
      .insert(schema.posts)
      .values({
        id: value.id,
        legacyId: value.legacyId,
        authorId: value.authorId,
        type: value.type,
        status: value.status,
        visibility: value.visibility,
        title: value.title,
        textContent: value.textContent,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        publishedAt: value.status === "published" ? value.publishedAt : null,
      })
      .run()
    for (const [ordinal, tag] of value.tags.entries()) {
      this.database
        .insert(schema.tags)
        .values({ id: tag.id, displayName: tag.name, normalizedName: tag.normalized })
        .onConflictDoNothing()
        .run()
      this.database
        .insert(schema.postTags)
        .values({ postId: value.id, tagId: tag.id, ordinal })
        .run()
    }
    for (const [ordinal, mediaId] of value.mediaIds.entries()) {
      this.database.insert(schema.postMedia).values({ postId: value.id, mediaId, ordinal }).run()
    }
    return this.mapping(runId, {
      collection: "posts",
      legacyId: value.legacyId,
      targetTable: "posts",
      targetId: value.id,
      state: "imported",
    })
  }

  async writeComment(runId: string, value: ImportedComment) {
    if (await this.imported("comments", value.legacyId))
      return {
        collection: "comments",
        legacyId: value.legacyId,
        targetTable: "comments",
        targetId: value.id,
        state: "already-present",
      } satisfies ImportResult
    const existing = this.database
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(eq(schema.comments.id, value.id))
      .get()
    if (existing)
      return this.mapping(runId, {
        collection: "comments",
        legacyId: value.legacyId,
        targetTable: "comments",
        state: "failed",
        reason: "Target ID belongs to a non-migration record.",
      })
    this.database
      .insert(schema.comments)
      .values({ ...value, content: value.content })
      .run()
    return this.mapping(runId, {
      collection: "comments",
      legacyId: value.legacyId,
      targetTable: "comments",
      targetId: value.id,
      state: "imported",
    })
  }

  async writeReaction(runId: string, value: ImportedReaction) {
    const legacyId = `${value.postId}:${value.userId}:${value.type}`
    if (await this.imported("reactions", legacyId))
      return {
        collection: "reactions",
        legacyId,
        targetTable: "reactions",
        state: "already-present",
      } satisfies ImportResult
    this.database
      .insert(schema.reactions)
      .values({ ...value, updatedAt: value.createdAt })
      .onConflictDoNothing()
      .run()
    return this.mapping(runId, {
      collection: "reactions",
      legacyId,
      targetTable: "reactions",
      targetId: legacyId,
      state: "imported",
    })
  }

  async finishRun(runId: string, counters: Record<string, number>, verdict: "go" | "no-go") {
    this.database
      .update(schema.migrationRuns)
      .set({
        state: verdict === "go" ? "complete" : "failed",
        counters,
        finishedAt: new Date(),
        lastError: verdict === "go" ? null : "Verification reported unresolved errors.",
      })
      .where(eq(schema.migrationRuns.id, runId))
      .run()
  }

  async verify(runId: string) {
    const foreignKeys = this.database.$client.query("PRAGMA foreign_key_check").all().length
    const scalar = (query: string) => scalarCount(this.database.$client.query(query).get())
    return {
      runExists: Boolean(
        this.database
          .select()
          .from(schema.migrationRuns)
          .where(eq(schema.migrationRuns.id, runId))
          .get(),
      ),
      foreignKeyViolations: foreignKeys,
      users: scalar("select count(*) as count from user"),
      posts: scalar("select count(*) as count from posts"),
      comments: scalar("select count(*) as count from comments"),
      reactions: scalar("select count(*) as count from reactions"),
      media: scalar("select count(*) as count from media_assets"),
      publicPosts: scalar(
        "select count(*) as count from posts where status = 'published' and visibility = 'public'",
      ),
      unlistedPosts: scalar(
        "select count(*) as count from posts where status = 'published' and visibility = 'unlisted'",
      ),
      failedPosts: scalar("select count(*) as count from posts where status = 'failed'"),
    }
  }

  close() {
    this.database.$client.close()
  }
}

export class LocalObjectWriter implements MigrationObjectWriter {
  constructor(readonly directory: string) {}

  async put(key: string, sourcePath: string, checksum: string, _contentType: string) {
    const destination = resolve(this.directory, key)
    await mkdir(dirname(destination), { recursive: true })
    const existing = Bun.file(destination)
    if (await existing.exists()) {
      const digest = await fileChecksum(destination)
      if (digest !== checksum) throw new Error(`Object checksum conflict at ${key}.`)
      return
    }
    await Bun.write(destination, Bun.file(sourcePath))
  }
}

export class LocalVideoWriter implements MigrationVideoWriter {
  constructor(readonly archive: LocalObjectWriter) {}

  async upload(sourcePath: string, checksum: string, _creator: string) {
    const uid = `local-${new Bun.CryptoHasher("sha256")
      .update(`${checksum}:${basename(sourcePath)}`)
      .digest("hex")
      .slice(0, 32)}`
    await this.archive.put(
      `legacy-video/${checksum}-${basename(sourcePath)}`,
      sourcePath,
      checksum,
      "video/octet-stream",
    )
    return { uid, ready: true }
  }

  async status() {
    return { ready: true, failed: false }
  }
}
