interface ImportMetaEnv {
  readonly VITE_PUBLIC_BETTER_AUTH_IDENTIFY_URL?: string
  readonly VITE_PUBLIC_POSTHOG_KEY?: string
  readonly VITE_PUBLIC_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
