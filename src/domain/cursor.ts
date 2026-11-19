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
    try: () => JSON.parse(Result.getOrThrow(Base64Url.decodeString(value))) as unknown,
    catch: () => InvalidCursorError.make({ reason: "The cursor is not valid base64 JSON." }),
  }).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(encodedCursorSchema, {
        onExcessProperty: "error",
      }),
    ),
    Effect.map(({ id, publishedAt }) => ({ id, publishedAt: new Date(publishedAt) })),
    Effect.mapError((error) =>
      error instanceof InvalidCursorError
        ? error
        : InvalidCursorError.make({ reason: "The cursor has an invalid shape." }),
    ),
  )
}
