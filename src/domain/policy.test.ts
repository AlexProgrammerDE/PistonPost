import { describe, expect, it } from "bun:test"

import type { Actor, Post } from "./model"
import { canDeleteComment, canFollowUser, canManagePost, canViewPost } from "./policy"

const anonymous: Actor = { kind: "anonymous" }
const owner: Actor = { kind: "authenticated", userId: "owner", roles: [] }
const other: Actor = { kind: "authenticated", userId: "other", roles: [] }
const admin: Actor = { kind: "authenticated", userId: "admin", roles: ["admin"] }

function post(overrides: Partial<Post> = {}): Post {
  const createdAt = new Date("2026-01-01T00:00:00.000Z")
  return {
    id: "post",
    legacyId: null,
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
  it("shows published public and unlisted posts to direct viewers", () => {
    expect(canViewPost(anonymous, post())).toBeTrue()
    expect(canViewPost(anonymous, post({ visibility: "unlisted" }))).toBeTrue()
  })

  it("limits draft, failed, deleted, and moderated posts to owners and administrators", () => {
    for (const status of ["draft", "failed", "deleted", "moderated"] as const) {
      const record = post({ status })
      expect(canViewPost(anonymous, record)).toBeFalse()
      expect(canViewPost(other, record)).toBeFalse()
      expect(canViewPost(owner, record)).toBeTrue()
      expect(canViewPost(admin, record)).toBeTrue()
    }
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
