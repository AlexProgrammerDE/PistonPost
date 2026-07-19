import { PostView } from "@/components/post-view"
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineItem,
} from "@/components/ui/timeline"
import type { PublicPostRead } from "@/db/public-read-model"
import type { PostViewSurface } from "@/domain"
import { usePostImpressionTracking } from "@/hooks/use-post-impression-tracking"

export function PostTimeline({
  posts,
  surface,
}: {
  readonly posts: readonly PublicPostRead[]
  readonly surface: Exclude<PostViewSurface, "detail">
}) {
  const firstPostId = posts[0]?.id
  const postIdentity = posts.map((post) => post.id).join("\0")
  const timelineRef = usePostImpressionTracking({ postIdentity, surface })

  return (
    <Timeline ref={timelineRef} className="gap-0" aria-orientation={undefined}>
      {posts.map((post) => (
        <TimelineItem
          key={post.id}
          id={`timeline-post-${post.id}`}
          data-post-view-id={post.id}
          className="min-w-0 gap-4"
        >
          <TimelineDot className="mt-3" />
          <TimelineConnector className="top-6" />
          <TimelineContent className="min-w-0">
            <PostView post={post} priority={post.id === firstPostId} className="border-0 pb-0" />
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  )
}
