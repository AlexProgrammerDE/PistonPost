import { createFileRoute } from "@tanstack/react-router"
import { Suspense } from "react"
import { z } from "zod"

import { FilteredFeed } from "@/components/filtered-feed"
import { FeedItemsSkeleton, FeedPageSkeleton } from "@/components/LoadingStates"
import { feedQueryOptions } from "@/lib/queries/posts"
import { absoluteUrl, createSeoHead } from "@/lib/seo"

export const Route = createFileRoute("/tag/$tag")({
  loader: ({ context, params }) => {
    const tag = z.string().trim().min(1).max(64).parse(params.tag).toLocaleLowerCase("en-US")
    void context.queryClient.prefetchInfiniteQuery(feedQueryOptions({ tag }))
  },
  head: ({ params }) => {
    const path = `/tag/${encodeURIComponent(params.tag.toLocaleLowerCase("en-US"))}`
    const description = `Latest PistonPost posts tagged #${params.tag}.`
    return createSeoHead({
      title: `#${params.tag} · PistonPost`,
      description,
      path,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": absoluteUrl(path),
        url: absoluteUrl(path),
        name: `#${params.tag}`,
        description,
      },
    })
  },
  component: TagFeed,
  pendingComponent: FeedPageSkeleton,
})

function TagFeed() {
  const { tag } = Route.useParams()
  const normalizedTag = tag.toLocaleLowerCase("en-US")
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 border-b pb-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight">#{tag}</h1>
      </header>
      <Suspense fallback={<FeedItemsSkeleton />}>
        <FilteredFeed
          filters={{ tag: normalizedTag }}
          emptyMessage={`No public posts use #${tag}.`}
        />
      </Suspense>
    </main>
  )
}
