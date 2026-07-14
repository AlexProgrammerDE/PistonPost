export type OperationalEvent =
  | "auth.request"
  | "cache.response"
  | "dead-letter.received"
  | "request.completed"
  | "request.rejected"

export function writeOperationalEvent(
  env: Cloudflare.Env,
  event: OperationalEvent,
  dimensions: readonly string[] = [],
  measurements: readonly number[] = [],
) {
  env.ANALYTICS.writeDataPoint({
    indexes: [event],
    blobs: [event, ...dimensions.slice(0, 19)],
    doubles: measurements.slice(0, 20),
  })
}
