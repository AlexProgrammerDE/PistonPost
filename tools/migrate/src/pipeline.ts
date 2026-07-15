import { basename, resolve } from "node:path"

import { Effect, Schedule } from "effect"

import { createCloudflareAdapters } from "./cloudflare-adapters"
import { LocalMigrationDatabaseWriter, LocalObjectWriter, LocalVideoWriter } from "./local-adapters"
import { migrationLog } from "./log"
import type {
  ImportResult,
  LegacySource,
  MigrationIssue,
  MigrationOptions,
  MigrationReport,
  SourceInventory,
} from "./model"
import { MigrationError } from "./model"
import { writeMigrationReport } from "./report"
import { loadLegacySource } from "./source"
import { transformLegacySource, type TransformedMigration } from "./transform"
import type {
  MigrationDatabaseWriter,
  MigrationObjectWriter,
  MigrationVideoWriter,
  PersistedMedia,
} from "./writer"

const retryPolicy = Schedule.exponential("250 millis").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(4)),
)

function operation<T>(name: string, task: () => Promise<T>) {
  return Effect.tryPromise({
    try: task,
    catch: (cause) =>
      new MigrationError({
        operation: name,
        message: cause instanceof Error ? cause.message : "Unknown migration failure.",
      }),
  }).pipe(Effect.retry(retryPolicy))
}

function emptyInventory(): SourceInventory {
  return {
    source: "not-required",
    fingerprint: "verification-only",
    generatedAt: new Date().toISOString(),
    collections: {},
    files: [],
    mediaFiles: { images: 0, videos: 0, bytes: 0 },
    issues: [],
  }
}

function countResults(results: ImportResult[]) {
  const counters: Record<string, number> = {}
  for (const result of results) {
    counters[`${result.collection}.${result.state}`] =
      (counters[`${result.collection}.${result.state}`] ?? 0) + 1
  }
  return counters
}

function filterForUser(transformed: TransformedMigration, legacyUserId?: string) {
  if (!legacyUserId) return transformed
  const user = transformed.users.find((candidate) => candidate.legacyId === legacyUserId)
  if (!user) return { ...transformed, users: [], media: [], posts: [], comments: [], reactions: [] }
  const posts = transformed.posts.filter((post) => post.authorId === user.id)
  const postIds = new Set(posts.map((post) => post.id))
  return {
    ...transformed,
    users: [user],
    media: transformed.media.filter((media) => media.ownerId === user.id),
    posts,
    comments: transformed.comments.filter(
      (comment) => comment.authorId === user.id || postIds.has(comment.postId),
    ),
    reactions: transformed.reactions.filter(
      (reaction) => reaction.userId === user.id || postIds.has(reaction.postId),
    ),
  }
}

