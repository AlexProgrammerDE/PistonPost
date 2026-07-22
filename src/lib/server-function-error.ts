import { z } from "zod"

const messageSchema = z.string().trim().min(1).max(500)

const validationIssueSchema = z.object({
  path: z.string().max(500),
  message: messageSchema,
})

export const serverFunctionErrorSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("INVALID_INPUT"),
    message: messageSchema,
    issues: z.array(validationIssueSchema).max(20),
  }),
  z.object({ code: z.literal("UNAUTHENTICATED"), message: messageSchema }),
  z.object({ code: z.literal("FORBIDDEN"), message: messageSchema }),
  z.object({ code: z.literal("NOT_FOUND"), message: messageSchema }),
  z.object({ code: z.literal("CONFLICT"), message: messageSchema }),
  z.object({
    code: z.literal("RATE_LIMITED"),
    message: messageSchema,
    retryAfterSeconds: z.number().int().positive().max(86_400),
  }),
  z.object({
    code: z.literal("INTERNAL_ERROR"),
    message: messageSchema,
    requestId: z.string().uuid(),
  }),
])

export type ServerFunctionError = z.infer<typeof serverFunctionErrorSchema>

const serverFunctionErrorStatuses = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ServerFunctionError["code"], number>

export function serverFunctionErrorStatus(error: ServerFunctionError) {
  return serverFunctionErrorStatuses[error.code]
}

export class ServerFunctionClientError extends Error {
  readonly code: ServerFunctionError["code"]
  readonly details: ServerFunctionError

  constructor(details: ServerFunctionError) {
    super(details.message)
    this.name = "ServerFunctionClientError"
    this.code = details.code
    this.details = details
  }
}

export function parseServerFunctionError(value: unknown) {
  const parsed = serverFunctionErrorSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function toServerFunctionClientError(value: unknown) {
  const parsed = parseServerFunctionError(value)
  return parsed ? new ServerFunctionClientError(parsed) : null
}

export function serverFunctionValidator<Schema extends z.ZodType>(schema: Schema) {
  return (input: z.input<Schema>): z.output<Schema> => schema.parse(input)
}
