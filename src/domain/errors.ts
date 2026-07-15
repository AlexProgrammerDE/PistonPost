import { Schema } from "effect"

export class AuthorizationError extends Schema.TaggedError<AuthorizationError>()(
  "AuthorizationError",
  {
    action: Schema.String,
    reason: Schema.String,
  },
) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()("NotFoundError", {
  entity: Schema.String,
  id: Schema.String,
}) {}

export class InvalidCursorError extends Schema.TaggedError<InvalidCursorError>()(
  "InvalidCursorError",
  { reason: Schema.String },
) {}

export class RepositoryError extends Schema.TaggedError<RepositoryError>()("RepositoryError", {
  operation: Schema.String,
  message: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedError<ConflictError>()("ConflictError", {
  entity: Schema.String,
  id: Schema.String,
  expectedVersion: Schema.Int,
}) {}
