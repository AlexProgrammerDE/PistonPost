"use client"

import { ExternalLink, ImageIcon, Music2, Play, Video } from "lucide-react"
import { createContext, useContext, useMemo, useState, type ComponentProps } from "react"
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import {
  externalImageProxyUrl,
  externalLinkDestination,
  isExternalMarkdownUrl,
  isProxyableExternalImageUrl,
  parseMarkdownEmbed,
  safeMarkdownUrl,
  type MarkdownEmbed,
} from "@/lib/markdown"
import { cn } from "@/lib/utils"

type MarkdownContextValue = {
  readonly postId?: string
  readonly confirmExternalLink: (href: string) => void
}

const MarkdownContext = createContext<MarkdownContextValue | null>(null)
const markdownPlugins = [remarkGfm]
const htmlPlugins = [rehypeSanitize]

function useMarkdownContext() {
  const context = useContext(MarkdownContext)
  if (!context) throw new Error("Markdown content must be rendered inside MarkdownContent.")
  return context
}

function ConfirmedLink({
  href,
  onClick,
  children,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  const { confirmExternalLink } = useMarkdownContext()
  const external = isExternalMarkdownUrl(href)

  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event)
        if (!external || event.defaultPrevented) return
        event.preventDefault()
        confirmExternalLink(href)
      }}
    >
      {children}
    </a>
  )
}

function MarkdownLink({ href, children, node, ...props }: ComponentProps<"a"> & ExtraProps) {
  void node
  if (!href) return <span>{children}</span>
  return (
    <ConfirmedLink {...props} href={href}>
      {children}
    </ConfirmedLink>
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
    <ConfirmedLink
      href={href}
      className="not-typeset my-4 flex items-center gap-3 border bg-muted/15 p-4 no-underline transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ExternalLink aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label || externalLinkDestination(href)}</span>
        <span className="block truncate text-xs text-muted-foreground">{href}</span>
      </span>
    </ConfirmedLink>
  )
}

function MarkdownParagraph({ node, children, ...props }: ComponentProps<"p"> & ExtraProps) {
  const standalone = node ? standaloneLink(node) : null
  const href = standalone ? safeMarkdownUrl(standalone.href) : null
  if (href) {
    const embed = parseMarkdownEmbed(href)
    if (embed) return <EmbedConsent embed={embed} />
    if (isExternalMarkdownUrl(href)) {
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
    <ConfirmedLink
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
    </ConfirmedLink>
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
  const [pendingLink, setPendingLink] = useState<string | null>(null)

  function openPendingLink() {
    if (!pendingLink) return
    const url = new URL(pendingLink, window.location.origin)
    if (url.protocol === "mailto:") window.location.assign(url.toString())
    else window.open(url.toString(), "_blank", "noopener,noreferrer")
    setPendingLink(null)
  }

  const context = useMemo<MarkdownContextValue>(
    () =>
      postId
        ? { postId, confirmExternalLink: setPendingLink }
        : { confirmExternalLink: setPendingLink },
    [postId],
  )

  return (
    <MarkdownContext value={context}>
      <div className={cn("typeset", className)}>
        <ReactMarkdown
          remarkPlugins={markdownPlugins}
          rehypePlugins={htmlPlugins}
          components={markdownComponents}
          skipHtml
          urlTransform={safeMarkdownUrl}
        >
          {children}
        </ReactMarkdown>
      </div>
      <AlertDialog
        open={pendingLink !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLink(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open an external link?</AlertDialogTitle>
            <AlertDialogDescription>
              This link goes to{" "}
              {pendingLink ? externalLinkDestination(pendingLink) : "another site"}. External sites
              have their own privacy and security policies.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={openPendingLink}>Open link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MarkdownContext>
  )
}
