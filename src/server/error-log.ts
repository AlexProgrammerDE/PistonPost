/** Writes one structured error line to Workers Logs, which collects console output. */
export function logError(event: string, fields: Readonly<Record<string, unknown>> = {}) {
  // oxlint-disable-next-line eslint/no-console -- Workers Logs ingest console output, so this is the log sink.
  console.error(JSON.stringify({ level: "error", event, ...fields }))
}
