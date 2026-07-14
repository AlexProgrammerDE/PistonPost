import { Avatar, AvatarFallback, AvatarImage } from "@pistonpost/ui/components/avatar"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { FilteredFeed } from "@/components/filtered-feed"
import { feedQueryOptions, profileQueryOptions } from "@/lib/queries/posts"

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
  head: ({ loaderData, params }) => ({
    meta: [
      { title: `${loaderData?.name ?? params.username} · PistonPost` },
      { name: "description", content: loaderData?.bio ?? `Public posts from @${params.username}.` },
    ],
    links: [{ rel: "canonical", href: `/user/${params.username}` }],
  }),
  component: ProfileFeed,
})

function ProfileFeed() {
  const { username } = Route.useParams()
  const normalizedUsername = username.toLocaleLowerCase("en-US")
  const profile = useSuspenseQuery(profileQueryOptions(normalizedUsername)).data
  if (!profile) return null
  const website = safeWebsite(profile.website)

  return (
    <main className="mx-auto w-full max-w-[94rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <header className="mb-12 grid gap-6 border-b pb-8 sm:grid-cols-[auto_1fr] sm:items-end">
        <Avatar className="size-24 sm:size-32">
          {profile.image && <AvatarImage src={profile.image} alt="" />}
          <AvatarFallback className="font-heading text-2xl">
            {profile.name.slice(0, 2).toLocaleUpperCase("en-US")}
          </AvatarFallback>
        </Avatar>
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            @{profile.username}
          </p>
          <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight sm:text-6xl">
            {profile.name}
          </h1>
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
        emptyMessage={`${profile.name} has not published a public post yet.`}
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
