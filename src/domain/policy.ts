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

export function canViewPost(actor: Actor, post: Post) {
  if (post.status === "published") {
    return true
  }

  return canManagePost(actor, post)
}

export function canDeleteComment(actor: Actor, commentAuthorId: string) {
  return isOwner(actor, commentAuthorId) || isAdministrator(actor)
}

export function canFollowUser(viewerId: string, targetUserId: string) {
  return viewerId !== targetUserId
}
