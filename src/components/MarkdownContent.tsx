"use client"

import {
  ExternalLink,
  EyeOff,
  ImageIcon,
  Info,
  Lightbulb,
  Music2,
  Play,
  TriangleAlert,
  Video,
} from "lucide-react"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react"
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import type { PluggableList } from "unified"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { UserGeneratedLink, UserGeneratedLinkProvider } from "@/components/UserGeneratedLink"
import { externalImageProxyUrl, isProxyableExternalImageUrl } from "@/lib/markdown"
import {
  parseRenderedPostDirective,
  parseRenderedPostContainerDirective,
  parseRenderedPostInlineDirective,
  postMarkdownSanitizeSchema,
  remarkPostDirectives,
  type MarkdownCalloutKind,
} from "@/lib/markdown-directives"
import { markdownEmbedProviderName, type MarkdownEmbed } from "@/lib/markdown-embeds"
import { externalLinkDestination, safeUserGeneratedUrl } from "@/lib/user-generated-link"
import { cn } from "@/lib/utils"
import { getTumblrEmbed } from "@/server/external-embeds"

type MarkdownContextValue = {
  readonly postId?: string
  readonly variant: MarkdownVariant
}

type MarkdownVariant = "post" | "comment"

const MarkdownContext = createContext<MarkdownContextValue | null>(null)
const postMarkdownPlugins = [remarkGfm, remarkDirective, remarkPostDirectives]
const commentMarkdownPlugins = [remarkGfm]
const postHtmlPlugins: PluggableList = [[rehypeSanitize, postMarkdownSanitizeSchema]]
const commentHtmlPlugins: PluggableList = [rehypeSanitize]

let xScriptPromise: Promise<void> | null = null

type XWindow = Window & {
  readonly twttr?: {
    readonly widgets?: {
      readonly load: (element?: HTMLElement) => Promise<unknown> | void
    }
  }
}

type TumblrEmbedState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly href: string }
  | { readonly status: "unavailable" }

function useMarkdownContext() {
  const context = useContext(MarkdownContext)
  if (!context) throw new Error("Markdown content must be rendered inside MarkdownContent.")
  return context
}

function MarkdownLink({ href, children, node, ...props }: ComponentProps<"a"> & ExtraProps) {
  void node
  if (!href) return <span>{children}</span>
  return (
    <UserGeneratedLink {...props} href={href}>
      {children}
    </UserGeneratedLink>
  )
}

function providerIcon(embed: MarkdownEmbed) {
  if (embed.provider === "spotify" || embed.provider === "soundcloud") return Music2
  return embed.provider === "x" || embed.provider === "tumblr" ? ExternalLink : Video
}

function xWidgets() {
  return (window as XWindow).twttr?.widgets
}

function loadXScript() {
  if (xWidgets()) return Promise.resolve()
  if (xScriptPromise) return xScriptPromise

  xScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-pistonpost-x]")
    const script = existing ?? document.createElement("script")
    const handleLoad = () => resolve()
    const handleError = () => {
      script.remove()
      reject(new Error("The X embed script could not be loaded."))
    }
    script.addEventListener("load", handleLoad, { once: true })
    script.addEventListener("error", handleError, { once: true })
    if (!existing) {
      script.async = true
      script.src = "https://platform.x.com/widgets.js"
      script.dataset.pistonpostX = "true"
      document.head.appendChild(script)
    }
  }).catch((error: unknown) => {
    xScriptPromise = null
    throw error
  })
  return xScriptPromise
}

function ExternalEmbedLoading({ providerName }: { providerName: string }) {
  return (
    <Item
      className="not-typeset my-4 min-h-28 bg-muted/25"
      variant="outline"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <ItemMedia variant="icon">
        <Spinner aria-hidden="true" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>Loading {providerName} embed…</ItemTitle>
        <ItemDescription>Preparing the external preview.</ItemDescription>
      </ItemContent>
    </Item>
  )
}

