import type { Post } from "@pistonpost/domain"
import { ulid } from "ulid"

import type { comments, mediaAssets, profiles, user } from "./schema"

type ProfileInsert = typeof profiles.$inferInsert
type MediaAssetInsert = typeof mediaAssets.$inferInsert
type CommentInsert = typeof comments.$inferInsert
type UserInsert = typeof user.$inferInsert

export function createPost(overrides: Partial<Post> = {}): Post {
  const now = new Date("2026-01-01T00:00:00.000Z")
  return {
    id: ulid(now.getTime()),
    legacyId: null,
    authorId: "test-user",
    type: "text",
    status: "draft",
    visibility: "public",
    title: "Test post",
    textContent: "Test post content",
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    deletedAt: null,
    moderationReason: null,
    version: 1,
    ...overrides,
  }
}

export function createUser(overrides: Partial<UserInsert> = {}): UserInsert {
  const now = new Date("2026-01-01T00:00:00.000Z")
  return {
    id: "test-user",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function createProfile(overrides: Partial<ProfileInsert> = {}): ProfileInsert {
  return {
    userId: "test-user",
    username: "test-user",
    normalizedUsername: "test-user",
    ...overrides,
  }
}

export function createMediaAsset(overrides: Partial<MediaAssetInsert> = {}): MediaAssetInsert {
  return {
    id: ulid(new Date("2026-01-01T00:00:00.000Z").getTime()),
    ownerId: "test-user",
    kind: "image",
    provider: "r2",
    status: "ready",
    originalFilename: "test.jpg",
    mimeType: "image/jpeg",
    byteSize: 1,
    ...overrides,
  }
}

export function createComment(overrides: Partial<CommentInsert> = {}): CommentInsert {
  return {
    id: ulid(new Date("2026-01-01T00:00:00.000Z").getTime()),
    postId: "test-post",
    authorId: "test-user",
    content: "Test comment",
    ...overrides,
  }
}
