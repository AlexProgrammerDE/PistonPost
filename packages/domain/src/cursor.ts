import { Effect, Schema } from "effect"

import { InvalidCursorError } from "./errors"
import type { PublicPostCursor } from "./model"

const encodedCursorSchema = Schema.Struct({
  publishedAt: Schema.Number,
  id: Schema.String,
})

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodePublicPostCursor(cursor: PublicPostCursor) {
  return encodeBase64Url(
    JSON.stringify({ publishedAt: cursor.publishedAt.getTime(), id: cursor.id }),
  )
}

export function decodePublicPostCursor(value: string) {
  return Effect.try({
    try: () => JSON.parse(decodeBase64Url(value)) as unknown,
    catch: () => InvalidCursorError.make({ reason: "The cursor is not valid base64 JSON." }),
  }).pipe(
    Effect.flatMap(
      Schema.decodeUnknown(encodedCursorSchema, {
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
