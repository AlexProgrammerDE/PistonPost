// oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
interface ImportMetaEnv {
  readonly VITE_PUBLIC_BETTER_AUTH_IDENTIFY_URL?: string
  readonly VITE_PUBLIC_POSTHOG_KEY?: string
  readonly VITE_PUBLIC_POSTHOG_HOST?: string
}

// oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
interface ImportMeta {
  readonly env: ImportMetaEnv
}
