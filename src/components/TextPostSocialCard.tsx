import { truncateDescription, truncateTitle } from "@/lib/seo"

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
})

export type TextPostSocialCardProps = {
  readonly title: string
  readonly excerpt: string
  readonly authorName: string
  readonly authorUsername: string
  readonly publishedAt: Date
}

function authorInitial(authorName: string) {
  for (const { segment } of graphemeSegmenter.segment(authorName)) return segment
  return "?"
}

export function TextPostSocialCard({
  title: untrimmedTitle,
  excerpt: untrimmedExcerpt,
  authorName: untrimmedAuthorName,
  authorUsername: untrimmedAuthorUsername,
  publishedAt,
}: TextPostSocialCardProps) {
  const title = truncateTitle(untrimmedTitle)
  const excerpt = truncateDescription(untrimmedExcerpt, 220)
  const authorName = truncateTitle(untrimmedAuthorName, 32)
  const authorUsername = truncateTitle(untrimmedAuthorUsername, 32)
  const publishedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(publishedAt)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "50px 80px",
        backgroundColor: "#fff9ed",
        color: "#392d2f",
        fontFamily: "Outfit",
      }}
    >
      <div style={{ color: "#dc3850", fontSize: 34, fontWeight: 750 }}>pistonpost</div>
      <div
        style={{
          width: "100%",
          height: 4,
          marginTop: 16,
          flexShrink: 0,
          backgroundColor: "#dc3850",
        }}
      />
      <div
        style={{
          maxHeight: 216,
          marginTop: 20,
          overflow: "hidden",
          overflowWrap: "anywhere",
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.12,
          lineClamp: 3,
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </div>
      {excerpt && (
        <div
          style={{
            maxHeight: 84,
            marginTop: 30,
            overflow: "hidden",
            overflowWrap: "anywhere",
            color: "#756869",
            fontSize: 30,
            fontWeight: 450,
            lineHeight: 1.4,
            lineClamp: 2,
            textOverflow: "ellipsis",
          }}
        >
          {excerpt}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
        <div
          style={{
            width: 72,
            height: 72,
            display: "flex",
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 36,
            backgroundColor: "#dc3850",
            color: "#fff9ed",
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          {authorInitial(authorName)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
          <div style={{ fontSize: 28, fontWeight: 650 }}>{authorName}</div>
          <div style={{ marginTop: 3, color: "#756869", fontSize: 22, fontWeight: 450 }}>
            @{authorUsername} · {publishedDate}
          </div>
        </div>
      </div>
    </div>
  )
}
