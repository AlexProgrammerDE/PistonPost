import { Schema, Result } from "effect"

const messageSchema = Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500))

const validationIssueSchema = Schema.Struct({
  path: Schema.String.check(Schema.isMaxLength(500)),
  message: messageSchema,
})

export const serverFunctionErrorSchema = Schema.Union([
  Schema.Struct({
    code: Schema.Literal("INVALID_INPUT"),
    message: messageSchema,
    issues: Schema.mutable(Schema.Array(validationIssueSchema)).check(Schema.isMaxLength(20)),
  }),
  Schema.Struct({ code: Schema.Literal("UNAUTHENTICATED"), message: messageSchema }),
  Schema.Struct({ code: Schema.Literal("FORBIDDEN"), message: messageSchema }),
  Schema.Struct({ code: Schema.Literal("NOT_FOUND"), message: messageSchema }),
  Schema.Struct({ code: Schema.Literal("CONFLICT"), message: messageSchema }),
  Schema.Struct({
    code: Schema.Literal("RATE_LIMITED"),
    message: messageSchema,
    retryAfterSeconds: Schema.Finite.check(Schema.isInt())
      .check(Schema.isGreaterThan(0))
      .check(Schema.isLessThanOrEqualTo(86_400)),
  }),
  Schema.Struct({
    code: Schema.Literal("INTERNAL_ERROR"),
    message: messageSchema,
    requestId: Schema.String.check(Schema.isUUID()),
  }),
])

export type ServerFunctionError = (typeof serverFunctionErrorSchema)["Type"]

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
  const parsed = Schema.decodeUnknownResult(serverFunctionErrorSchema, { errors: "all" })(value)
  return Result.isSuccess(parsed) ? parsed.success : null
}

export function toServerFunctionClientError(value: unknown) {
  const parsed = parseServerFunctionError(value)
  return parsed ? new ServerFunctionClientError(parsed) : null
}

export function serverFunctionValidator<Schema extends Schema.ConstraintDecoder<unknown>>(
  schema: Schema,
) {
  return (input: Schema["Encoded"]): Schema["Type"] =>
    Schema.decodeUnknownSync(schema, { errors: "all" })(input)
}
