import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { FilteredFeed } from "@/components/filtered-feed"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { feedQueryOptions, profileQueryOptions } from "@/lib/queries/posts"
import { SITE_NAME, absoluteUrl, createSeoHead, truncateDescription } from "@/lib/seo"

export const Route = createFileRoute("/user/$username")({
  loader: async ({ context, params }) => {
    const username = z
      .string()
      .trim()
      .min(1)
      .max(32)
      .parse(params.username)
      .toLocaleLowerCase("en-US")
    const profile = await context.queryClient.ensureQueryData(profileQueryOptions(username))
    if (!profile) throw notFound()
    await context.queryClient.ensureInfiniteQueryData(feedQueryOptions({ username }))
    return profile
  },
  head: ({ loaderData, params }) => {
    const username = loaderData?.username ?? params.username
    const name = loaderData?.name ?? username
    const description = truncateDescription(
      loaderData?.bio ?? `Public posts from @${username} on PistonPost.`,
    )
    const path = `/user/${encodeURIComponent(username)}`
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
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "@id": profileUrl,
        url: profileUrl,
        name: `${name} (@${username})`,
        description,
        mainEntity: {
          "@type": "Person",
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
          {profile.image && <AvatarImage src={profile.image} alt="" />}
          <AvatarFallback className="font-heading text-2xl">
            {profile.name.slice(0, 2).toLocaleUpperCase("en-US")}
          </AvatarFallback>
        </Avatar>
        <div className="max-w-2xl">
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
            {profile.location && <span>{profile.location}</span>}
            {website && (
              <a href={website} rel="me noreferrer" className="underline underline-offset-4">
                Website
              </a>
            )}
          </div>
        </div>
      </header>
      <FilteredFeed
        filters={{ username: normalizedUsername }}
        emptyMessage={`${profile.name} has not posted anything here yet.`}
      />
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
