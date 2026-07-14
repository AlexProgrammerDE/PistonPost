type Options = {
  baseUrl: string
  requests: number
  concurrency: number
  post?: string
}

type Scenario = {
  name: string
  path: string
  method: "GET" | "POST"
  body?: string
}

function valueAfter(args: string[], index: number, flag: string) {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`)
  return value
}

function parseOptions(args: string[]): Options {
  const options: Options = {
    baseUrl: "http://localhost:3000",
    requests: 100,
    concurrency: 10,
  }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === "--base-url") options.baseUrl = valueAfter(args, index++, flag)
    else if (flag === "--requests") options.requests = Number(valueAfter(args, index++, flag))
    else if (flag === "--concurrency") options.concurrency = Number(valueAfter(args, index++, flag))
    else if (flag === "--post") options.post = valueAfter(args, index++, flag)
    else throw new Error(`Unknown load-test option ${flag ?? "none"}.`)
  }
  if (!Number.isInteger(options.requests) || options.requests < 1 || options.requests > 10_000) {
    throw new Error("--requests must be an integer from 1 to 10000.")
  }
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 100
  ) {
    throw new Error("--concurrency must be an integer from 1 to 100.")
  }
  return options
}

function percentile(values: number[], fraction: number) {
  const sorted = values.toSorted((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

async function runScenario(options: Options, scenario: Scenario) {
  const durations: number[] = []
  let failures = 0
  let next = 0
  const sessionCookie = process.env.LOAD_TEST_SESSION_COOKIE
  const workers = Array.from({ length: Math.min(options.concurrency, options.requests) }, () =>
    (async () => {
      while (next < options.requests) {
        next += 1
        const started = performance.now()
        try {
          const headers = new Headers()
          if (scenario.method === "POST") {
            headers.set("content-type", "application/json")
            headers.set("origin", new URL(options.baseUrl).origin)
          }
          if (sessionCookie) headers.set("cookie", sessionCookie)
          // The bounded worker loop awaits each request so concurrency never exceeds the configured pool.
          // eslint-disable-next-line no-await-in-loop
          const response = await fetch(new URL(scenario.path, options.baseUrl), {
            method: scenario.method,
            headers,
            body: scenario.body,
            redirect: "manual",
          })
          if (response.status >= 400) failures += 1
          // eslint-disable-next-line no-await-in-loop
          await response.arrayBuffer()
        } catch {
          failures += 1
        } finally {
          durations.push(performance.now() - started)
        }
      }
    })(),
  )
  const started = performance.now()
  await Promise.all(workers)
  const elapsed = performance.now() - started
  return {
    scenario: scenario.name,
    requests: durations.length,
    failures,
    requestsPerSecond: Math.round((durations.length / elapsed) * 1000 * 10) / 10,
    p50Milliseconds: Math.round(percentile(durations, 0.5) * 10) / 10,
    p95Milliseconds: Math.round(percentile(durations, 0.95) * 10) / 10,
  }
}

const options = parseOptions(Bun.argv.slice(2))
const scenarios: Scenario[] = [
  { name: "feed", path: "/", method: "GET" },
  { name: "auth-initiation", path: "/auth/sign-in", method: "GET" },
  ...(options.post
    ? [{ name: "post-detail", path: `/post/${options.post}`, method: "GET" } as const]
    : []),
]

const mutationConfiguration = [
  ["reaction", process.env.LOAD_TEST_REACTION_PATH, process.env.LOAD_TEST_REACTION_BODY],
  ["comment", process.env.LOAD_TEST_COMMENT_PATH, process.env.LOAD_TEST_COMMENT_BODY],
] as const
for (const [name, path, body] of mutationConfiguration) {
  if (path && body && process.env.LOAD_TEST_SESSION_COOKIE) {
    JSON.parse(body)
    scenarios.push({ name, path, method: "POST", body })
  }
}

const reports = await Promise.all(scenarios.map((scenario) => runScenario(options, scenario)))
process.stdout.write(
  `${JSON.stringify({ target: new URL(options.baseUrl).origin, reports }, null, 2)}\n`,
)

if (reports.some((report) => report.failures > 0)) process.exitCode = 1
