import { Effect, Schema } from "effect"

import { parseMarkdownEmbed } from "@/lib/markdown-embeds"

const TUMBLR_OEMBED_ENDPOINT = "https://www.tumblr.com/oembed/1.0"
const MAX_OEMBED_RESPONSE_LENGTH = 32_768
const tumblrOEmbedSchema = Schema.Struct({ html: Schema.String })

export class TumblrEmbedError extends Schema.TaggedError<TumblrEmbedError>()("TumblrEmbedError", {
  operation: Schema.Literal("request", "response", "validate"),
  status: Schema.NullOr(Schema.Number),
}) {}

type TumblrEmbedInput = {
  readonly url: string
  readonly fetch?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
}

function validatedEmbedHref(html: string, postId: string) {
  const match = /\bdata-href=(?:"([^"]+)"|'([^']+)')/u.exec(html)
  const value = match?.[1] ?? match?.[2]
  if (!value || !URL.canParse(value)) return null

  const url = new URL(value)
  const segments = url.pathname.split("/").filter(Boolean)
  if (
    url.protocol !== "https:" ||
    url.hostname !== "embed.tumblr.com" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    segments[0] !== "embed" ||
    segments[1] !== "post" ||
    !segments[2] ||
    !/^[A-Za-z0-9:_-]+$/u.test(segments[2]) ||
    segments[3] !== postId ||
    !segments[4] ||
    !/^v\d+$/u.test(segments[4]) ||
    segments.length !== 5
  ) {
    return null
  }
  return url.toString()
}

export const resolveTumblrEmbedHref = Effect.fn("resolveTumblrEmbedHref")(function* (
  input: TumblrEmbedInput,
) {
  const embed = parseMarkdownEmbed(input.url)
  if (!embed || embed.provider !== "tumblr") {
    return yield* new TumblrEmbedError({ operation: "validate", status: null })
  }

  const endpoint = new URL(TUMBLR_OEMBED_ENDPOINT)
  endpoint.searchParams.set("url", embed.url)
  const response = yield* Effect.tryPromise({
    try: () =>
      (input.fetch ?? globalThis.fetch)(endpoint, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      }),
    catch: () => new TumblrEmbedError({ operation: "request", status: null }),
  })
  if (!response.ok) {
    return yield* new TumblrEmbedError({ operation: "request", status: response.status })
  }

  const responseText = yield* Effect.tryPromise({
    try: () => response.text(),
    catch: () => new TumblrEmbedError({ operation: "response", status: response.status }),
  })
  if (responseText.length > MAX_OEMBED_RESPONSE_LENGTH) {
    return yield* new TumblrEmbedError({ operation: "response", status: response.status })
  }

  const unknownBody = yield* Effect.try({
    try: () => JSON.parse(responseText),
    catch: () => new TumblrEmbedError({ operation: "response", status: response.status }),
  })
  const body = yield* Schema.decodeUnknown(tumblrOEmbedSchema)(unknownBody).pipe(
    Effect.mapError(() => new TumblrEmbedError({ operation: "response", status: response.status })),
  )
  const href = validatedEmbedHref(body.html, embed.postId)
  if (!href) {
    return yield* new TumblrEmbedError({ operation: "validate", status: response.status })
  }
  return href
})
