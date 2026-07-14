export type LogLevel = "debug" | "info" | "warn" | "error"

const privateKeys = /authorization|cookie|email|password|secret|token/i

function sanitize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message }
  if (Array.isArray(value)) return value.map(sanitize)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateKeys.test(key))
        .map(([key, entry]) => [key, sanitize(entry)]),
    )
  }
  return value
}

export function migrationLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level, event, fields: sanitize(fields) })}\n`,
  )
}
