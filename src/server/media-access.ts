import { isActiveAdministrator } from "@/server/request-session"

/**
 * Who may load a media file. Public media can be cached publicly. Media on an unpublished post
 * stays with its owner. Media of a banned author stays hidden from the public, while the owner
 * and active administrators keep private, uncached access.
 */
export type MediaAudience = "public" | "owner" | "owner-or-admin"

export function mediaAudience(media: {
  readonly published: boolean
  readonly authorBanned: boolean
}): MediaAudience {
  if (!media.published) return "owner"
  return media.authorBanned ? "owner-or-admin" : "public"
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
  return audience === "owner-or-admin" && isActiveAdministrator(viewer, now)
}
