import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"

import { resolveTumblrEmbedHref } from "@/server/tumblr-embed"

export const getTumblrEmbed = createServerFn({ method: "GET" })
  .validator(z.object({ url: z.string().trim().url().max(2_048) }))
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
