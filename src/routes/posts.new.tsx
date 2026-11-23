import { createFileRoute } from "@tanstack/react-router"
import { Schema, Effect, Option } from "effect"

import { FormPageSkeleton } from "@/components/LoadingStates"
import { PostComposer } from "@/components/post-composer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { readingPageClassName } from "@/lib/page-layout"
import { getComposerViewer } from "@/server/composer-viewer"
import { getPublicRuntimeConfig } from "@/server/public-config"

export const Route = createFileRoute("/posts/new")({
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({
      shareId: Schema.optional(Schema.String.check(Schema.isUUID())).pipe(
        Schema.catchDecoding(() => Effect.sync(() => Option.some(undefined))),
      ),
      shareError: Schema.optional(Schema.Literal("unavailable")).pipe(
        Schema.catchDecoding(() => Effect.sync(() => Option.some(undefined))),
      ),
    }),
    { parseOptions: { errors: "all" } },
  ),
  loader: async () => {
    const [viewer, config] = await Promise.all([getComposerViewer(), getPublicRuntimeConfig()])
    return { viewer, turnstileSiteKey: config.turnstileSiteKey }
  },
  head: () => ({
    meta: [{ title: "New post · PistonPost" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: NewPost,
  pendingComponent: FormPageSkeleton,
})

function NewPost() {
  const { viewer, turnstileSiteKey } = Route.useLoaderData()
  const { shareId, shareError } = Route.useSearch()
  return (
    <main className={readingPageClassName}>
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Make a post</h1>
        <p className="mt-1 text-sm/6 text-muted-foreground">
          Words, a pile of pictures, or a video. Look it over, then post it.
        </p>
      </header>
      {shareError && (
        <Alert className="mb-6">
          <AlertTitle>The share could not be opened</AlertTitle>
          <AlertDescription>
            Share text, links, or up to 20 images, no larger than 15 MB each and 50 MB in total.
            Local storage must be available. Open earlier shares or choose the files below.
          </AlertDescription>
        </Alert>
      )}
      <PostComposer
        key={viewer?.id ?? "anonymous"}
        userId={viewer?.id ?? null}
        shareId={shareId}
        turnstileSiteKey={turnstileSiteKey}
      />
    </main>
  )
}
