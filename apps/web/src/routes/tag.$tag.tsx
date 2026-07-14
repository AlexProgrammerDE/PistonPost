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
        content: `Latest PistonPost posts tagged ${params.tag}.`,
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
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 border-b pb-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight">#{tag}</h1>
      </header>
      <FilteredFeed
        filters={{ tag: normalizedTag }}
        emptyMessage={`No public posts use #${tag}.`}
      />
    </main>
  )
}
