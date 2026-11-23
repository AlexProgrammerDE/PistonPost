import type { APIContainerComponent, ButtonStyle, ComponentType } from "discord-api-types/v10"

// The package ships its enums as CommonJS, so a value import puts all of discord-api-types (about
// 90 KB) in the client entry: createSeoHead runs in route heads on the client too. TypeScript still
// rejects any number here that differs from the upstream enum member.
/* oxlint-disable typescript/no-unsafe-enum-assignment -- These literals are the enum values, checked by the annotations. */
const componentType: {
  readonly ActionRow: ComponentType.ActionRow
  readonly Button: ComponentType.Button
  readonly Section: ComponentType.Section
  readonly TextDisplay: ComponentType.TextDisplay
  readonly Thumbnail: ComponentType.Thumbnail
  readonly MediaGallery: ComponentType.MediaGallery
  readonly Container: ComponentType.Container
} = {
  ActionRow: 1,
  Button: 2,
  Section: 9,
  TextDisplay: 10,
  Thumbnail: 11,
  MediaGallery: 12,
  Container: 17,
}
const linkButtonStyle: ButtonStyle.Link = 5
/* oxlint-enable typescript/no-unsafe-enum-assignment */

export type DiscordEmbedOptions = {
  title: string
  label?: string
  description?: string
  url: string
  thumbnail?: string
  images?: readonly string[]
  links?: readonly { label: string; url: string }[]
  color?: number
  layout?: "default" | "compact" | "media"
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function graphemes(value: string) {
  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment)
}

function shorten(value: string, length: number) {
  if (length <= 0) return ""
  const characters = graphemes(value)
  return characters.length > length ? `${characters.slice(0, length - 1).join("")}…` : value
}

function markdown(value: string) {
  return value.replaceAll(/([\\`*_{}[\]()<>#|~])/gu, String.raw`\$1`)
}

function publicUrl(value: string, maximum = 512) {
  const url = URL.parse(value)
  return url &&
    ["https:", "http:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    url.href.length <= maximum
    ? url.href
    : undefined
}

export function serializeDiscordEmbed(component: APIContainerComponent) {
  return JSON.stringify({ component }).replaceAll("<", String.raw`\u003c`)
}

export function createDiscordEmbed(
  options: DiscordEmbedOptions,
): APIContainerComponent | undefined {
  const url = publicUrl(options.url)
  if (!url) return undefined
  let title = shorten(options.title.trim() || "View page", 120)
  let description = shorten(options.description?.trim() ?? "", 600)
  const images = (options.images ?? []).flatMap((value) => publicUrl(value, 2048) ?? []).slice(0, 4)
  const thumbnail = options.thumbnail ? publicUrl(options.thumbnail, 512) : undefined
  const layout = options.layout ?? "default"
  const links = [{ label: options.label ?? "View page", url }, ...(options.links ?? [])]
    .flatMap((link) => {
      const href = publicUrl(link.url)
      return href ? [{ label: shorten(link.label.trim() || "View page", 60), url: href }] : []
    })
    .filter((link, index, values) => values.findIndex((other) => other.url === link.url) === index)
    .slice(0, 4)

  for (;;) {
    if (layout === "media" && images.length === 0) return undefined
    const heading = `[${markdown(title)}](${url})`
    const text = {
      type: componentType.TextDisplay,
      content: `${layout === "compact" ? `**${heading}**` : `## ${heading}`}${description ? `\n${markdown(description)}` : ""}`,
    } as const
    const component: APIContainerComponent = {
      type: componentType.Container,
      ...(options.color === undefined ? {} : { accent_color: options.color }),
      components: [
        ...(layout === "media"
          ? []
          : [
              thumbnail
                ? {
                    type: componentType.Section,
                    components: [text],
                    accessory: {
                      type: componentType.Thumbnail,
                      media: { url: thumbnail },
                    },
                  }
                : text,
            ]),
        ...(images.length > 0
          ? [
              {
                type: componentType.MediaGallery,
                items: images.map((image) => ({ media: { url: image } })),
              },
            ]
          : []),
        ...(layout === "default"
          ? [
              {
                type: componentType.ActionRow,
                components: links.map((link) => ({
                  type: componentType.Button,
                  style: linkButtonStyle,
                  ...link,
                })),
              },
            ]
          : []),
      ],
    }
    if (new TextEncoder().encode(serializeDiscordEmbed(component)).byteLength <= 3000)
      return component
    if (images.length > 0) images.pop()
    else if (links.length > 1) links.pop()
    else if (description.length > 0)
      description = shorten(description, Math.floor(graphemes(description).length / 2))
    else if (graphemes(title).length > 16) title = shorten(title, 16)
    else return undefined
  }
}

export function discordEmbedScript(options: DiscordEmbedOptions) {
  const component = createDiscordEmbed(options)
  // TanStack's HeadContent renders script children with dangerouslySetInnerHTML.
  return component
    ? [
        {
          id: "discord:component-embed",
          type: "application/json",
          children: serializeDiscordEmbed(component),
        },
      ]
    : []
}
