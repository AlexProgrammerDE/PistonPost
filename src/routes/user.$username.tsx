import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { Schema, Effect, Option } from "effect"
import { ExternalLink, MapPin } from "lucide-react"
import { lazy, Suspense } from "react"

import { ContentReportDialog } from "@/components/ContentReportDialog"
import { FeedLoadError } from "@/components/FeedLoadError"
import { FilteredFeed } from "@/components/filtered-feed"
import { FeedItemsSkeleton, ProfilePageSkeleton } from "@/components/LoadingStates"
import { OwnedUnlistedPosts } from "@/components/OwnedUnlistedPosts"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ButtonGroup } from "@/components/ui/button-group"
import { Skeleton } from "@/components/ui/skeleton"
import { UserGeneratedLink, UserGeneratedLinkProvider } from "@/components/UserGeneratedLink"
import { avatarInitials } from "@/lib/avatar-initials"
import { feedPageHref } from "@/lib/feed-pagination"
import { AVATAR_IMAGE_SIZE } from "@/lib/media-image"
import { feedQueryOptions, profileQueryOptions } from "@/lib/queries/posts"
import {
  SITE_NAME,
  absoluteUrl,
  createSeoHead,
  socialImagePath,
  truncateDescription,
} from "@/lib/seo"
import { safeUserGeneratedUrl } from "@/lib/user-generated-link"
import { activeSharedViewTransitionKind } from "@/lib/view-transitions"

const FollowButton = lazy(() =>
  import("@/components/FollowButton").then((module) => ({ default: module.FollowButton })),
)

const decodeUsernameParam = Schema.decodeUnknownOption(
  Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(32)),
)

/** Returns the lookup key for a profile URL segment, or null when no profile can match it. */
function normalizeProfileUsername(value: string) {
  return Option.match(decodeUsernameParam(value), {
    onNone: () => null,
    onSome: (username) => username.toLocaleLowerCase("en-US"),
  })
}

const feedSearchSchema = Schema.Struct({
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(512))).pipe(
    Schema.catchDecoding(() => Effect.sync(() => Option.some(undefined))),
  ),
})

export const Route = createFileRoute("/user/$username")({
  validateSearch: Schema.toStandardSchemaV1(feedSearchSchema, { parseOptions: { errors: "all" } }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: async ({ context, params, deps }) => {
    const username = normalizeProfileUsername(params.username)
    if (!username) throw notFound()
    // oxlint-disable-next-line typescript/no-deprecated -- RouterQueryClient overrides ensureQueryData to stop loader retries; query() would skip that policy.
    const profilePromise = context.queryClient.ensureQueryData(profileQueryOptions(username))
    void context.queryClient
      .infiniteQuery(feedQueryOptions({ username }, deps.cursor))
      .catch(() => undefined)
    const profile = await profilePromise
    if (!profile) throw notFound()
    return profile
  },
  head: ({ loaderData, params, match }) => {
    const username = loaderData?.username ?? params.username
    const normalizedUsername =
      loaderData?.normalizedUsername ?? params.username.toLocaleLowerCase("en-US")
    const name = loaderData?.name ?? username
    const description = truncateDescription(
      loaderData?.bio ?? `Public posts from @${username} on PistonPost.`,
    )
    const pagePath = `/user/${encodeURIComponent(normalizedUsername)}`
    const path = feedPageHref(pagePath, match.search.cursor)
    const profileUrl = absoluteUrl(path)
    const profileIdentityUrl = absoluteUrl(pagePath)
    const website = safeWebsite(loaderData?.website ?? null)
    return createSeoHead({
      discord: loaderData
        ? {
            title: `${name} (@${username})`,
            description,
            url: profileIdentityUrl,
            label: "View profile",
            thumbnail: loaderData.image
              ? absoluteUrl(socialImagePath(loaderData.image))
              : undefined,
          }
        : false,
      title: `${name} (@${username}) · ${SITE_NAME}`,
      description,
      path,
      type: "profile",
      image: loaderData?.image
        ? {
            url: loaderData.image,
            alt: `${name}'s profile picture`,
            type: "image/webp",
            width: AVATAR_IMAGE_SIZE,
            height: AVATAR_IMAGE_SIZE,
          }
        : undefined,
      twitterCard: "summary",
      indexing: !loaderData?.searchIndexable
        ? "noindex"
        : match.search.cursor
          ? "noindex-follow"
          : "index",
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
        hasPart: loaderData?.recentPosts.map((post) => ({
          "@type": "SocialMediaPosting",
          "@id": absoluteUrl(`/post/${encodeURIComponent(post.id)}`),
          url: absoluteUrl(`/post/${encodeURIComponent(post.id)}`),
          headline: post.title,
          datePublished: post.publishedAt.toISOString(),
          author: { "@id": `${profileIdentityUrl}#person` },
        })),
        mainEntity: {
          "@type": "Person",
          "@id": `${profileIdentityUrl}#person`,
          name,
          alternateName: `@${username}`,
          url: profileIdentityUrl,
          image: loaderData?.image ? absoluteUrl(socialImagePath(loaderData.image)) : undefined,
          sameAs: website ? [website] : undefined,
          interactionStatistic: [
            {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/FollowAction",
              userInteractionCount: loaderData?.followerCount ?? 0,
            },
          ],
          agentInteractionStatistic: {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/WriteAction",
            userInteractionCount: loaderData?.postCount ?? 0,
          },
        },
      },
    })
  },
  component: ProfileFeed,
  pendingComponent: ProfilePageSkeleton,
  errorComponent: ProfileFeedError,
})

