import { Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  GalleryHorizontal,
  Images,
  LayoutGrid,
  Link2,
  MessageCircle,
  TriangleAlert,
} from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent } from "react"

import { DateTime } from "@/components/DateTime"
import { LightboxLoadingFallback } from "@/components/LoadingStates"
import { MarkdownContent } from "@/components/MarkdownContent"
import { PostTextPreview } from "@/components/PostTextPreview"
import { ResponsiveAvatarImage } from "@/components/ResponsiveAvatarImage"
import { ResponsiveMediaImage } from "@/components/ResponsiveMediaImage"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PublicPostRead } from "@/db/public-read-model"
import { isGalleryLayout, resolveGalleryLayout, type GalleryLayout } from "@/lib/gallery-layout"
import { GALLERY_THUMBNAIL_WIDTHS } from "@/lib/media-image"
import { cn } from "@/lib/utils"
import { VIDEO_PLAYER_CACHE_VERSION } from "@/lib/video-thumbnail"
import {
  activateSharedViewTransition,
  activeSharedViewTransitionKind,
} from "@/lib/view-transitions"

const loadImageLightbox = () =>
  import("@/components/ImageLightbox").then((module) => ({ default: module.ImageLightbox }))

const ImageLightbox = lazy(loadImageLightbox)

function preloadImageLightbox() {
  void loadImageLightbox()
}

const feedImageSizes = "(max-width: 639px) calc(100vw - 2rem), 45rem"
const feedPreviewImageSizes = "(max-width: 639px) calc((100vw - 2.25rem) / 2), 22.375rem"
const detailImageSizes = "(max-width: 639px) calc(100vw - 2rem), 61rem"
const masonryImageSizes =
  "(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc((100vw - 3.5rem) / 2), 20rem"
const galleryThumbnailSizes = "(min-width: 640px) 6rem, 5rem"
const compactNumberFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const exactNumberFormat = new Intl.NumberFormat("en")

function PostViewCount({ count }: { readonly count: number }) {
  const exactCount = exactNumberFormat.format(count)
  const noun = count === 1 ? "view" : "views"

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`${exactCount} ${noun}`}
    >
      <Eye aria-hidden="true" className="size-3.5" />
      {compactNumberFormat.format(count)} {noun}
    </span>
  )
}

function PostImageCount({ count }: { readonly count: number }) {
  const noun = count === 1 ? "image" : "images"

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Images aria-hidden="true" className="size-3.5" />
      {exactNumberFormat.format(count)} {noun}
    </span>
  )
}

