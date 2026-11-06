import { createServerFn } from "@tanstack/react-start"
import { Effect, Schema } from "effect"

import { serverFunctionValidator } from "@/lib/server-function-error"
import { resolveTumblrEmbedHref } from "@/server/tumblr-embed"

export const getTumblrEmbed = createServerFn({ method: "GET" })
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        url: Schema.Trim.check(
          Schema.makeFilter((value) => URL.canParse(value) || "Invalid URL"),
        ).check(Schema.isMaxLength(2_048)),
      }),
    ),
  )
  .handler(({ data }) =>
    Effect.runPromise(
      resolveTumblrEmbedHref({ url: data.url }).pipe(
        Effect.match({
          onFailure: () => ({ status: "unavailable" as const }),
          onSuccess: (href) => ({ status: "ready" as const, href }),
        }),
      ),
    ),
  )
