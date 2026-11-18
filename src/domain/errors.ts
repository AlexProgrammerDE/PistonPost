import { Schema } from "effect"

export class AuthorizationError extends Schema.TaggedError<
  AuthorizationError,
  { readonly brand: unique symbol }
>()("AuthorizationError", {
  action: Schema.String,
  reason: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedError<
  NotFoundError,
  { readonly brand: unique symbol }
>()("NotFoundError", {
  entity: Schema.String,
  id: Schema.String,
}) {}

export class InvalidCursorError extends Schema.TaggedError<
  InvalidCursorError,
  { readonly brand: unique symbol }
>()("InvalidCursorError", { reason: Schema.String }) {}

export class RepositoryError extends Schema.TaggedError<
  RepositoryError,
  { readonly brand: unique symbol }
>()("RepositoryError", {
  operation: Schema.String,
  message: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedError<
  ConflictError,
  { readonly brand: unique symbol }
>()("ConflictError", {
  entity: Schema.String,
  id: Schema.String,
  expectedVersion: Schema.Int,
}) {}
