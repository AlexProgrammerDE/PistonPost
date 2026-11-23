import { Schema } from "effect"

const runtimeConfigSchema = Schema.Struct({
  APP_ENV: Schema.Literals(["development", "preview", "production"]),
  // Dash and Sentinel call the hosted Better Auth service. Local development disables them
  // because it has no real API key.
  BETTER_AUTH_INFRA: Schema.Literals(["enabled", "disabled"]),
  PUBLIC_APP_URL: Schema.URLFromString,
})

export type RuntimeConfig = typeof runtimeConfigSchema.Type

export type RuntimeEnv = {
  readonly bindings: Cloudflare.Env
  readonly config: RuntimeConfig
}

export function decodeRuntimeConfig(input: unknown): RuntimeConfig {
  return Schema.decodeUnknownSync(runtimeConfigSchema, { errors: "all" })(input)
}

export function resolveRuntimeEnv(bindings: Cloudflare.Env): RuntimeEnv {
  return {
    bindings,
    config: decodeRuntimeConfig(bindings),
  }
}
