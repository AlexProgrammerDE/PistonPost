function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

const baseUrl = new URL(required("PRODUCTION_BASE_URL"))
const sampledPost = process.env.PRODUCTION_SMOKE_POST_SLUG
const paths = ["/", "/auth/sign-in", "/migration", ...(sampledPost ? [`/post/${sampledPost}`] : [])]

const health = await fetch(new URL("/health", baseUrl), { redirect: "manual" })
if (!health.ok) throw new Error(`Health check returned ${health.status.toString()}.`)
if (health.headers.get("cache-control") !== "no-store") {
  throw new Error("Health check is missing its no-store policy.")
}

const results = await Promise.all(
  paths.map(async (path) => {
    const response = await fetch(new URL(path, baseUrl), { redirect: "manual" })
    if (!response.ok) throw new Error(`${path} returned ${response.status.toString()}.`)
    if (!response.headers.get("content-security-policy")) {
      throw new Error(`${path} is missing Content-Security-Policy.`)
    }
    if (response.headers.get("x-content-type-options") !== "nosniff") {
      throw new Error(`${path} is missing nosniff.`)
    }
    await response.body?.cancel()
    return { path, status: response.status }
  }),
)

process.stdout.write(`${JSON.stringify({ origin: baseUrl.origin, results }, null, 2)}\n`)
