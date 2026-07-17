const generatedConfigPath = new URL("../dist/server/wrangler.json", import.meta.url)

const secretBindings = [
  "BETTER_AUTH_API_KEY",
  "BETTER_AUTH_SECRET",
  "TURNSTILE_SECRET",
  "STREAM_WEBHOOK_SECRET",
  "STREAM_ACCOUNT_ID",
  "STREAM_API_TOKEN",
]
const productionOrigin = "https://post.pistonmaster.net"
const productionVariables = {
  AUTH_EMAIL_FROM: "PistonPost Auth <auth@transactional.pistonmaster.net>",
  NOTIFICATIONS_EMAIL_FROM: "PistonPost <notifications@transactional.pistonmaster.net>",
  SUPPORT_EMAIL: "support@pistonmaster.net",
} as const

type JsonRecord = Record<string, unknown>

export interface ProductionDeployInput {
  readonly baseUrl: string
  readonly turnstileSiteKey: string
  readonly d1DatabaseId: string
  readonly secretsStoreId: string
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, name: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`)
  return value
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
  }
}

export function prepareProductionDeployConfig(
  configValue: unknown,
  input: ProductionDeployInput,
): JsonRecord {
  const config = requireRecord(configValue, "Generated Wrangler configuration")
  if (config.name !== "pistonpost-production" || config.targetEnvironment !== "production") {
    throw new Error(
      "The generated Wrangler configuration is not production. Build with CLOUDFLARE_ENV=production.",
    )
  }

  const variables = requireRecord(config.vars, "Generated Wrangler variables")
  if (variables.APP_ENV !== "production") {
    throw new Error("The generated Wrangler configuration has a non-production APP_ENV.")
  }
  for (const [name, expectedValue] of Object.entries(productionVariables)) {
    if (variables[name] !== expectedValue) {
      throw new Error(`The generated Wrangler configuration has an invalid ${name}.`)
    }
  }

  if (!Array.isArray(config.d1_databases)) {
    throw new Error("Generated Wrangler configuration is missing D1 bindings.")
  }

  let foundDatabase = false
  const databases = config.d1_databases.map((value) => {
    const database = requireRecord(value, "D1 binding")
    if (database.binding !== "DB") return database
    foundDatabase = true
    if (database.database_name !== "pistonpost-production") {
      throw new Error("The DB binding does not target pistonpost-production.")
    }
    return { ...database, database_id: input.d1DatabaseId }
  })
  if (!foundDatabase) throw new Error("Generated Wrangler configuration is missing the DB binding.")

  const hostname = new URL(input.baseUrl).hostname
  const standaloneConfig = Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => key !== "targetEnvironment" && key !== "legacy_env" && key !== "env",
    ),
  )
  return {
    ...standaloneConfig,
    workers_dev: false,
    routes: [{ pattern: hostname, custom_domain: true }],
    vars: {
      ...variables,
      PUBLIC_APP_URL: input.baseUrl,
      TURNSTILE_SITE_KEY: input.turnstileSiteKey,
    },
    d1_databases: databases,
    secrets_store_secrets: secretBindings.map((secretName) => ({
      binding: secretName,
      store_id: input.secretsStoreId,
      secret_name: secretName,
    })),
  }
}

async function main() {
  const input = readProductionDeployInput(process.env)
  const source = await Bun.file(generatedConfigPath).text()
  const parsed: unknown = JSON.parse(source)
  const prepared = prepareProductionDeployConfig(parsed, input)
  await Bun.write(generatedConfigPath, `${JSON.stringify(prepared)}\n`)
  process.stdout.write(
    `Prepared ${String(prepared.name)} for ${new URL(input.baseUrl).hostname} with production-only bindings.\n`,
  )
}

if (import.meta.main) await main()
