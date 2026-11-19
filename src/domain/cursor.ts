import { Effect, Result, Schema } from "effect"
import { Base64Url } from "effect/encoding"

import { InvalidCursorError } from "./errors"
import type { PublicPostCursor } from "./model"

const encodedCursorSchema = Schema.Struct({
  publishedAt: Schema.Finite,
  id: Schema.String,
})

export function encodePublicPostCursor(cursor: PublicPostCursor) {
  return Base64Url.encode(
    JSON.stringify({ publishedAt: cursor.publishedAt.getTime(), id: cursor.id }),
  )
}

export function decodePublicPostCursor(value: string) {
  return Effect.try({
    try: () => Result.getOrThrow(Base64Url.decodeString(value)),
    catch: () => InvalidCursorError.make({ reason: "The cursor is not valid base64 JSON." }),
  }).pipe(
    Effect.flatMap((json) =>
      Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(json).pipe(
        Effect.mapError(() =>
          InvalidCursorError.make({ reason: "The cursor is not valid base64 JSON." }),
        ),
      ),
    ),
    Effect.flatMap(
      Schema.decodeUnknownEffect(encodedCursorSchema, {
        onExcessProperty: "error",
      }),
    ),
    Effect.mapBoth({
      onSuccess: ({ id, publishedAt }) => ({ id, publishedAt: new Date(publishedAt) }),
      onFailure: (error) =>
        error instanceof InvalidCursorError
          ? error
          : InvalidCursorError.make({ reason: "The cursor has an invalid shape." }),
    }),
  )
}