function XEmbed({ embed }: { embed: Extract<MarkdownEmbed, { provider: "x" }> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const blockquote = document.createElement("blockquote")
    blockquote.className = "twitter-tweet"
    blockquote.dataset.dnt = "true"
    const link = document.createElement("a")
    link.href = embed.url
    link.textContent = "View this post on X"
    blockquote.appendChild(link)
    container.replaceChildren(blockquote)

    let active = true
    void loadXScript()
      .then(() => xWidgets()?.load(container))
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
      container.replaceChildren()
    }
  }, [embed.url])

  return failed ? (
    <ExternalLinkCard href={embed.url} label="View this post on X" />
  ) : (
    <div ref={containerRef} className="not-typeset my-4 min-h-28" />
  )
}

function TumblrWidget({
  embed,
  href,
}: {
  embed: Extract<MarkdownEmbed, { provider: "tumblr" }>
  href: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const post = document.createElement("div")
    post.className = "tumblr-post"
    post.dataset.href = href
    const link = document.createElement("a")
    link.href = embed.url
    link.textContent = "View this post on Tumblr"
    post.appendChild(link)
    container.replaceChildren(post)

    const script = document.createElement("script")
    script.async = true
    script.src = "https://assets.tumblr.com/post.js"
    let active = true
    script.addEventListener(
      "error",
      () => {
        if (active) setFailed(true)
      },
      { once: true },
    )
    container.appendChild(script)
    return () => {
      active = false
      container.replaceChildren()
    }
  }, [embed.url, href])

  return failed ? (
    <ExternalLinkCard href={embed.url} label="View this post on Tumblr" />
  ) : (
    <div ref={containerRef} className="not-typeset my-4 min-h-28" />
  )
}

function TumblrEmbed({ embed }: { embed: Extract<MarkdownEmbed, { provider: "tumblr" }> }) {
  const [state, setState] = useState<TumblrEmbedState>({ status: "loading" })

  useEffect(() => {
    let active = true
    void getTumblrEmbed({ data: { url: embed.url } })
      .then((result) => {
        if (!active) return
        setState(
          result.status === "ready"
            ? { status: "ready", href: result.href }
            : { status: "unavailable" },
        )
      })
      .catch(() => {
        if (active) setState({ status: "unavailable" })
      })
    return () => {
      active = false
    }
  }, [embed.url])

  if (state.status === "loading") return <ExternalEmbedLoading providerName="Tumblr" />
  if (state.status === "unavailable") {
    return <ExternalLinkCard href={embed.url} label="View this post on Tumblr" />
  }
  return <TumblrWidget embed={embed} href={state.href} />
}

function PlayerEmbed({ embed }: { embed: Exclude<MarkdownEmbed, { provider: "x" | "tumblr" }> }) {
  if (embed.provider === "youtube") {
    return (
      <AspectRatio ratio={16 / 9} className="not-typeset my-4 overflow-hidden bg-muted">
        {/* oxlint-disable-next-line react/iframe-missing-sandbox -- YouTube requires its official cross-origin embed contract. */}
        <iframe
          src={`https://www.youtube.com/embed/${embed.videoId}`}
          title="YouTube video player"
          className="size-full border-0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </AspectRatio>
    )
  }
  if (embed.provider === "spotify") {
    return (
      // oxlint-disable-next-line react/iframe-missing-sandbox -- Spotify requires its official cross-origin embed contract.
      <iframe
        src={`https://open.spotify.com/embed/${embed.entityType}/${embed.entityId}`}
        title="Spotify player"
        className="not-typeset my-4 h-[152px] w-full border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
      />
    )
  }
  if (embed.provider === "soundcloud") {
    const search = new URLSearchParams({ url: embed.url })
    return (
      // oxlint-disable-next-line react/iframe-missing-sandbox -- SoundCloud requires its official cross-origin embed contract.
      <iframe
        src={`https://w.soundcloud.com/player/?${search.toString()}`}
        title="SoundCloud player"
        className="not-typeset my-4 h-[166px] w-full border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay"
      />
    )
  }

  const source =
    embed.provider === "vimeo"
      ? `https://player.vimeo.com/video/${embed.videoId}${embed.hash ? `?h=${embed.hash}` : ""}`
      : `https://geo.dailymotion.com/player.html?video=${embed.videoId}`
  const title = embed.provider === "vimeo" ? "Vimeo video player" : "Dailymotion video player"
  return (
    <AspectRatio ratio={16 / 9} className="not-typeset my-4 overflow-hidden bg-muted">
      {/* oxlint-disable-next-line react/iframe-missing-sandbox -- The provider requires its official cross-origin embed contract. */}
      <iframe
        src={source}
        title={title}
        className="size-full border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; fullscreen; picture-in-picture; web-share"
        allowFullScreen
      />
    </AspectRatio>
  )
}

