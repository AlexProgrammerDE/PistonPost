import type { PublicPostRead } from "@pistonpost/db/public-read-model"
import { AspectRatio } from "@pistonpost/ui/components/aspect-ratio"
import { Avatar, AvatarFallback, AvatarImage } from "@pistonpost/ui/components/avatar"
import { Badge } from "@pistonpost/ui/components/badge"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@pistonpost/ui/components/carousel"
import { Separator } from "@pistonpost/ui/components/separator"
import { cn } from "@pistonpost/ui/lib/utils"
import { Link } from "@tanstack/react-router"

import { Heart, ThumbsDown, ThumbsUp, TriangleAlert } from "@/components/icons"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date)
}

function PostMedia({ post, detail }: { readonly post: PublicPostRead; readonly detail: boolean }) {
  if (post.media.length === 0) {
    if (post.type === "text") return null
    return (
      <div className="grid aspect-[16/9] place-items-center border bg-muted/40 text-muted-foreground">
        <div className="flex max-w-xs flex-col items-center gap-2 px-6 text-center">
          <TriangleAlert />
          <p className="text-sm font-medium">This post has missing or unavailable media.</p>
        </div>
      </div>
    )
  }

  if (post.type === "video") {
    const video = post.media[0]
    if (!video) return null
    return (
      <AspectRatio ratio={16 / 9} className="overflow-hidden bg-black">
        <iframe
          src={`/media/video/${video.id}/player`}
          title={`Video: ${post.title}`}
          className="size-full border-0"
          sandbox="allow-scripts allow-presentation"
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading={detail ? "eager" : "lazy"}
        />
      </AspectRatio>
    )
  }

  const variant = detail ? "detail" : "feed"
  if (post.media.length === 1) {
    const image = post.media[0]
    if (!image) return null
    return (
      <img
        src={`/media/image/${image.id}/${variant}`}
        alt={image.altText ?? post.title}
        className={cn("w-full bg-muted object-cover", detail ? "max-h-[80svh]" : "max-h-[46rem]")}
        loading={detail ? "eager" : "lazy"}
      />
    )
  }

  return (
    <Carousel
      opts={{ loop: false }}
      className="group/media"
      aria-label={`${post.title} image gallery, post ${post.id}`}
    >
      <CarouselContent>
        {post.media.map((image) => (
          <CarouselItem key={image.id}>
            <img
              src={`/media/image/${image.id}/${variant}`}
              alt={image.altText ?? post.title}
              className="aspect-[4/3] w-full bg-muted object-cover"
              loading={detail ? "eager" : "lazy"}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-3 opacity-0 transition-opacity group-hover/media:opacity-100 focus-visible:opacity-100" />
      <CarouselNext className="right-3 opacity-0 transition-opacity group-hover/media:opacity-100 focus-visible:opacity-100" />
    </Carousel>
  )
}

export function PostView({
  post,
  detail = false,
}: {
  readonly post: PublicPostRead
  readonly detail?: boolean
}) {
  const initials = post.author.name.slice(0, 2).toLocaleUpperCase("en-US")

  return (
    <article className={cn("min-w-0", detail ? "mx-auto max-w-5xl" : "border-b pb-12")}>
      <header className="mb-5 flex items-center gap-3">
        <Link to="/user/$username" params={{ username: post.author.username }}>
          <Avatar size="lg">
            {post.author.image && <AvatarImage src={post.author.image} alt="" />}
            <AvatarFallback className="text-foreground">{initials}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to="/user/$username"
            params={{ username: post.author.username }}
            className="block truncate text-sm font-semibold hover:underline"
          >
            {post.author.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            @{post.author.username} ·{" "}
            <time dateTime={post.publishedAt.toISOString()}>{formatDate(post.publishedAt)}</time>
          </p>
        </div>
        {post.visibility === "unlisted" && <Badge variant="outline">Unlisted</Badge>}
      </header>

      <div className="mb-5 flex flex-col gap-4">
        {detail ? (
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            {post.title}
          </h1>
        ) : (
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            <Link to="/post/$postId" params={{ postId: post.id }} className="hover:underline">
              {post.title}
            </Link>
          </h2>
        )}
        {post.textContent && (
          <div className={cn("typeset whitespace-pre-wrap", detail && "typeset-post max-w-3xl")}>
            <p>{post.textContent}</p>
          </div>
        )}
      </div>

      <PostMedia post={post} detail={detail} />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {post.tags.map((tag) => (
          <Badge
            key={tag.slug}
            variant="secondary"
            render={<Link to="/tag/$tag" params={{ tag: tag.slug }} />}
          >
            #{tag.name}
          </Badge>
        ))}
        <div
          className="ml-auto flex items-center gap-3 text-xs text-muted-foreground"
          aria-label="Reaction totals"
        >
          <span className="inline-flex items-center gap-1">
            <ThumbsUp />
            {post.reactions.like}
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsDown />
            {post.reactions.dislike}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart />
            {post.reactions.heart}
          </span>
        </div>
      </div>
      {detail && <Separator className="mt-10" />}
    </article>
  )
}
