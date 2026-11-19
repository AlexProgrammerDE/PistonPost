import { Context, Effect, Exit, Layer, Schema } from "effect"

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

export class AccountMediaPurgeError extends Schema.TaggedError<
  AccountMediaPurgeError,
  { readonly brand: unique symbol }
>()("AccountMediaPurgeError", {
  assetId: Schema.String,
  operation: Schema.Literals(["r2", "stream", "database"]),
}) {}

class AccountMediaPurge extends Context.Service<
  AccountMediaPurge,
  {
    readonly deleteR2: (assetId: string, key: string) => Effect.Effect<void, AccountMediaPurgeError>
    readonly deleteStream: (
      assetId: string,
      uid: string,
    ) => Effect.Effect<void, AccountMediaPurgeError>
    readonly deleteRecord: (id: string) => Effect.Effect<void, AccountMediaPurgeError>
  }
>()("@pistonpost/media/AccountMediaPurge") {}

/** Stream bindings throw `NotFoundError` with `statusCode: 404` once a video is gone. */
export function missingProviderObject(cause: unknown) {
  if (!cause || typeof cause !== "object") return false
  const value = cause as { name?: unknown; status?: unknown; statusCode?: unknown; code?: unknown }
  return (
    value.name === "NotFoundError" ||
    value.statusCode === 404 ||
    value.status === 404 ||
    value.code === 404 ||
    value.code === "NOT_FOUND"
  )
}

function providerDelete(assetId: string, operation: "r2" | "stream", task: () => Promise<void>) {
  return Effect.tryPromise({
    try: task,
    catch: (cause) =>
      missingProviderObject(cause) ? null : new AccountMediaPurgeError({ assetId, operation }),
  }).pipe(
    Effect.catchIf(
      (error) => error === null,
      () => Effect.void,
    ),
    Effect.uninterruptible,
  )
}

export function accountMediaPurgeLayer(services: AccountMediaPurgeServices) {
  return Layer.succeed(AccountMediaPurge, {
    deleteR2: (assetId, key) => providerDelete(assetId, "r2", () => services.deleteR2(key)),
    deleteStream: (assetId, uid) =>
      providerDelete(assetId, "stream", () => services.deleteStream(uid)),
    deleteRecord: (assetId) =>
      Effect.tryPromise({
        try: () => services.deleteRecord(assetId),
        catch: () => new AccountMediaPurgeError({ assetId, operation: "database" }),
      }).pipe(Effect.uninterruptible),
  })
}

export const purgeAccountMedia = Effect.fn("AccountDeletion.purgeMedia")(function* (
  assets: readonly OwnedMediaForDeletion[],
) {
  const services = yield* AccountMediaPurge
  // One failed asset must not block the others. The workflow step retries the remainder.
  const exits = yield* Effect.forEach(
    assets,
    (asset) =>
      Effect.gen(function* () {
        if (asset.r2Key) yield* services.deleteR2(asset.id, asset.r2Key)
        if (asset.streamUid) yield* services.deleteStream(asset.id, asset.streamUid)
        yield* services.deleteRecord(asset.id)
      }).pipe(Effect.uninterruptible, Effect.exit),
    { concurrency: 5 },
  )
  const failure = exits.find((exit) => Exit.isFailure(exit))
  if (failure) return yield* Effect.failCause(failure.cause)
})
