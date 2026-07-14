import { Schema } from "effect"

const runtimeConfigSchema = Schema.Struct({
  APP_ENV: Schema.Literal("development", "preview", "production"),
  PUBLIC_APP_URL: Schema.URL,
})

export type RuntimeConfig = Schema.Schema.Type<typeof runtimeConfigSchema>

export type RuntimeEnv = {
  readonly bindings: Cloudflare.Env
  readonly config: RuntimeConfig
}

export function decodeRuntimeConfig(input: unknown): RuntimeConfig {
  return Schema.decodeUnknownSync(runtimeConfigSchema)(input)
}

export function resolveRuntimeEnv(bindings: Cloudflare.Env): RuntimeEnv {
  return {
    bindings,
    config: decodeRuntimeConfig(bindings),
  }
}
