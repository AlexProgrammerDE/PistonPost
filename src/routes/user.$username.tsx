import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { ExternalLink, MapPin } from "lucide-react"
import { lazy, Suspense } from "react"
import { z } from "zod"

import { FilteredFeed } from "@/components/filtered-feed"
import { FeedItemsSkeleton, ProfilePageSkeleton } from "@/components/LoadingStates"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { feedQueryOptions, profileQueryOptions } from "@/lib/queries/posts"
import { SITE_NAME, absoluteUrl, createSeoHead, truncateDescription } from "@/lib/seo"

const FollowButton = lazy(() =>
  import("@/components/FollowButton").then((module) => ({ default: module.FollowButton })),
)

export const Route = createFileRoute("/user/$username")({
  loader: async ({ context, params }) => {
    const username = z
      .string()
      .trim()
      .min(1)
      .max(32)
      .parse(params.username)
      .toLocaleLowerCase("en-US")
    const profilePromise = context.queryClient.ensureQueryData(profileQueryOptions(username))
    void context.queryClient.prefetchInfiniteQuery(feedQueryOptions({ username }))
    const profile = await profilePromise
    if (!profile) throw notFound()
    return profile
  },
  head: ({ loaderData, params }) => {
    const username = loaderData?.username ?? params.username
    const normalizedUsername =
      loaderData?.normalizedUsername ?? params.username.toLocaleLowerCase("en-US")
    const name = loaderData?.name ?? username
    const description = truncateDescription(
      loaderData?.bio ?? `Public posts from @${username} on PistonPost.`,
    )
    const path = `/user/${encodeURIComponent(normalizedUsername)}`
    const profileUrl = absoluteUrl(path)
    const website = safeWebsite(loaderData?.website ?? null)
    return createSeoHead({
      title: `${name} (@${username}) · ${SITE_NAME}`,
      description,
      path,
      type: "profile",
      image: loaderData?.image
        ? { url: loaderData.image, alt: `${name}'s profile picture` }
        : undefined,
      twitterCard: "summary",
      profileUsername: username,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "@id": profileUrl,
        url: profileUrl,
        name: `${name} (@${username})`,
        description,
        dateCreated: loaderData?.createdAt.toISOString(),
        dateModified: loaderData?.updatedAt.toISOString(),
        mainEntity: {
          "@type": "Person",
          "@id": `${profileUrl}#person`,
          name,
          alternateName: `@${username}`,
          url: profileUrl,
          image: loaderData?.image ? absoluteUrl(loaderData.image) : undefined,
          sameAs: website ? [website] : undefined,
        },
      },
    })
  },
  component: ProfileFeed,
  pendingComponent: ProfilePageSkeleton,
})

function ProfileFeed() {
  const { username } = Route.useParams()
  const normalizedUsername = username.toLocaleLowerCase("en-US")
  const profile = useSuspenseQuery(profileQueryOptions(normalizedUsername)).data
  if (!profile) return null
  const website = safeWebsite(profile.website)

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-10 grid gap-5 border-b pb-7 sm:grid-cols-[auto_1fr] sm:items-center">
        <Avatar className="size-20 sm:size-24">
          {profile.image && (
            <ResponsiveAvatarImage
              src={profile.image}
              sizes="(min-width: 640px) 6rem, 5rem"
              alt=""
            />
          )}
          <AvatarFallback className="font-heading text-2xl">
            {profile.name.slice(0, 2).toLocaleUpperCase("en-US")}
          </AvatarFallback>
        </Avatar>
        <div className="max-w-2xl sm:flex sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {profile.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">@{profile.username}</p>
            {profile.bio && (
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                {profile.bio}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {profile.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden="true" className="size-4" />
                  {profile.location}
                </span>
              )}
              {website && (
                <a
                  href={website}
                  rel="me noreferrer"
                  className="inline-flex items-center gap-1.5 underline underline-offset-4"
                >
                  <ExternalLink aria-hidden="true" className="size-4" />
                  Website
                </a>
              )}
            </div>
          </div>
          <Suspense fallback={<Skeleton className="mt-4 h-9 w-20 sm:mt-1" />}>
            <FollowButton
              target={{ kind: "user", username: profile.normalizedUsername }}
              className="mt-4 sm:mt-1"
            />
          </Suspense>
        </div>
      </header>
      <Suspense fallback={<FeedItemsSkeleton />}>
        <FilteredFeed
          filters={{ username: normalizedUsername }}
          emptyMessage={`${profile.name} has not posted anything here yet.`}
        />
      </Suspense>
    </main>
  )
}

function safeWebsite(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}
