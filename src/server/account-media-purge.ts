import { Effect, Schema } from "effect"

export type OwnedMediaForDeletion = {
  id: string
  r2Key: string | null
  streamUid: string | null
}

export type AccountMediaPurgeServices = {
  deleteR2: (key: string) => Promise<void>
  deleteStream: (uid: string) => Promise<void>
  deleteRecord: (id: string) => Promise<void>
}

export class AccountMediaPurgeError extends Schema.TaggedError<AccountMediaPurgeError>()(
  "AccountMediaPurgeError",
  {
    assetId: Schema.String,
    operation: Schema.Literal("r2", "stream", "database"),
  },
) {}

function missingProviderObject(cause: unknown) {
  if (!cause || typeof cause !== "object") return false
  const value = cause as { status?: unknown; code?: unknown }
  return value.status === 404 || value.code === 404 || value.code === "NOT_FOUND"
}

function providerDelete(assetId: string, operation: "r2" | "stream", task: () => Promise<void>) {
  return Effect.tryPromise({
    try: task,
    catch: (cause) =>
      missingProviderObject(cause) ? null : new AccountMediaPurgeError({ assetId, operation }),
  }).pipe(Effect.catchAll((error) => (error === null ? Effect.void : Effect.fail(error))))
}

export function purgeAccountMedia(
  assets: OwnedMediaForDeletion[],
  services: AccountMediaPurgeServices,
) {
  return Effect.forEach(
    assets,
    (asset) =>
      Effect.gen(function* () {
        const r2Key = asset.r2Key
        if (r2Key) yield* providerDelete(asset.id, "r2", () => services.deleteR2(r2Key))
        const streamUid = asset.streamUid
        if (streamUid) {
          yield* providerDelete(asset.id, "stream", () => services.deleteStream(streamUid))
        }
        yield* Effect.tryPromise({
          try: () => services.deleteRecord(asset.id),
          catch: () => new AccountMediaPurgeError({ assetId: asset.id, operation: "database" }),
        })
      }),
    { concurrency: 5 },
  )
}
