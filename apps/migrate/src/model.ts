import { Schema } from "effect"

export const migrationCommands = ["analyze", "dry-run", "apply", "verify"] as const
export type MigrationCommand = (typeof migrationCommands)[number]
export const migrationPhases = [
  "users",
  "posts",
  "comments",
  "reactions",
  "images",
  "videos",
  "verify",
] as const
export type MigrationPhase = (typeof migrationPhases)[number]

export type MigrationOptions = {
  command: MigrationCommand
  source?: string
  target: "local" | "preview" | "production"
  database?: string
  report: string
  resume?: string
  phase?: MigrationPhase
  concurrency: number
  limit?: number
  user?: string
  remote: boolean
  confirmProduction: boolean
}

export type LegacyDocument = Readonly<Record<string, unknown>>
export type LegacyCollection =
  | "users"
  | "posts"
  | "comments"
  | "reactions"
  | "images"
  | "videos"
  | "accounts"
  | "sessions"
  | "verificationTokens"

export type SourceFile = {
  path: string
  relativePath: string
  bytes: number
  checksum: string
  kind: "collection" | "image" | "video" | "other"
  collection?: LegacyCollection
}

export type MigrationIssue = {
  severity: "warning" | "error"
  code: string
  collection?: LegacyCollection
  legacyId?: string
  message: string
  path?: string
}

export type SourceInventory = {
  source: string
  fingerprint: string
  generatedAt: string
  collections: Partial<Record<LegacyCollection, number>>
  files: SourceFile[]
  mediaFiles: { images: number; videos: number; bytes: number }
  issues: MigrationIssue[]
}

export type LegacySource = {
  inventory: SourceInventory
  collections: Partial<Record<LegacyCollection, LegacyDocument[]>>
  mediaByName: Map<string, SourceFile>
  mediaById: Map<string, SourceFile>
}

export type ImportState = "imported" | "skipped" | "failed" | "already-present"
export type ImportResult = {
  collection: LegacyCollection
  legacyId: string
  targetTable: string
  targetId?: string
  checksum?: string
  state: ImportState
  reason?: string
}

export type MigrationReport = {
  runId: string
  command: MigrationCommand
  sourceFingerprint: string
  target: MigrationOptions["target"]
  startedAt: string
  finishedAt: string
  dryRun: boolean
  inventory: SourceInventory
  counters: Record<string, number>
  results: ImportResult[]
  issues: MigrationIssue[]
  checks: Record<string, string | number | boolean>
  verdict: "go" | "no-go"
}

export class MigrationError extends Schema.TaggedError<MigrationError>()("MigrationError", {
  operation: Schema.String,
  message: Schema.String,
}) {}
