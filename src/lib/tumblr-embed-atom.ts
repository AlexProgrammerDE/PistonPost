import * as Effect from "effect/Effect"
import { Atom } from "effect/reactivity"

import { getTumblrEmbed } from "@/server/external-embeds"

export type TumblrEmbedResult =
  | { readonly status: "ready"; readonly href: string }
  | { readonly status: "unavailable" }

/**
 * Resolves one Tumblr post URL to its embed address. The request starts when an embed mounts the
 * atom and is interrupted when the last reader unmounts. Server rendering keeps the loading state.
 */
export const tumblrEmbedAtom = Atom.family((url: string) =>
  Atom.make(
    // A failed lookup falls back to a plain link.
    Effect.promise((): Promise<TumblrEmbedResult> =>
      getTumblrEmbed({ data: { url } }).then(
        (result) =>
          result.status === "ready"
            ? { status: "ready", href: result.href }
            : { status: "unavailable" },
        () => ({ status: "unavailable" }),
      ),
    ),
  ).pipe(Atom.withServerValueInitial),
)
