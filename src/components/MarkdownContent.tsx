"use client"

import { ExternalLink, ImageIcon, Music2, Play, Video } from "lucide-react"
import { createContext, useContext, useMemo, useState, type ComponentProps } from "react"
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { UserGeneratedLink, UserGeneratedLinkProvider } from "@/components/UserGeneratedLink"
import {
  externalImageProxyUrl,
  isProxyableExternalImageUrl,
  parseMarkdownEmbed,
  type MarkdownEmbed,
} from "@/lib/markdown"
import {
  externalLinkDestination,
  isExternalUserGeneratedUrl,
  safeUserGeneratedUrl,
} from "@/lib/user-generated-link"
import { cn } from "@/lib/utils"

type MarkdownContextValue = {
  readonly postId?: string
}

const MarkdownContext = createContext<MarkdownContextValue | null>(null)
const markdownPlugins = [remarkGfm]
const htmlPlugins = [rehypeSanitize]

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

function standaloneLink(node: NonNullable<ExtraProps["node"]>) {
  if (node.children.length !== 1) return null
  const child = node.children[0]
  if (child?.type !== "element" || child.tagName !== "a") return null
  const href = child.properties.href
  if (typeof href !== "string") return null
  const label = child.children
    .map((linkChild) => (linkChild.type === "text" ? linkChild.value : ""))
    .join("")
    .trim()
  return { href, label }
}

function EmbedConsent({ embed }: { embed: MarkdownEmbed }) {
  const [loaded, setLoaded] = useState(false)
  const providerName = embed.provider === "youtube" ? "YouTube" : "Spotify"
  const ProviderIcon = embed.provider === "youtube" ? Video : Music2

  if (!loaded) {
    return (
      <div className="not-typeset my-4 flex min-h-28 items-center justify-between gap-4 border bg-muted/25 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <ProviderIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">{providerName} embed</p>
            <p className="text-sm text-muted-foreground">
              Load the player to share data with {providerName}.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => setLoaded(true)}>
          <Play aria-hidden="true" data-icon="inline-start" />
          Load
        </Button>
      </div>
    )
  }

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

function ExternalLinkCard({ href, label }: { href: string; label: string }) {
  return (
    <UserGeneratedLink
      href={href}
      className="not-typeset my-4 flex items-center gap-3 border bg-muted/15 p-4 no-underline transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ExternalLink aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label || externalLinkDestination(href)}</span>
        <span className="block truncate text-xs text-muted-foreground">{href}</span>
      </span>
    </UserGeneratedLink>
  )
}

function MarkdownParagraph({ node, children, ...props }: ComponentProps<"p"> & ExtraProps) {
  const standalone = node ? standaloneLink(node) : null
  const href = standalone ? safeUserGeneratedUrl(standalone.href) : null
  if (href) {
    const embed = parseMarkdownEmbed(href)
    if (embed) return <EmbedConsent embed={embed} />
    if (isExternalUserGeneratedUrl(href)) {
      return <ExternalLinkCard href={href} label={standalone?.label ?? ""} />
    }
  }
  return <p {...props}>{children}</p>
}

function MarkdownImage({ src, alt }: ComponentProps<"img"> & ExtraProps) {
  const { postId } = useMarkdownContext()
  if (!src) return alt ? <span>{alt}</span> : null

  const localSource = src.startsWith("/") && !src.startsWith("//")
  const proxySource = postId && isProxyableExternalImageUrl(src)
  if (localSource || proxySource) {
    const imageSource = proxySource ? externalImageProxyUrl(postId, src) : src
    return <img src={imageSource} alt={alt ?? ""} loading="lazy" decoding="async" />
  }

  return (
    <UserGeneratedLink
      href={src}
      className="not-typeset my-2 inline-flex items-center gap-2 border bg-muted/15 px-3 py-2 no-underline"
    >
      <ImageIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{alt || "External image"}</span>
        <span className="block text-xs text-muted-foreground">
          The image will be proxied after this post is saved.
        </span>
      </span>
    </UserGeneratedLink>
  )
}

const markdownComponents: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  p: MarkdownParagraph,
}

export function MarkdownContent({
  children,
  className,
  postId,
}: {
  readonly children: string
  readonly className?: string
  readonly postId?: string
}) {
  const context = useMemo<MarkdownContextValue>(() => (postId ? { postId } : {}), [postId])

  return (
    <UserGeneratedLinkProvider>
      <MarkdownContext value={context}>
        <div dir="auto" className={cn("typeset min-w-0 wrap-anywhere", className)}>
          <ReactMarkdown
            remarkPlugins={markdownPlugins}
            rehypePlugins={htmlPlugins}
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
