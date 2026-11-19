import { Crypto, Effect, PlatformError } from "effect"

// oxlint-disable-next-line effecttsgo/unstable-api-usage -- Effect 4.0.2 exposes its secure UUID implementation through Crypto.make.
const webCrypto = Crypto.make({
  randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) =>
    Effect.tryPromise({
      try: async () => new Uint8Array(await crypto.subtle.digest(algorithm, Uint8Array.from(data))),
      catch: (cause) =>
        // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Crypto.make requires a typed PlatformError from its digest adapter.
        PlatformError.systemError({
          _tag: "Unknown",
          module: "WebCrypto",
          method: "digest",
          cause,
        }),
    }),
})

export const randomUuid = webCrypto.randomUUIDv4.pipe(Effect.orDie)
