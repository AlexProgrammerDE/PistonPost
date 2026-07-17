import { PostView } from "@/components/post-view"
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineItem,
} from "@/components/ui/timeline"
import type { PublicPostRead } from "@/db/public-read-model"

export function PostTimeline({ posts }: { readonly posts: readonly PublicPostRead[] }) {
  const firstPostId = posts[0]?.id

  return (
    <Timeline className="gap-0" aria-orientation={undefined}>
      {posts.map((post) => (
        <TimelineItem key={post.id} id={`timeline-post-${post.id}`} className="min-w-0 gap-4">
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
