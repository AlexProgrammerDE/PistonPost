import { describe, expect, it } from "bun:test"

import type { Actor, Post } from "./model"
import { canDeleteComment, canFollowUser, canManagePost, postDetailAccess } from "./policy"

const anonymous: Actor = { kind: "anonymous" }
const owner: Actor = { kind: "authenticated", userId: "owner", roles: [] }
const other: Actor = { kind: "authenticated", userId: "other", roles: [] }
const admin: Actor = { kind: "authenticated", userId: "admin", roles: ["admin"] }

function post(overrides: Partial<Post> = {}): Post {
  const createdAt = new Date("2026-01-01T00:00:00.000Z")
  return {
    id: "post",
    authorId: "owner",
    type: "text",
    status: "published",
    visibility: "public",
    title: "Title",
    textContent: "Body",
    createdAt,
    updatedAt: createdAt,
    publishedAt: createdAt,
    deletedAt: null,
    moderationReason: null,
    version: 1,
    ...overrides,
  }
}

describe("post policy", () => {
  const actors = { anonymous, owner, admin, other } as const

  it("shows published public and unlisted posts to every viewer", () => {
    for (const visibility of ["public", "unlisted"] as const) {
      for (const actor of Object.values(actors)) {
        expect(postDetailAccess(actor, { ...post({ visibility }), authorBanned: false })).toBe(
          "post",
        )
      }
    }
  })

  it("shows a moderated post as a tombstone to the owner and administrators only", () => {
    const record = { ...post({ status: "moderated" }), authorBanned: false }
    expect(postDetailAccess(anonymous, record)).toBe("not-found")
    expect(postDetailAccess(other, record)).toBe("not-found")
    expect(postDetailAccess(owner, record)).toBe("tombstone")
    expect(postDetailAccess(admin, record)).toBe("tombstone")
  })

  it("keeps draft, processing, failed, and deleted posts off the post page", () => {
    for (const status of ["draft", "processing", "failed", "deleted"] as const) {
      for (const actor of Object.values(actors)) {
        expect(postDetailAccess(actor, { ...post({ status }), authorBanned: false })).toBe(
          "not-found",
        )
      }
    }
  })

  it("hides a banned author's published post from everyone", () => {
    const record = { ...post(), authorBanned: true }
    for (const actor of Object.values(actors)) {
      expect(postDetailAccess(actor, record)).toBe("not-found")
    }
  })

  it("still shows administrators the tombstone of a banned author's moderated post", () => {
    const record = { ...post({ status: "moderated" }), authorBanned: true }
    expect(postDetailAccess(admin, record)).toBe("tombstone")
    expect(postDetailAccess(other, record)).toBe("not-found")
  })

  it("allows only owners and administrators to manage posts and delete comments", () => {
    expect(canManagePost(owner, post())).toBeTrue()
    expect(canManagePost(admin, post())).toBeTrue()
    expect(canManagePost(other, post())).toBeFalse()
    expect(canDeleteComment(owner, "owner")).toBeTrue()
    expect(canDeleteComment(admin, "owner")).toBeTrue()
    expect(canDeleteComment(other, "owner")).toBeFalse()
  })

  it("prevents users from following themselves", () => {
    expect(canFollowUser("viewer", "author")).toBeTrue()
    expect(canFollowUser("viewer", "viewer")).toBeFalse()
  })
})