function ProfileFeed() {
  const { username } = Route.useParams()
  const normalizedUsername = normalizeProfileUsername(username)
  // The loader rejects invalid names, so this only guards a direct render.
  if (!normalizedUsername) throw notFound()
  return <ProfileFeedContent normalizedUsername={normalizedUsername} />
}

function ProfileFeedContent({ normalizedUsername }: { readonly normalizedUsername: string }) {
  const { cursor } = Route.useSearch()
  const profile = useSuspenseQuery(profileQueryOptions(normalizedUsername)).data
  // A refetch can find the profile gone after the loader saw it, for example after a ban.
  if (!profile) throw notFound()
  const website = safeWebsite(profile.website)
  const activeTransition = activeSharedViewTransitionKind({
    kind: "profile",
    username: profile.normalizedUsername,
  })

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header
        data-view-transition-active={activeTransition}
        className="mb-10 grid min-w-0 gap-5 border-b pb-7 wrap-anywhere sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"
      >
        <Avatar data-view-transition-part="profile-avatar" className="size-20 sm:size-24">
          {profile.image && (
            <ResponsiveAvatarImage
              src={profile.image}
              sizes="(min-width: 640px) 6rem, 5rem"
              alt=""
            />
          )}
          <AvatarFallback className="font-heading text-2xl">
            {avatarInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <div className="max-w-2xl min-w-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1
              dir="auto"
              data-view-transition-part="profile-name"
              className="overflow-hidden font-heading text-3xl font-bold tracking-tight sm:text-4xl"
            >
              {profile.name}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">@{profile.username}</p>
            {profile.bio && (
              <p
                dir="auto"
                className="mt-4 max-w-xl overflow-hidden text-base/relaxed whitespace-pre-line text-muted-foreground"
              >
                {profile.bio}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {profile.location && (
                <span
                  dir="auto"
                  className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden"
                >
                  <MapPin aria-hidden="true" className="size-4" />
                  {profile.location}
                </span>
              )}
              {website && (
                <UserGeneratedLinkProvider>
                  <UserGeneratedLink
                    href={website}
                    relationship="me"
                    className="inline-flex items-center gap-1.5 underline underline-offset-4"
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                    Website
                  </UserGeneratedLink>
                </UserGeneratedLinkProvider>
              )}
            </div>
          </div>
          <ButtonGroup className="mt-4 sm:mt-1" aria-label="Profile actions">
            <Suspense fallback={<Skeleton className="h-9 w-20" />}>
              <FollowButton target={{ kind: "user", username: profile.normalizedUsername }} />
            </Suspense>
            <ContentReportDialog
              target={{ type: "profile", id: profile.normalizedUsername }}
              variant="outline"
            />
          </ButtonGroup>
        </div>
      </header>
      <OwnedUnlistedPosts username={profile.normalizedUsername} />
      <Suspense fallback={<FeedItemsSkeleton />}>
        <FilteredFeed
          filters={{ username: normalizedUsername }}
          emptyMessage={`${profile.name} has not posted anything here yet.`}
          initialCursor={cursor}
          pagePath={`/user/${encodeURIComponent(normalizedUsername)}`}
        />
      </Suspense>
    </main>
  )
}

function safeWebsite(value: string | null) {
  if (!value) return null
  try {
    const safeUrl = safeUserGeneratedUrl(value)
    if (!safeUrl) return null
    const url = new URL(safeUrl)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

/** Keeps the profile name on screen and offers the newest posts when an older page fails. */
function ProfileFeedError() {
  const { username } = Route.useParams()
  const { cursor } = Route.useSearch()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 border-b pb-4">
        <h1 className="min-w-0 font-heading text-3xl font-bold tracking-tight wrap-anywhere">
          @{username}
        </h1>
      </header>
      <FeedLoadError
        latestLink={cursor ? <Link to="/user/$username" params={{ username }} /> : undefined}
      />
    </main>
  )
}
