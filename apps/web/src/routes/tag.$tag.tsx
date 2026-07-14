import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { FilteredFeed } from "@/components/filtered-feed"
import { feedQueryOptions } from "@/lib/queries/posts"

export const Route = createFileRoute("/tag/$tag")({
  loader: ({ context, params }) => {
    const tag = z.string().trim().min(1).max(64).parse(params.tag).toLocaleLowerCase("en-US")
    return context.queryClient.ensureInfiniteQueryData(feedQueryOptions({ tag }))
  },
  head: ({ params }) => ({
    meta: [
      { title: `#${params.tag} · PistonPost` },
      {
        name: "description",
        content: `Recent public PistonPost transmissions tagged ${params.tag}.`,
      },
    ],
    links: [{ rel: "canonical", href: `/tag/${params.tag}` }],
  }),
  component: TagFeed,
})

function TagFeed() {
  const { tag } = Route.useParams()
  const normalizedTag = tag.toLocaleLowerCase("en-US")
  return (
    <main className="mx-auto w-full max-w-[94rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <header className="mb-10 border-b pb-6">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          Tag archive
        </p>
        <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight sm:text-6xl">
          #{tag}
        </h1>
      </header>
      <FilteredFeed
        filters={{ tag: normalizedTag }}
        emptyMessage={`No public posts use #${tag}.`}
      />
    </main>
  )
}
