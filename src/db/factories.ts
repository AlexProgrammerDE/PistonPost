import { ulid } from "ulid"

import type { Post } from "@/domain"

import type { user } from "./schema"

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