function PostCommentCount({
  postId,
  count,
  onOpen,
}: {
  readonly postId: string
  readonly count: number
  readonly onOpen: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const noun = count === 1 ? "comment" : "comments"

  return (
    <Link
      to="/post/$postId"
      params={{ postId }}
      hash="discussion"
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      <MessageCircle aria-hidden="true" className="size-3.5" />
      {exactNumberFormat.format(count)} {noun}
    </Link>
  )
}

function GalleryLayoutMenu({
  postId,
  layout,
  selectedImageIndex,
}: {
  readonly postId: string
  readonly layout: GalleryLayout
  readonly selectedImageIndex: number | undefined
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function selectLayout(value: string) {
    setMenuOpen(false)
    if (!isGalleryLayout(value) || value === layout) return

    void navigate({
      to: "/post/$postId",
      params: { postId },
      search:
        value === "browser"
          ? { image: selectedImageIndex ?? 0, layout: value }
          : selectedImageIndex === undefined
            ? { layout: value }
            : { image: selectedImageIndex, layout: value },
    })
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <LayoutGrid aria-hidden="true" data-icon="inline-start" />
        Gallery options
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Layout</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={layout} onValueChange={selectLayout}>
            <DropdownMenuRadioItem value="masonry">
              <LayoutGrid aria-hidden="true" />
              Masonry
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="browser">
              <GalleryHorizontal aria-hidden="true" />
              Image browser
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PostDetailMetadata({
  post,
  galleryLayout,
  selectedImageIndex,
  onOpenPost,
  onOpenTag,
}: {
  readonly post: PublicPostRead
  readonly galleryLayout: GalleryLayout
  readonly selectedImageIndex: number | undefined
  readonly onOpenPost: (event: MouseEvent<HTMLAnchorElement>) => void
  readonly onOpenTag: (event: MouseEvent<HTMLAnchorElement>, tag: string) => void
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-y py-3">
      {post.tags.map((tag) => (
        <Badge
          key={tag.slug}
          variant="secondary"
          render={
            <Link
              to="/tag/$tag"
              params={{ tag: tag.slug }}
              data-view-transition-active={activeSharedViewTransitionKind({
                kind: "tag",
                sourcePostId: post.id,
                tag: tag.slug,
              })}
              data-view-transition-part="tag-name"
              onClick={(event) => onOpenTag(event, tag.slug)}
            />
          }
        >
          #{tag.name}
        </Badge>
      ))}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2",
          post.tags.length > 0 ? "ml-auto justify-end" : undefined,
        )}
      >
        {post.type === "images" ? <PostImageCount count={post.media.length} /> : null}
        <PostViewCount count={post.viewCount} />
        <PostCommentCount postId={post.id} count={post.commentCount} onOpen={onOpenPost} />
        {post.type === "images" && post.media.length > 1 ? (
          <GalleryLayoutMenu
            postId={post.id}
            layout={galleryLayout}
            selectedImageIndex={selectedImageIndex}
          />
        ) : null}
      </div>
    </div>
  )
}

function PostMedia({
  post,
  detail,
  priority,
  selectedImageIndex,
  galleryLayout,
  onOpenPost,
}: {
  readonly post: PublicPostRead
  readonly detail: boolean
  readonly priority: boolean
  readonly selectedImageIndex: number | undefined
  readonly galleryLayout: GalleryLayout
  readonly onOpenPost: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  if (post.media.length === 0) {
    if (post.type === "text") return null
    return (
      <div className="grid aspect-[16/9] place-items-center border bg-muted/40 text-muted-foreground">
        <div className="flex max-w-xs flex-col items-center gap-2 px-6 text-center">
          <TriangleAlert aria-hidden="true" />
          <p className="text-sm font-medium">This post has missing or unavailable media.</p>
        </div>
      </div>
    )
  }

  if (post.type === "video") {
    const video = post.media[0]
    if (!video) return null
    return (
      <AspectRatio
        ratio={16 / 9}
        data-view-transition-part="post-media-1"
        className="overflow-hidden bg-black"
      >
        <iframe
          src={`/media/video/${video.id}/player?v=${VIDEO_PLAYER_CACHE_VERSION.toString()}`}
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

  return (
    <PostImageMedia
      post={post}
      detail={detail}
      priority={priority}
      selectedImageIndex={selectedImageIndex}
      galleryLayout={galleryLayout}
      onOpenPost={onOpenPost}
    />
  )
}

function PostImageMedia({
  post,
  detail,
  priority,
  selectedImageIndex,
  galleryLayout,
  onOpenPost,
}: {
  readonly post: PublicPostRead
  readonly detail: boolean
  readonly priority: boolean
  readonly selectedImageIndex: number | undefined
  readonly galleryLayout: GalleryLayout
  readonly onOpenPost: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  if (detail) {
    return (
      <DetailPostImageMedia
        post={post}
        selectedImageIndex={selectedImageIndex}
        galleryLayout={galleryLayout}
      />
    )
  }

  return <FeedPostImageMedia post={post} priority={priority} onOpenPost={onOpenPost} />
}

function FeedPostImageMedia({
  post,
  priority,
  onOpenPost,
}: {
  readonly post: PublicPostRead
  readonly priority: boolean
  readonly onOpenPost: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  if (post.media.length === 1) {
    const image = post.media[0]
    if (!image) return null

    return (
      <Link
        to="/post/$postId"
        params={{ postId: post.id }}
        data-view-transition-part="post-media-1"
        onClick={onOpenPost}
        className="block"
        aria-label={`Open ${post.title}`}
      >
        <ResponsiveMediaImage
          image={image}
          variant="feed"
          sizes={feedImageSizes}
          alt={image.altText ?? ""}
          className="max-h-[46rem] w-full bg-muted object-contain"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
        />
      </Link>
    )
  }

  const preview = post.media.slice(0, 4)
  const priorityImage = preview[0]
  const finalPreviewImage = preview.at(-1)
  const hiddenImageCount = post.media.length - preview.length

  return (
    <Link
      to="/post/$postId"
      params={{ postId: post.id }}
      onClick={onOpenPost}
      className="grid grid-cols-2 gap-1 overflow-hidden bg-muted"
      aria-label={`Open ${post.title}, ${post.media.length.toString()} images`}
    >
      {preview.map((image, index) => (
        <span
          key={image.id}
          data-view-transition-part={`post-media-${String(index + 1)}`}
          className="relative block"
        >
          <ResponsiveMediaImage
            image={image}
            variant="feed"
            sizes={feedPreviewImageSizes}
            alt={image.altText ?? ""}
            className="aspect-square w-full object-cover"
            loading={priority && image.id === priorityImage?.id ? "eager" : "lazy"}
            fetchPriority={priority && image.id === priorityImage?.id ? "high" : undefined}
          />
          {hiddenImageCount > 0 && image.id === finalPreviewImage?.id ? (
            <span className="absolute inset-0 grid place-items-center bg-foreground/70 text-2xl font-bold text-background">
              +{hiddenImageCount}
            </span>
          ) : null}
        </span>
      ))}
    </Link>
  )
}

function DetailPostImageMedia({
  post,
  selectedImageIndex,
  galleryLayout,
}: {
  readonly post: PublicPostRead
  readonly selectedImageIndex: number | undefined
  readonly galleryLayout: GalleryLayout
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  function openLightbox(index: number) {
    setLightboxIndex(index)
  }

  function closeLightbox() {
    setLightboxIndex(null)
  }

  function changeLightboxImage(index: number) {
    setLightboxIndex(index)
  }

  const lightboxViewer =
    lightboxIndex === null ? null : (
      <Suspense fallback={<LightboxLoadingFallback />}>
        <ImageLightbox
          images={post.media}
          title={post.title}
          index={lightboxIndex}
          onClose={closeLightbox}
          onIndexChange={changeLightboxImage}
        />
      </Suspense>
    )

  if (post.media.length === 1) {
    const image = post.media[0]
    if (!image) return null

    return (
      <>
        <button
          type="button"
          data-view-transition-part="post-media-1"
          className="block w-full cursor-zoom-in border-0 bg-muted p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={`Expand ${image.altText ?? post.title}`}
          onPointerEnter={preloadImageLightbox}
          onFocus={preloadImageLightbox}
          onClick={() => openLightbox(0)}
        >
          <ResponsiveMediaImage
            image={image}
            variant="detail"
            sizes={detailImageSizes}
            alt={image.altText ?? ""}
            className="max-h-[85svh] w-full object-contain"
            loading="eager"
            fetchPriority="high"
          />
        </button>
        {lightboxViewer}
      </>
    )
  }

  return (
    <div className="grid gap-3">
      {galleryLayout === "masonry" ? (
        <ul
          className="m-0 list-none columns-1 gap-2 p-0 sm:columns-2 lg:columns-3"
          aria-label={`${post.title} image collection`}
        >
          {post.media.map((image, index) => (
            <li key={image.id} className="break-inside-avoid pb-2">
              <button
                type="button"
                data-view-transition-part={
                  index < 4 ? `post-media-${String(index + 1)}` : undefined
                }
                className="block w-full cursor-zoom-in border-0 bg-muted p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`Expand image ${String(index + 1)} of ${String(post.media.length)}`}
                onPointerEnter={preloadImageLightbox}
                onFocus={preloadImageLightbox}
                onClick={() => openLightbox(index)}
              >
                <ResponsiveMediaImage
                  image={image}
                  variant="feed"
                  sizes={masonryImageSizes}
                  alt={image.altText ?? ""}
                  className="w-full object-contain"
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : undefined}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ImageBrowser
          post={post}
          selectedImageIndex={selectedImageIndex ?? 0}
          onOpen={openLightbox}
        />
      )}
      {lightboxViewer}
    </div>
  )
}

function ImageBrowser({
  post,
  selectedImageIndex,
  onOpen,
}: {
  readonly post: PublicPostRead
  readonly selectedImageIndex: number
  readonly onOpen: (index: number) => void
}) {
  const navigate = useNavigate()
  const selectedThumbnailRef = useRef<HTMLAnchorElement | null>(null)
  const selectedIndex = Math.min(Math.max(selectedImageIndex, 0), post.media.length - 1)
  const selectedImage = post.media[selectedIndex] ?? post.media[0]

  useEffect(() => {
    const selectedThumbnail = selectedThumbnailRef.current
    const thumbnailStrip = selectedThumbnail?.parentElement
    if (!selectedThumbnail || !thumbnailStrip) return

    const centeredPosition =
      selectedThumbnail.offsetLeft -
      (thumbnailStrip.clientWidth - selectedThumbnail.clientWidth) / 2
    thumbnailStrip.scrollTo({
      left: Math.max(0, centeredPosition),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    })
  }, [selectedIndex])

  if (!selectedImage) return null

  function selectImage(index: number) {
    void navigate({
      to: "/post/$postId",
      params: { postId: post.id },
      search: { image: index, layout: "browser" },
    })
  }

  return (
    <div className="grid gap-3" aria-label={`${post.title} image collection`}>
      <div className="flex items-center justify-between gap-3 border-y py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={selectedIndex === 0}
          onClick={() => selectImage(selectedIndex - 1)}
        >
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          Previous
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Image <span className="font-medium text-foreground">{selectedIndex + 1}</span> of{" "}
          {post.media.length}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={selectedIndex === post.media.length - 1}
          onClick={() => selectImage(selectedIndex + 1)}
        >
          Next
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Button>
      </div>
      <button
        type="button"
        data-view-transition-gallery="focus"
        data-view-transition-part={
          selectedIndex < 4 ? `post-media-${String(selectedIndex + 1)}` : undefined
        }
        className="block w-full cursor-zoom-in border-0 bg-muted p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Expand image ${String(selectedIndex + 1)} of ${String(post.media.length)}`}
        onPointerEnter={preloadImageLightbox}
        onFocus={preloadImageLightbox}
        onClick={() => onOpen(selectedIndex)}
      >
        <ResponsiveMediaImage
          image={selectedImage}
          variant="detail"
          sizes={detailImageSizes}
          alt={selectedImage.altText ?? ""}
          className="max-h-[85svh] w-full object-contain"
          loading="eager"
          fetchPriority="high"
        />
      </button>
      <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Choose an image">
        {post.media.map((image, index) => (
          <Link
            key={image.id}
            ref={index === selectedIndex ? selectedThumbnailRef : undefined}
            to="/post/$postId"
            params={{ postId: post.id }}
            search={{ image: index, layout: "browser" }}
            aria-label={`Show image ${String(index + 1)} of ${String(post.media.length)}`}
            aria-current={index === selectedIndex ? "true" : undefined}
            className="shrink-0 border-2 border-transparent outline-none hover:border-muted-foreground/40 focus-visible:border-ring aria-[current=true]:border-primary"
          >
            <ResponsiveMediaImage
              image={image}
              variant="feed"
              sizes={galleryThumbnailSizes}
              widths={GALLERY_THUMBNAIL_WIDTHS}
              alt=""
              className="size-20 object-cover sm:size-24"
              loading="lazy"
            />
          </Link>
        ))}
      </nav>
    </div>
  )
}

function findTransitionPost(event: MouseEvent<HTMLAnchorElement>) {
  return event.currentTarget.closest("[data-view-transition-post]")
}

export function PostView({
  post,
  detail = false,
  priority = false,
  selectedImageIndex,
  galleryLayout,
  className,
}: {
  readonly post: PublicPostRead
  readonly detail?: boolean
  readonly priority?: boolean
  readonly selectedImageIndex?: number | undefined
  readonly galleryLayout?: GalleryLayout | undefined
  readonly className?: string
}) {
  const initials = post.author.name.slice(0, 2).toLocaleUpperCase("en-US")
  const reactionCount = Object.values(post.reactions).reduce((total, count) => total + count, 0)
  const resolvedGalleryLayout = resolveGalleryLayout(galleryLayout, selectedImageIndex)
  const activePostTransition = activeSharedViewTransitionKind({
    kind: "post",
    postId: post.id,
  })
  const activeProfileTransition = activeSharedViewTransitionKind({
    kind: "profile",
    sourcePostId: post.id,
    username: post.author.username,
  })
  const activeArticleTransition = activePostTransition ?? activeProfileTransition

  function openPost(event: MouseEvent<HTMLAnchorElement>) {
    activateSharedViewTransition(
      event,
      { kind: "post", postId: post.id },
      findTransitionPost(event),
    )
  }

  function openProfile(event: MouseEvent<HTMLAnchorElement>) {
    activateSharedViewTransition(
      event,
      {
        kind: "profile",
        sourcePostId: post.id,
        username: post.author.username,
      },
      findTransitionPost(event),
    )
  }

  function openTag(event: MouseEvent<HTMLAnchorElement>, tag: string) {
    activateSharedViewTransition(event, { kind: "tag", sourcePostId: post.id, tag })
  }

  return (
    <article
      data-view-transition-post={post.id}
      data-view-transition-active={activeArticleTransition}
      className={cn(
        "min-w-0 wrap-anywhere",
        detail ? "mx-auto max-w-5xl" : "border-b pb-10",
        className,
      )}
    >
      <header className="mb-4 flex items-center gap-3">
        <Link
          to="/user/$username"
          params={{ username: post.author.username }}
          onClick={openProfile}
        >
          <Avatar size="lg" data-view-transition-part="profile-avatar">
            {post.author.image && (
              <ResponsiveAvatarImage src={post.author.image} sizes="2.5rem" alt="" />
            )}
            <AvatarFallback className="text-foreground">{initials}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to="/user/$username"
            params={{ username: post.author.username }}
            dir="auto"
            data-view-transition-part="profile-name"
            onClick={openProfile}
            className="block truncate text-sm font-semibold hover:underline"
          >
            {post.author.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            @{post.author.username} ·{" "}
            <DateTime value={post.publishedAt} presentation={detail ? "absolute" : "relative"} />
          </p>
        </div>
        {post.visibility === "unlisted" && (
          <Badge variant="outline">
            <Link2 aria-hidden="true" data-icon="inline-start" />
            Unlisted
          </Badge>
        )}
      </header>

      <div className="mb-4 flex flex-col gap-3">
        {detail ? (
          <h1
            dir="auto"
            data-view-transition-part="post-title"
            className="overflow-hidden font-heading text-3xl font-bold tracking-tight text-balance sm:text-5xl"
          >
            {post.title}
          </h1>
        ) : (
          <h2
            dir="auto"
            data-view-transition-part="post-title"
            className="overflow-hidden font-heading text-2xl font-bold tracking-tight text-balance"
          >
            <Link
              to="/post/$postId"
              params={{ postId: post.id }}
              onClick={openPost}
              className="hover:underline"
            >
              {post.title}
            </Link>
          </h2>
        )}
        {post.textContent ? (
          <div data-view-transition-part="post-copy">
            {detail ? (
              <MarkdownContent postId={post.id} className="typeset-post max-w-3xl">
                {post.textContent}
              </MarkdownContent>
            ) : (
              <PostTextPreview postId={post.id} markdown={post.textContent} onOpen={openPost} />
            )}
          </div>
        ) : null}
      </div>

      {detail ? (
        <PostDetailMetadata
          post={post}
          galleryLayout={resolvedGalleryLayout}
          selectedImageIndex={selectedImageIndex}
          onOpenPost={openPost}
          onOpenTag={openTag}
        />
      ) : null}
      {detail ? (
        <span id="post-engagement-start" className="block h-px" aria-hidden="true" />
      ) : null}

      <PostMedia
        post={post}
        detail={detail}
        priority={priority}
        selectedImageIndex={selectedImageIndex}
        galleryLayout={resolvedGalleryLayout}
        onOpenPost={openPost}
      />

      {!detail ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {post.tags.map((tag) => (
            <Badge
              key={tag.slug}
              variant="secondary"
              render={
                <Link
                  to="/tag/$tag"
                  params={{ tag: tag.slug }}
                  data-view-transition-active={activeSharedViewTransitionKind({
                    kind: "tag",
                    sourcePostId: post.id,
                    tag: tag.slug,
                  })}
                  data-view-transition-part="tag-name"
                  onClick={(event) => openTag(event, tag.slug)}
                />
              }
            >
              #{tag.name}
            </Badge>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <PostViewCount count={post.viewCount} />
            <Link
              to="/post/$postId"
              params={{ postId: post.id }}
              hash="discussion"
              onClick={openPost}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <MessageCircle aria-hidden="true" className="size-3.5" />
              {post.commentCount + reactionCount === 0 ? (
                "Discuss"
              ) : (
                <>
                  {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"} ·{" "}
                  {reactionCount} {reactionCount === 1 ? "reaction" : "reactions"}
                </>
              )}
            </Link>
          </div>
        </div>
      ) : null}
    </article>
  )
}
