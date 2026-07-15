import type { ImportResult } from "./model"
import type {
  ImportedComment,
  ImportedMedia,
  ImportedPost,
  ImportedReaction,
  ImportedUser,
} from "./transform"

export type PersistedMedia = ImportedMedia & {
  provider: "r2" | "stream"
  status: "ready" | "processing" | "failed"
  streamUid?: string
}

export interface MigrationDatabaseWriter {
  initialize(): Promise<void>
  beginRun(fingerprint: string, requestedRunId?: string): Promise<{ id: string; resumed: boolean }>
  imported(collection: string, legacyId: string): Promise<boolean>
  writeUser(runId: string, value: ImportedUser): Promise<ImportResult>
  writeMedia(runId: string, value: PersistedMedia): Promise<ImportResult>
  writePost(runId: string, value: ImportedPost): Promise<ImportResult>
  writeComment(runId: string, value: ImportedComment): Promise<ImportResult>
  writeReaction(runId: string, value: ImportedReaction): Promise<ImportResult>
  finishRun(runId: string, counters: Record<string, number>, verdict: "go" | "no-go"): Promise<void>
  verify(runId: string): Promise<Record<string, string | number | boolean>>
  close(): void
}

export interface MigrationObjectWriter {
  put(key: string, sourcePath: string, checksum: string, contentType: string): Promise<void>
}

export interface MigrationVideoWriter {
  upload(
    sourcePath: string,
    checksum: string,
    creator: string,
  ): Promise<{ uid: string; ready: boolean }>
  status(uid: string): Promise<{ ready: boolean; failed: boolean }>
}
