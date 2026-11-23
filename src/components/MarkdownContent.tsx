"use client"

import type { Root as HastRoot } from "hast"
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
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react"
import ReactMarkdown, { type Components, type ExtraProps, type Options } from "react-markdown"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import type { PluggableList } from "unified"
import { visit } from "unist-util-visit"

import { AppImage } from "@/components/AppImage"
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
  parseRenderedPostContainerDirective,
  parseRenderedPostDirective,
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
// Phrasing content inside a link must not add another link or button.
const InsideLinkContext = createContext(false)
const postMarkdownPlugins = [remarkGfm, remarkDirective, remarkPostDirectives]
const commentMarkdownPlugins = [remarkGfm]
// remark-rehype already prefixes generated IDs with a per-render scope, so the sanitizer
// must not add a second prefix. Raw HTML is skipped, so users cannot write other IDs.
const postSanitizeSchema = { ...postMarkdownSanitizeSchema, clobberPrefix: "" }
const commentSanitizeSchema = { ...defaultSchema, clobberPrefix: "" }
const FOOTNOTE_LABEL_ID = "footnote-label"

// remark-rehype always names the footnote heading "footnote-label", without its prefix.
function rehypeScopeFootnoteLabel(options: { readonly prefix: string }) {
  const scopedId = `${options.prefix}${FOOTNOTE_LABEL_ID}`
  return (tree: HastRoot) => {
    visit(tree, "element", (element) => {
      if (element.properties.id === FOOTNOTE_LABEL_ID) element.properties.id = scopedId
      const describedBy = element.properties.ariaDescribedBy
      if (Array.isArray(describedBy)) {
        element.properties.ariaDescribedBy = describedBy.map((id) =>
          id === FOOTNOTE_LABEL_ID ? scopedId : id,
        )
      }
    })
  }
}

let xScriptPromise: Promise<void> | null = null