function LoadedEmbed({ embed }: { embed: MarkdownEmbed }) {
  if (embed.provider === "x") return <XEmbed key={embed.url} embed={embed} />
  if (embed.provider === "tumblr") return <TumblrEmbed key={embed.url} embed={embed} />
  return <PlayerEmbed embed={embed} />
}

function EmbedConsent({ embed, label }: { embed: MarkdownEmbed; label: string | null }) {
  const [loaded, setLoaded] = useState(false)
  const providerName = markdownEmbedProviderName(embed)
  const ProviderIcon = providerIcon(embed)

  if (!loaded) {
    return (
      <Item className="not-typeset my-4 min-h-28 bg-muted/25" variant="outline">
        <ItemMedia variant="icon">
          <ProviderIcon aria-hidden="true" className="text-muted-foreground" />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="line-clamp-2">{label || `${providerName} embed`}</ItemTitle>
          <ItemDescription>Load this embed to share data with {providerName}.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button type="button" variant="outline" onClick={() => setLoaded(true)}>
            <Play aria-hidden="true" data-icon="inline-start" />
            Load
          </Button>
        </ItemActions>
      </Item>
    )
  }
  return <LoadedEmbed embed={embed} />
}

function ExternalLinkCard({ href, label }: { href: string; label: string }) {
  return (
    <Item
      render={<UserGeneratedLink href={href} />}
      className="not-typeset my-4 overflow-hidden bg-muted/15 no-underline"
      variant="outline"
    >
      <ItemMedia variant="icon">
        <ExternalLink aria-hidden="true" className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-2 wrap-anywhere">
          {label || externalLinkDestination(href)}
        </ItemTitle>
        <ItemDescription className="truncate text-xs">{href}</ItemDescription>
      </ItemContent>
    </Item>
  )
}

function MarkdownParagraph({ node, children, ...props }: ComponentProps<"p"> & ExtraProps) {
  const { variant } = useMarkdownContext()
  const directive = variant === "post" && node ? parseRenderedPostDirective(node.properties) : null
  if (directive?.kind === "embed") {
    return <EmbedConsent embed={directive.embed} label={directive.label} />
  }
  if (directive?.kind === "card") {
    return <ExternalLinkCard href={directive.url} label={directive.label ?? ""} />
  }
  return <p {...props}>{children}</p>
}

function MarkdownSpan({ node, children, ...props }: ComponentProps<"span"> & ExtraProps) {
  const { variant } = useMarkdownContext()
  const directive =
    variant === "post" && node ? parseRenderedPostInlineDirective(node.properties) : null
  if (directive?.kind === "spoiler") return <MarkdownSpoiler label={directive.label} />
  return <span {...props}>{children}</span>
}

function MarkdownSpoiler({ label }: { label: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <button
      type="button"
      aria-pressed={revealed}
      aria-label={revealed ? "Hide spoiler" : "Reveal spoiler"}
      className={cn(
        "font-inherit inline border px-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        revealed
          ? "border-border bg-muted/35 text-foreground"
          : "border-foreground/70 bg-foreground text-background",
      )}
      onClick={() => setRevealed((current) => !current)}
    >
      {revealed ? (
        label
      ) : (
        <EyeOff aria-hidden="true" className="inline size-[1em] align-[-0.125em]" />
      )}
      {!revealed ? <span className="sr-only">Spoiler</span> : null}
    </button>
  )
}

const calloutPresentation = {
  note: { icon: Info, label: "Note", className: "border-l-primary" },
  tip: { icon: Lightbulb, label: "Tip", className: "border-l-emerald-500/70" },
  warning: { icon: TriangleAlert, label: "Warning", className: "border-l-amber-500/80" },
} satisfies Record<
  MarkdownCalloutKind,
  { readonly icon: typeof Info; readonly label: string; readonly className: string }
>