function migrationAdminIds() {
  return new Set(
    (process.env.PISTONPOST_MIGRATION_ADMIN_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

function shouldRun(options: MigrationOptions, phase: MigrationOptions["phase"]) {
  return options.phase === undefined || options.phase === phase
}

function dryRunResults(transformed: TransformedMigration): ImportResult[] {
  const entityResults: ImportResult[] = [
    ...transformed.users.map((value) => ({ collection: "users", value, table: "user" }) as const),
    ...transformed.media.map(
      (value) =>
        ({
          collection: value.kind === "video" ? "videos" : "images",
          value,
          table: "media_assets",
        }) as const,
    ),
    ...transformed.posts.map((value) => ({ collection: "posts", value, table: "posts" }) as const),
    ...transformed.comments.map(
      (value) => ({ collection: "comments", value, table: "comments" }) as const,
    ),
  ].map(({ collection, value, table }) => ({
    collection,
    legacyId: value.legacyId,
    targetTable: table,
    targetId: value.id,
    state: "skipped",
    reason: "Dry run only. No target was changed.",
  }))
  return [
    ...entityResults,
    ...transformed.reactions.map(
      (reaction): ImportResult => ({
        collection: "reactions",
        legacyId: `${reaction.postId}:${reaction.userId}:${reaction.type}`,
        targetTable: "reactions",
        state: "skipped",
        reason: "Dry run only. No target was changed.",
      }),
    ),
  ]
}

function applyMigration(
  options: MigrationOptions,
  database: MigrationDatabaseWriter,
  runId: string,
  transformed: TransformedMigration,
  objectWriter: MigrationObjectWriter,
  videoWriter: MigrationVideoWriter,
  inventory: SourceInventory,
) {
  return Effect.gen(function* () {
    const results: ImportResult[] = []
    if (shouldRun(options, "users")) {
      results.push(
        ...(yield* Effect.forEach(
          transformed.users,
          (user) => operation("write-user", () => database.writeUser(runId, user)),
          { concurrency: 1 },
        )),
      )
    }
    const selectedMedia = transformed.media.filter((media) =>
      shouldRun(options, media.kind === "image" ? "images" : "videos"),
    )
    results.push(
      ...(yield* Effect.forEach(
        selectedMedia,
        (media) =>
          Effect.gen(function* () {
            const collection = media.kind === "video" ? "videos" : "images"
            const alreadyImported = yield* operation("check-media", () =>
              database.imported(collection, media.legacyId),
            )
            if (alreadyImported) {
              return {
                collection,
                legacyId: media.legacyId,
                targetTable: "media_assets",
                targetId: media.id,
                state: "already-present",
              } satisfies ImportResult
            }
            let persisted: PersistedMedia
            if (media.kind === "image") {
              yield* operation("upload-image", () =>
                objectWriter.put(media.objectKey, media.sourcePath, media.checksum, media.mimeType),
              )
              persisted = { ...media, provider: "r2", status: "ready" }
            } else {
              yield* operation("archive-video", () =>
                objectWriter.put(media.objectKey, media.sourcePath, media.checksum, media.mimeType),
              )
              const video = yield* operation("upload-video", () =>
                videoWriter.upload(media.sourcePath, media.checksum, media.ownerId ?? "legacy"),
              )
              persisted = {
                ...media,
                provider: "stream",
                status: video.ready ? "ready" : "processing",
                streamUid: video.uid,
              }
            }
            return yield* operation("write-media", () => database.writeMedia(runId, persisted))
          }),
        { concurrency: options.concurrency },
      )),
    )
    if (
      options.phase === undefined ||
      options.phase === "images" ||
      options.phase === "videos" ||
      options.phase === "quarantine"
    ) {
      const filesByPath = new Map(inventory.files.map((file) => [file.relativePath, file]))
      const quarantineIssues = inventory.issues.filter(
        (issue) =>
          (issue.code === "orphan-media-record" || issue.code === "unmatched-archive-file") &&
          issue.path !== undefined,
      )
      results.push(
        ...(yield* Effect.forEach(
          quarantineIssues,
          (issue) =>
            Effect.gen(function* () {
              const file = issue.path ? filesByPath.get(issue.path) : undefined
              if (!file || file.kind === "other" || file.kind === "collection") {
                return {
                  collection: issue.collection ?? "images",
                  legacyId: issue.legacyId ?? issue.path ?? "unknown",
                  targetTable: "quarantine_manifest",
                  state: "failed",
                  reason: "Quarantine source file could not be resolved.",
                } satisfies ImportResult
              }
              const phase = file.kind === "image" ? "images" : "videos"
              if (
                options.phase !== undefined &&
                options.phase !== "quarantine" &&
                options.phase !== phase
              ) {
                return {
                  collection: phase,
                  legacyId: issue.legacyId ?? file.relativePath,
                  targetTable: "quarantine_manifest",
                  checksum: file.checksum,
                  state: "skipped",
                  reason: "Quarantine file belongs to a different migration phase.",
                } satisfies ImportResult
              }
              const key = `quarantine/${inventory.fingerprint}/${file.checksum}-${basename(file.path)}`
              yield* operation("quarantine-media", () =>
                objectWriter.put(key, file.path, file.checksum, "application/octet-stream"),
              )
              return {
                collection: phase,
                legacyId: issue.legacyId ?? file.relativePath,
                targetTable: "quarantine_manifest",
                targetId: key,
                checksum: file.checksum,
                state: "skipped",
                reason: issue.message,
              } satisfies ImportResult
            }),
          { concurrency: options.concurrency },
        )),
      )
    }
    if (shouldRun(options, "posts")) {
      results.push(
        ...(yield* Effect.forEach(
          transformed.posts,
          (post) => operation("write-post", () => database.writePost(runId, post)),
          { concurrency: 1 },
        )),
      )
    }
    if (shouldRun(options, "comments")) {
      results.push(
        ...(yield* Effect.forEach(
          transformed.comments,
          (comment) => operation("write-comment", () => database.writeComment(runId, comment)),
          { concurrency: 1 },
        )),
      )
    }
    if (shouldRun(options, "reactions")) {
      results.push(
        ...(yield* Effect.forEach(
          transformed.reactions,
          (reaction) => operation("write-reaction", () => database.writeReaction(runId, reaction)),
          { concurrency: 1 },
        )),
      )
    }
    return results
  })
}

function loadSource(options: MigrationOptions) {
  if (!options.source) return Effect.succeed<LegacySource | undefined>(undefined)
  return operation("load-source", () => loadLegacySource(options.source!, options.limit)).pipe(
    Effect.map((source) => source as LegacySource | undefined),
  )
}

export function migrationProgram(options: MigrationOptions) {
  return Effect.gen(function* () {
    const startedAt = new Date().toISOString()
    migrationLog("info", "migration.started", { command: options.command, target: options.target })
    const source = yield* loadSource(options)
    const inventory = source?.inventory ?? emptyInventory()
    const transformed = source
      ? filterForUser(transformLegacySource(source, migrationAdminIds()), options.user)
      : undefined
    let runId = options.resume ?? `analysis-${inventory.fingerprint.slice(0, 12)}`
    let results: ImportResult[] = []
    let checks: Record<string, string | number | boolean> = {}
    let database: MigrationDatabaseWriter | undefined

    if (options.command === "dry-run" && transformed) {
      results = dryRunResults(transformed)
    }
    if (options.command === "apply" || options.command === "verify") {
      let objectWriter: MigrationObjectWriter
      let videoWriter: MigrationVideoWriter
      if (options.remote && options.target !== "local") {
        const cloudflareTarget = options.target
        const adapters = yield* operation("create-cloudflare-adapters", async () =>
          createCloudflareAdapters(cloudflareTarget),
        )
        database = adapters.database
        objectWriter = adapters.objectWriter
        videoWriter = adapters.videoWriter
      } else {
        const databasePath = resolve(options.database ?? ".migration/rehearsal.sqlite")
        database = new LocalMigrationDatabaseWriter(databasePath)
        const localObjectWriter = new LocalObjectWriter(
          resolve(dirnameOrCurrent(databasePath), "objects"),
        )
        objectWriter = localObjectWriter
        videoWriter = new LocalVideoWriter(localObjectWriter)
      }
      yield* operation("initialize-database", () => database!.initialize())
      if (options.command === "apply") {
        if (!transformed) {
          return yield* Effect.fail(
            new MigrationError({ operation: "apply", message: "Apply requires a source." }),
          )
        }
        if (
          options.target === "production" &&
          transformed.issues.some((issue) => issue.severity === "error")
        ) {
          return yield* Effect.fail(
            new MigrationError({
              operation: "production-preflight",
              message: "Production apply is blocked by unresolved migration errors.",
            }),
          )
        }
        const run = yield* operation("begin-run", () =>
          database!.beginRun(inventory.fingerprint, options.resume),
        )
        runId = run.id
        results = yield* applyMigration(
          options,
          database,
          runId,
          transformed,
          objectWriter,
          videoWriter,
          inventory,
        )
      }
      if (options.command === "verify" || shouldRun(options, "verify")) {
        checks = yield* operation("verify", () => database!.verify(runId))
      }
    }

    const issues: MigrationIssue[] = transformed?.issues ?? inventory.issues
    const counters = countResults(results)
    const hasFailedResult = results.some((result) => result.state === "failed")
    const hasFailedCheck =
      checks.foreignKeyViolations !== undefined && Number(checks.foreignKeyViolations) > 0
    const verdict =
      issues.some((issue) => issue.severity === "error") || hasFailedResult || hasFailedCheck
        ? "no-go"
        : "go"
    if (database && options.command === "apply") {
      const activeDatabase = database
      yield* operation("finish-run", () => activeDatabase.finishRun(runId, counters, verdict))
    }
    database?.close()
    const report: MigrationReport = {
      runId,
      command: options.command,
      sourceFingerprint: inventory.fingerprint,
      target: options.target,
      startedAt,
      finishedAt: new Date().toISOString(),
      dryRun: options.command !== "apply",
      inventory,
      counters,
      results,
      issues,
      checks,
      verdict,
    }
    const paths = yield* operation("write-report", () =>
      writeMigrationReport(report, options.report),
    )
    migrationLog("info", "migration.finished", { runId, verdict, ...paths })
    return report
  })
}

function dirnameOrCurrent(path: string) {
  const lastSeparator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return lastSeparator === -1 ? "." : path.slice(0, lastSeparator)
}
