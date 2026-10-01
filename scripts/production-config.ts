export const secretBindings = [
  "BETTER_AUTH_API_KEY",
  "BETTER_AUTH_SECRET",
  "EMAIL_UNSUBSCRIBE_SECRET",
  "TURNSTILE_SECRET",
  "STREAM_WEBHOOK_SECRET",
  "STREAM_ACCOUNT_ID",
  "STREAM_API_TOKEN",
  "VAPID_PRIVATE_KEY",
]
const productionOrigin = "https://post.pistonmaster.net"
export interface ProductionDeployInput {
  readonly baseUrl: string
  readonly turnstileSiteKey: string
  readonly d1DatabaseId: string
  readonly secretsStoreId: string
  readonly vapidPublicKey: string
}

function requiredEnvironmentVariable(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
) {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required for a production deployment.`)
  return value
}

function validateResourceId(value: string, name: string) {
  if (!/^[a-f\d-]{32,36}$/i.test(value)) {
    throw new Error(`${name} must be a Cloudflare resource ID.`)
  }
  return value
}

export function readProductionDeployInput(
  environment: Readonly<Record<string, string | undefined>>,
): ProductionDeployInput {
  const baseUrl = requiredEnvironmentVariable(environment, "PRODUCTION_BASE_URL")
  const parsedBaseUrl = new URL(baseUrl)
  if (
    parsedBaseUrl.protocol !== "https:" ||
    parsedBaseUrl.pathname !== "/" ||
    parsedBaseUrl.search ||
    parsedBaseUrl.hash ||
    parsedBaseUrl.port
  ) {
    throw new Error("PRODUCTION_BASE_URL must be an HTTPS origin without a path, query, or port.")
  }
  if (parsedBaseUrl.origin !== productionOrigin) {
    throw new Error(`PRODUCTION_BASE_URL must be ${productionOrigin}.`)
  }

  const turnstileSiteKey = requiredEnvironmentVariable(environment, "PRODUCTION_TURNSTILE_SITE_KEY")
  if (
    turnstileSiteKey.startsWith("replace-with-") ||
    turnstileSiteKey === "1x00000000000000000000AA"
  ) {
    throw new Error("PRODUCTION_TURNSTILE_SITE_KEY must use the production Turnstile widget.")
  }
  const vapidPublicKey = requiredEnvironmentVariable(environment, "PRODUCTION_VAPID_PUBLIC_KEY")
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(vapidPublicKey)) {
    throw new Error("PRODUCTION_VAPID_PUBLIC_KEY must be a URL-safe VAPID public key.")
  }

  return {
    baseUrl: parsedBaseUrl.origin,
    turnstileSiteKey,
    d1DatabaseId: validateResourceId(
      requiredEnvironmentVariable(environment, "PRODUCTION_D1_DATABASE_ID"),
      "PRODUCTION_D1_DATABASE_ID",
    ),
    secretsStoreId: validateResourceId(
      requiredEnvironmentVariable(environment, "PRODUCTION_SECRETS_STORE_ID"),
      "PRODUCTION_SECRETS_STORE_ID",
    ),
    vapidPublicKey,
  }
}