function MarkdownDiv({ node, children, ...props }: ComponentProps<"div"> & ExtraProps) {
  const { variant } = useMarkdownContext()
  const directive =
    variant === "post" && node ? parseRenderedPostContainerDirective(node.properties) : null
  if (directive?.kind === "details") {
    return (
      <details className="border-l-2 border-border pl-4">
        <summary>{directive.label}</summary>
        <div>{children}</div>
      </details>
    )
  }
  if (directive?.kind === "callout") {
    const presentation = calloutPresentation[directive.calloutKind]
    const Icon = presentation.icon
    return (
      <Alert role="note" className={cn("my-4 rounded-md border-l-4", presentation.className)}>
        <Icon aria-hidden="true" />
        <AlertTitle>{directive.label || presentation.label}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    )
  }
  return <div {...props}>{children}</div>
}

function MarkdownImage({ src, alt }: ComponentProps<"img"> & ExtraProps) {
  const { postId, variant } = useMarkdownContext()
  if (!src) return alt ? <span>{alt}</span> : null

  if (variant === "comment") {
    return (
      <UserGeneratedLink
        href={src}
        className="inline-flex max-w-full items-center gap-1 overflow-hidden align-middle"
      >
        <ImageIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{alt ? `Image: ${alt}` : "Image link"}</span>
      </UserGeneratedLink>
    )
  }

  const localSource = src.startsWith("/") && !src.startsWith("//")
  const proxySource = postId && isProxyableExternalImageUrl(src)
  if (localSource || proxySource) {
    const imageSource = proxySource ? externalImageProxyUrl(postId, src) : src
    return <img src={imageSource} alt={alt ?? ""} loading="lazy" decoding="async" />
  }

  return (
    <Item
      render={<UserGeneratedLink href={src} />}
      className="not-typeset my-2 inline-flex bg-muted/15 no-underline"
      size="sm"
      variant="outline"
    >
      <ItemMedia variant="icon">
        <ImageIcon aria-hidden="true" className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-2 wrap-anywhere">{alt || "External image"}</ItemTitle>
        <ItemDescription className="text-xs">
          The image will be proxied after this post is saved.
        </ItemDescription>
      </ItemContent>
    </Item>
  )
}

function MarkdownTable({ node, ...props }: ComponentProps<"table"> & ExtraProps) {
  const { variant } = useMarkdownContext()
  void node
  if (variant === "comment") {
    return (
      <div className="typeset-scroll">
        <table {...props} />
      </div>
    )
  }
  return <table {...props} />
}

const markdownComponents: Components = {
  a: MarkdownLink,
  div: MarkdownDiv,
  img: MarkdownImage,
  p: MarkdownParagraph,
  span: MarkdownSpan,
  table: MarkdownTable,
}

export function MarkdownContent({
  children,
  className,
  postId,
  variant = "post",
}: {
  readonly children: string
  readonly className?: string
  readonly postId?: string
  readonly variant?: MarkdownVariant
}) {
  const context = useMemo<MarkdownContextValue>(
    () => (postId ? { postId, variant } : { variant }),
    [postId, variant],
  )

  return (
    <UserGeneratedLinkProvider>
      <MarkdownContext value={context}>
        <div
          dir="auto"
          className={cn(
            "typeset min-w-0 overflow-hidden wrap-anywhere [&_blockquote]:overflow-hidden [&_figcaption]:overflow-hidden [&_h1]:overflow-hidden [&_h2]:overflow-hidden [&_h3]:overflow-hidden [&_h4]:overflow-hidden [&_h5]:overflow-hidden [&_h6]:overflow-hidden [&_li]:overflow-hidden [&_p]:overflow-hidden [&_td]:overflow-hidden [&_th]:overflow-hidden",
            variant === "comment" && "typeset-comment",
            className,
          )}
        >
          <ReactMarkdown
            remarkPlugins={variant === "post" ? postMarkdownPlugins : commentMarkdownPlugins}
            rehypePlugins={variant === "post" ? postHtmlPlugins : commentHtmlPlugins}
            components={markdownComponents}
            skipHtml
            urlTransform={safeUserGeneratedUrl}
          >
            {children}
          </ReactMarkdown>
        </div>
      </MarkdownContext>
    </UserGeneratedLinkProvider>
  )
}
