declare namespace Cloudflare {
  interface Env {
    readonly BETTER_AUTH_SECRET: string | SecretsStoreSecret
    readonly TURNSTILE_SECRET: string | SecretsStoreSecret
    readonly STREAM_WEBHOOK_SECRET: string | SecretsStoreSecret
  }
}
