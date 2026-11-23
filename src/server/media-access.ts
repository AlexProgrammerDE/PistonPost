import { isActiveAdministrator } from "@/server/request-session"

/**
 * Who may load a media file. Public media can be cached publicly. Media on an unpublished post,
 * such as a draft or a post hidden by moderation, and media of a banned author stay with the
 * owner and active administrators. Administrators can edit and moderate other users' posts, so
 * they need to see the media too. Those responses are private and uncached.
 */
export type MediaAudience = "public" | "owner-or-admin"

export function mediaAudience(media: {
  readonly published: boolean
  readonly authorBanned: boolean
}): MediaAudience {
  return media.published && !media.authorBanned ? "public" : "owner-or-admin"
}

type MediaViewer = {
  readonly id: string
  readonly role?: string | null
  readonly banned?: boolean | null
  readonly banExpires?: Date | null
}

export function canViewMedia(
  audience: MediaAudience,
  ownerId: string | null,
  viewer: MediaViewer | null | undefined,
  now = new Date(),
) {
  if (audience === "public") return true
  if (!viewer) return false
  if (ownerId !== null && viewer.id === ownerId) return true
  return isActiveAdministrator(viewer, now)
}
