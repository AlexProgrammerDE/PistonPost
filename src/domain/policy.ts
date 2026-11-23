import type { Actor, Post } from "./model"

export function isAdministrator(actor: Actor) {
  return actor.kind === "authenticated" && actor.roles.includes("admin")
}

export function isOwner(actor: Actor, ownerId: string) {
  return actor.kind === "authenticated" && actor.userId === ownerId
}

export function canManagePost(actor: Actor, post: Pick<Post, "authorId">) {
  return isOwner(actor, post.authorId) || isAdministrator(actor)
}

/**
 * What a viewer gets when they open a post by its ID.
 *
 * - `post`: the full post. Only published posts from authors without an active ban.
 * - `tombstone`: a notice that the post is hidden. Only moderated posts, and only for the owner
 *   and administrators, so they can see what was hidden and why.
 * - `not-found`: everyone else, and every draft, processing, failed, or deleted post. Owners
 *   reach their unfinished posts through the editor, not the post page.
 *
 * The actor must already reflect bans: a banned viewer is anonymous and a banned administrator
 * has no admin role. See `requestActor`.
 */
export type PostDetailAccess = "post" | "tombstone" | "not-found"

export function postDetailAccess(
  actor: Actor,
  post: Pick<Post, "authorId" | "status"> & { readonly authorBanned: boolean },
): PostDetailAccess {
  if (post.status === "published") return post.authorBanned ? "not-found" : "post"
  if (post.status === "moderated" && canManagePost(actor, post)) return "tombstone"
  return "not-found"
}

export function canDeleteComment(actor: Actor, commentAuthorId: string) {
  return isOwner(actor, commentAuthorId) || isAdministrator(actor)
}

export function canFollowUser(viewerId: string, targetUserId: string) {
  return viewerId !== targetUserId
}
