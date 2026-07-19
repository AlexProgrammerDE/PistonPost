import { PostAuthorAvatar, PostView } from "@/components/post-view"
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
import { activeSharedViewTransitionKind } from "@/lib/view-transitions"

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
    <Timeline
      ref={timelineRef}
      className="gap-0 [--timeline-connector-thickness:0.0625rem] [--timeline-dot-size:2.25rem] sm:[--timeline-dot-size:2.75rem]"
      aria-orientation={undefined}
    >
      {posts.map((post) => {
        const activeProfileTransition = activeSharedViewTransitionKind({
          kind: "profile",
          sourcePostId: post.id,
          username: post.author.username,
        })

        return (
          <TimelineItem
            key={post.id}
            id={`timeline-post-${post.id}`}
            data-post-view-id={post.id}
            data-view-transition-post={post.id}
            data-view-transition-active={activeProfileTransition}
            className="min-w-0 gap-3 pb-10 sm:gap-4"
          >
            <TimelineDot>
              <PostAuthorAvatar
                post={post}
                sizes="(min-width: 640px) 2.5rem, 2rem"
                avatarClassName="size-8 sm:size-10"
              />
            </TimelineDot>
            <TimelineConnector />
            <TimelineContent className="min-w-0">
              <PostView
                post={post}
                priority={post.id === firstPostId}
                authorAvatar={null}
                className="border-0 pb-0"
              />
            </TimelineContent>
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}