type XWindow = Window & {
  readonly twttr?: {
    readonly widgets?: {
      readonly load: (element?: HTMLElement) => unknown
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
      <InsideLinkContext value>{children}</InsideLinkContext>
    </UserGeneratedLink>
  )
}

function EmbedProviderIcon({ embed }: { readonly embed: MarkdownEmbed }) {
  if (embed.provider === "spotify" || embed.provider === "soundcloud") {
    return <Music2 aria-hidden="true" className="text-muted-foreground" />
  }
  if (embed.provider === "x" || embed.provider === "tumblr") {
    return <ExternalLink aria-hidden="true" className="text-muted-foreground" />
  }
  return <Video aria-hidden="true" className="text-muted-foreground" />
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
    const handleLoad = () => {
      resolve()
    }
    const handleError = () => {
      script.remove()
      reject(new Error("The X embed script could not be loaded."))
    }
    script.addEventListener("load", handleLoad, { once: true })
    script.addEventListener("error", handleError, { once: true })
    if (!existing) {
      script.async = true
      script.src = "https://platform.x.com/widgets.js"
      script.dataset["pistonpostX"] = "true"
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
    blockquote.dataset["dnt"] = "true"
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
    post.dataset["href"] = href
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
    const controller = new AbortController()
    void (async () => {
      const result = await getTumblrEmbed({ data: { url: embed.url } })
      if (controller.signal.aborted) return
      setState(
        result.status === "ready"
          ? { status: "ready", href: result.href }
          : { status: "unavailable" },
      )
    })().catch(() => {
      if (!controller.signal.aborted) setState({ status: "unavailable" })
    })
    return () => {
      controller.abort()
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

  if (!loaded) {
    return (
      <Item className="not-typeset my-4 min-h-28 bg-muted/25" variant="outline">
        <ItemMedia variant="icon">
          <EmbedProviderIcon embed={embed} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="line-clamp-2">{label || `${providerName} embed`}</ItemTitle>
          <ItemDescription>Load this embed to share data with {providerName}.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoaded(true)
            }}
          >
            <Play aria-hidden="true" data-icon="inline-start" />
            Load
            <span className="sr-only"> {providerName} embed</span>
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

function MarkdownSpan({ node, children, ...props }: ComponentProps<"span"> & ExtraProps) {
  const { variant } = useMarkdownContext()
  const insideLink = useContext(InsideLinkContext)
  const directive =
    variant === "post" && node ? parseRenderedPostInlineDirective(node.properties) : null
  if (directive?.kind === "spoiler") {
    // A button cannot sit inside a link, and a click would also open the link. Keep the spoiler
    // covered there instead of revealing it as plain text.
    return insideLink ? <MaskedSpoiler /> : <MarkdownSpoiler label={directive.label} />
  }
  return <span {...props}>{children}</span>
}

function MarkdownSpoiler({ label }: { label: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <button
      type="button"
      aria-pressed={revealed}
      title={revealed ? "Hide spoiler" : "Reveal spoiler"}
      className={cn(
        "inline border px-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        revealed
          ? "border-border bg-muted/35 text-foreground"
          : "border-foreground/70 bg-foreground text-background",
      )}
      onClick={() => {
        setRevealed((current) => !current)
      }}
    >
      <span className="sr-only">{revealed ? "Spoiler: " : "Reveal spoiler"}</span>
      {revealed ? (
        label
      ) : (
        <EyeOff aria-hidden="true" className="inline size-[1em] align-[-0.125em]" />
      )}
    </button>
  )
}

function MaskedSpoiler() {
  return (
    <span className="inline border border-foreground/70 bg-foreground px-1 text-background">
      <span className="sr-only">Hidden spoiler</span>
      <EyeOff aria-hidden="true" className="inline size-[1em] align-[-0.125em]" />
    </span>
  )
}

const calloutPresentation = {
  note: { icon: Info, label: "Note" },
  tip: { icon: Lightbulb, label: "Tip" },
  warning: { icon: TriangleAlert, label: "Warning" },
} satisfies Record<MarkdownCalloutKind, { readonly icon: typeof Info; readonly label: string }>

function MarkdownDiv({ node, children, ...props }: ComponentProps<"div"> & ExtraProps) {
  const { variant } = useMarkdownContext()
  const leafDirective =
    variant === "post" && node ? parseRenderedPostDirective(node.properties) : null
  if (leafDirective?.kind === "embed") {
    return <EmbedConsent embed={leafDirective.embed} label={leafDirective.label} />
  }
  if (leafDirective?.kind === "card") {
    return <ExternalLinkCard href={leafDirective.url} label={leafDirective.label ?? ""} />
  }
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
      <Alert
        role="note"
        className={cn(
          "my-4 rounded-md border-l-4",
          directive.calloutKind === "note"
            ? "border-l-primary"
            : directive.calloutKind === "tip"
              ? "border-l-callout-tip"
              : "border-l-callout-warning",
        )}
      >
        <Icon aria-hidden="true" />
        <AlertTitle>{directive.label || presentation.label}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    )
  }
  return <div {...props}>{children}</div>
}

// Images are phrasing content, so every fallback uses inline elements and never nests a
// link inside the link that may already wrap the image.
function MarkdownImage({ src, alt }: ComponentProps<"img"> & ExtraProps) {
  const { postId, variant } = useMarkdownContext()
  const insideLink = useContext(InsideLinkContext)
  if (!src) return alt ? <span>{alt}</span> : null

  if (variant === "comment" && insideLink) {
    return <span>{alt ? `Image: ${alt}` : "Image"}</span>
  }
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
    return <AppImage src={imageSource} alt={alt ?? ""} loading="lazy" decoding="async" />
  }

  const title = alt || "External image"
  const content = (
    <>
      <ImageIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="line-clamp-2 leading-snug font-medium wrap-anywhere">{title}</span>
        <span className="text-xs text-muted-foreground">
          {!postId && isProxyableExternalImageUrl(src)
            ? "The image will be proxied after this post is saved."
            : `Opens an image on ${externalLinkDestination(src)}.`}
        </span>
      </span>
    </>
  )
  const cardClassName =
    "not-typeset my-2 inline-flex max-w-full items-center gap-3.5 rounded-2xl border border-border bg-muted/15 px-3.5 py-3 align-middle text-sm no-underline"

  if (insideLink) return <span className={cardClassName}>{content}</span>
  return (
    <UserGeneratedLink
      href={src}
      className={cn(
        cardClassName,
        "transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {content}
    </UserGeneratedLink>
  )
}

function MarkdownTable({ node, ...props }: ComponentProps<"table"> & ExtraProps) {
  void node
  return (
    <div className="typeset-scroll">
      <table {...props} />
    </div>
  )
}

const markdownComponents: Components = {
  a: MarkdownLink,
  div: MarkdownDiv,
  img: MarkdownImage,
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
  // Footnote IDs need a scope per rendered document, so several posts or comments on one
  // page do not share targets. useId is stable between the server and hydration.
  const idPrefix = `user-content-${useId().replaceAll(/[^\w-]/gu, "")}-`
  const remarkRehypeOptions: Options["remarkRehypeOptions"] = { clobberPrefix: idPrefix }
  const rehypePlugins: PluggableList = [
    [rehypeSanitize, variant === "post" ? postSanitizeSchema : commentSanitizeSchema],
    [rehypeScopeFootnoteLabel, { prefix: idPrefix }],
  ]

  return (
    <UserGeneratedLinkProvider>
      <MarkdownContext value={context}>
        <div
          dir="auto"
          className={cn(
            "typeset min-w-0 overflow-hidden wrap-anywhere [&_blockquote]:overflow-hidden [&_figcaption]:overflow-hidden [&_h1]:overflow-hidden [&_h2]:overflow-hidden [&_h3]:overflow-hidden [&_h4]:overflow-hidden [&_h5]:overflow-hidden [&_h6]:overflow-hidden [&_p]:overflow-hidden [&_td]:overflow-hidden [&_th]:overflow-hidden",
            variant === "comment" && "typeset-comment",
            className,
          )}
        >
          <ReactMarkdown
            remarkPlugins={variant === "post" ? postMarkdownPlugins : commentMarkdownPlugins}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
            remarkRehypeOptions={remarkRehypeOptions}
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
