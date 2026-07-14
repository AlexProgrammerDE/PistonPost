export type DeadLetterMetadata = {
  messageId: string
  sourceQueue: string
  originalType: string
  attempts: number
}

function objectRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function deadLetterMetadata(
  sourceQueue: string,
  message: Pick<Message, "attempts" | "body" | "id">,
): DeadLetterMetadata {
  const originalType =
    objectRecord(message.body) && typeof message.body.type === "string"
      ? message.body.type.slice(0, 80)
      : "unknown"
  return {
    messageId: message.id,
    sourceQueue,
    originalType,
    attempts: message.attempts,
  }
}
