declare namespace Cloudflare {
  interface Env {
    readonly BETTER_AUTH_API_KEY: string | SecretsStoreSecret
    readonly BETTER_AUTH_SECRET: string | SecretsStoreSecret
    readonly TURNSTILE_SECRET: string | SecretsStoreSecret
    readonly STREAM_WEBHOOK_SECRET: string | SecretsStoreSecret
    readonly STREAM_ACCOUNT_ID: string | SecretsStoreSecret
    readonly STREAM_API_TOKEN: string | SecretsStoreSecret
  }
}

interface ImportMetaEnv {
  readonly VITE_PUBLIC_BETTER_AUTH_IDENTIFY_URL?: string
  readonly VITE_PUBLIC_POSTHOG_KEY?: string
  readonly VITE_PUBLIC_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
