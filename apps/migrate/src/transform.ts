import { createHash } from "node:crypto"
import { basename, extname } from "node:path"

import {
  arrayField,
  booleanField,
  dateField,
  documentId,
  field,
  isLegacyDocument,
  legacyString,
  referenceIds,
  stringField,
} from "./legacy-values"
import type { LegacyDocument, LegacySource, MigrationIssue } from "./model"

export type ImportedUser = {
  id: string
  legacyId: string
  name: string
  email: string
  emailVerified: boolean
  username: string
  normalizedUsername: string
  role: "admin" | "user"
  image: string | null
  bio: string | null
  website: string | null
  location: string | null
  theme: "system" | "light" | "dark"
  createdAt: Date
}

export type ImportedMedia = {
  id: string
  legacyId: string
  kind: "image" | "video"
  ownerId: string | null
  sourcePath: string
  objectKey: string
  checksum: string
  filename: string
  mimeType: string
  byteSize: number
  width: number | null
  height: number | null
  duration: number | null
  altText: string | null
  createdAt: Date
}

export type ImportedPost = {
  id: string
  legacyId: string
  authorId: string
  type: "text" | "images" | "video"
  status: "published" | "failed"
  visibility: "public" | "unlisted"
  title: string
  textContent: string | null
  tags: Array<{ id: string; name: string; normalized: string }>
  mediaIds: string[]
  createdAt: Date
  updatedAt: Date
  publishedAt: Date
}

export type ImportedComment = {
  id: string
  legacyId: string
  postId: string
  authorId: string
  content: string
  createdAt: Date
  updatedAt: Date
}

export type ImportedReaction = {
  postId: string
  userId: string
  type: "like" | "dislike" | "heart"
  createdAt: Date
}

export type TransformedMigration = {
  users: ImportedUser[]
  media: ImportedMedia[]
  posts: ImportedPost[]
  comments: ImportedComment[]
  reactions: ImportedReaction[]
  issues: MigrationIssue[]
}

function deterministicId(namespace: string, legacyId: string) {
  const hex = createHash("sha256").update(`${namespace}:${legacyId}`).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function validPublicId(value: string) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value)
}

function normalizedTag(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^#+/, "")
    .replaceAll(/\s+/g, "-")
    .toLocaleLowerCase("en-US")
    .slice(0, 64)
}

function tagValues(post: LegacyDocument) {
  return arrayField(post, "tags", "tagList")
    .map((value) =>
      typeof value === "string"
        ? value
        : isLegacyDocument(value)
          ? stringField(value, "name", "label", "slug")
          : undefined,
    )
    .filter((value): value is string => value !== undefined)
}

function mimeFor(path: string, kind: "image" | "video") {
  const extension = extname(path).toLocaleLowerCase("en-US")
  const known: Record<string, string> = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  }
  return known[extension] ?? `${kind}/octet-stream`
}

function numericField(document: LegacyDocument, ...names: string[]) {
  const value = field(document, ...names)
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function mediaFilename(document: LegacyDocument) {
  return stringField(document, "filename", "fileName", "path", "key", "src", "url")
}

function collisionUsername(base: string, used: Set<string>) {
  const safeBase =
    base
      .normalize("NFKC")
      .replaceAll(/[^a-zA-Z0-9_-]/g, "-")
      .replaceAll(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "legacy-user"
  let candidate = safeBase
  for (let suffix = 2; used.has(candidate.toLocaleLowerCase("en-US")); suffix += 1) {
    const marker = `-${suffix}`
    candidate = `${safeBase.slice(0, 32 - marker.length)}${marker}`
  }
  used.add(candidate.toLocaleLowerCase("en-US"))
  return candidate
}

export function transformLegacySource(source: LegacySource, adminIds = new Set<string>()) {
  const issues = [...source.inventory.issues]
  const users: ImportedUser[] = []
  const userIdMap = new Map<string, string>()
  const usedUsernames = new Set<string>()
  const usedEmails = new Set<string>()
  const sortedUsers = (source.collections.users ?? []).toSorted((left, right) =>
    (documentId(left) ?? "").localeCompare(documentId(right) ?? ""),
  )
  for (const document of sortedUsers) {
    const legacyId = documentId(document)
    const email = stringField(document, "email")?.toLocaleLowerCase("en-US")
    if (!legacyId || !email) {
      issues.push({
        severity: "error",
        code: "invalid-user",
        collection: "users",
        legacyId,
        message: "User has no stable ID or email address.",
      })
      continue
    }
    if (usedEmails.has(email)) continue
    usedEmails.add(email)
    const requestedUsername =
      stringField(document, "username", "userName", "handle") ?? email.split("@", 1)[0] ?? legacyId
    const username = collisionUsername(requestedUsername, usedUsernames)
    if (username.toLocaleLowerCase("en-US") !== requestedUsername.toLocaleLowerCase("en-US")) {
      issues.push({
        severity: "warning",
        code: "resolved-username-collision",
        collection: "users",
        legacyId,
        message: `Username ${requestedUsername} was imported as ${username}.`,
      })
    }
    const createdAt = dateField(document, "createdAt", "created", "date") ?? new Date(0)
    const id = validPublicId(legacyId) ? legacyId : deterministicId("user", legacyId)
    userIdMap.set(legacyId, id)
    const themeValue = stringField(document, "theme", "themePreference")
    const theme = themeValue === "light" || themeValue === "dark" ? themeValue : "system"
    users.push({
      id,
      legacyId,
      name: stringField(document, "name", "displayName") ?? username,
      email,
      emailVerified:
        booleanField(document, "emailVerified", "verified") === true ||
        dateField(document, "emailVerifiedAt") !== undefined,
      username,
      normalizedUsername: username.toLocaleLowerCase("en-US"),
      role: adminIds.has(legacyId) ? "admin" : "user",
      image: stringField(document, "image", "avatar", "avatarUrl") ?? null,
      bio: stringField(document, "bio", "description") ?? null,
      website: stringField(document, "website", "url") ?? null,
      location: stringField(document, "location") ?? null,
      theme,
      createdAt,
    })
  }

  const media: ImportedMedia[] = []
  const mediaIdMap = new Map<string, string>()
  const referencedMedia = new Set<string>()
  for (const post of source.collections.posts ?? []) {
    for (const id of [
      ...referenceIds(post, "images", "imageIds", "media", "mediaIds"),
      ...referenceIds(post, "videos", "videoIds"),
    ])
      referencedMedia.add(id)
    const singularImage = stringField(post, "image", "imageId", "mediaId")
    const singularVideo = stringField(post, "video", "videoId")
    if (singularImage) referencedMedia.add(singularImage)
    if (singularVideo) referencedMedia.add(singularVideo)
  }
  for (const [collection, kind] of [
    ["images", "image"],
    ["videos", "video"],
  ] as const) {
    for (const document of source.collections[collection] ?? []) {
      const legacyId = documentId(document)
      if (!legacyId) continue
      if (!referencedMedia.has(legacyId)) continue
      const filename = mediaFilename(document)
      const file = filename
        ? source.mediaByName.get(basename(filename).toLocaleLowerCase("en-US"))
        : undefined
      if (!file) continue
      const id = deterministicId("media", legacyId)
      mediaIdMap.set(legacyId, id)
      const checksum = file.checksum
      const ownerLegacyId = stringField(document, "ownerId", "userId", "authorId", "user")
      media.push({
        id,
        legacyId,
        kind,
        ownerId: ownerLegacyId ? (userIdMap.get(ownerLegacyId) ?? null) : null,
        sourcePath: file.path,
        objectKey: `legacy/${kind}/${checksum}-${basename(file.path).replaceAll(/[^a-zA-Z0-9._-]/g, "-")}`,
        checksum,
        filename: basename(file.path),
        mimeType:
          stringField(document, "mimeType", "mime", "contentType") ?? mimeFor(file.path, kind),
        byteSize: file.bytes,
        width: numericField(document, "width"),
        height: numericField(document, "height"),
        duration: numericField(document, "duration", "durationMs"),
        altText: stringField(document, "alt", "altText", "description") ?? null,
        createdAt: dateField(document, "createdAt", "created", "date") ?? new Date(0),
      })
    }
  }

  const posts: ImportedPost[] = []
  const postIdMap = new Map<string, string>()
  for (const document of source.collections.posts ?? []) {
    const legacyId = documentId(document)
    const authorLegacyId = stringField(document, "authorId", "userId", "user", "author")
    const authorId = authorLegacyId ? userIdMap.get(authorLegacyId) : undefined
    if (!legacyId || !authorId) continue
    const imageReferences = referenceIds(document, "images", "imageIds", "media", "mediaIds")
    const videoReferences = referenceIds(document, "videos", "videoIds")
    const singularImage = stringField(document, "image", "imageId", "mediaId")
    const singularVideo = stringField(document, "video", "videoId")
    if (singularImage) imageReferences.push(singularImage)
    if (singularVideo) videoReferences.push(singularVideo)
    const allReferences = [...imageReferences, ...videoReferences]
    const missing = allReferences.filter((id) => !mediaIdMap.has(id))
    const explicitType = stringField(document, "type", "postType")
    const type =
      explicitType === "video" || videoReferences.length > 0
        ? "video"
        : explicitType === "image" || explicitType === "images" || imageReferences.length > 0
          ? "images"
          : "text"
    const id = validPublicId(legacyId) ? legacyId : deterministicId("post", legacyId)
    postIdMap.set(legacyId, id)
    const createdAt = dateField(document, "createdAt", "created", "date") ?? new Date(0)
    const tags = tagValues(document)
      .map((name) => ({ name, normalized: normalizedTag(name) }))
      .filter(({ normalized }) => normalized.length > 0)
      .filter(
        ({ normalized }, index, values) =>
          values.findIndex((candidate) => candidate.normalized === normalized) === index,
      )
      .map(({ name, normalized }) => ({ id: deterministicId("tag", normalized), name, normalized }))
    posts.push({
      id,
      legacyId,
      authorId,
      type,
      status: missing.length > 0 ? "failed" : "published",
      visibility:
        booleanField(document, "unlisted", "isUnlisted") === true ||
        stringField(document, "visibility") === "unlisted"
          ? "unlisted"
          : "public",
      title: stringField(document, "title", "name") ?? `Legacy post ${legacyId}`,
      textContent:
        type === "text"
          ? (stringField(document, "text", "body", "content", "description") ?? "")
          : (stringField(document, "text", "body", "description") ?? null),
      tags,
      mediaIds: allReferences
        .map((mediaId) => mediaIdMap.get(mediaId))
        .filter((mediaId): mediaId is string => mediaId !== undefined),
      createdAt,
      updatedAt: dateField(document, "updatedAt", "updated") ?? createdAt,
      publishedAt: dateField(document, "publishedAt") ?? createdAt,
    })
  }

  const comments: ImportedComment[] = []
  for (const document of source.collections.comments ?? []) {
    const legacyId = documentId(document)
    const postLegacyId = stringField(document, "postId", "post")
    const authorLegacyId = stringField(document, "authorId", "userId", "user", "author")
    const postId = postLegacyId ? postIdMap.get(postLegacyId) : undefined
    const authorId = authorLegacyId ? userIdMap.get(authorLegacyId) : undefined
    const content = stringField(document, "content", "text", "body")
    if (!legacyId || !postId || !authorId || !content) {
      issues.push({
        severity: "error",
        code: "invalid-comment-reference",
        collection: "comments",
        legacyId,
        message: "Comment has a missing post, author, ID, or body.",
      })
      continue
    }
    const createdAt =
      dateField(document, "createdAt", "created", "date") ??
      (/^[a-f0-9]{24}$/i.test(legacyId)
        ? new Date(Number.parseInt(legacyId.slice(0, 8), 16) * 1000)
        : new Date(0))
    comments.push({
      id: validPublicId(legacyId) ? legacyId : deterministicId("comment", legacyId),
      legacyId,
      postId,
      authorId,
      content,
      createdAt,
      updatedAt: dateField(document, "updatedAt", "updated") ?? createdAt,
    })
  }

  const reactions = new Map<string, ImportedReaction>()
  const addReaction = (
    postLegacyId: string | undefined,
    userLegacyId: string | undefined,
    type: ImportedReaction["type"],
    createdAt = new Date(0),
  ) => {
    const postId = postLegacyId ? postIdMap.get(postLegacyId) : undefined
    const userId = userLegacyId ? userIdMap.get(userLegacyId) : undefined
    if (!postId || !userId) return
    reactions.set(`${postId}:${userId}:${type}`, { postId, userId, type, createdAt })
  }
  for (const document of source.collections.reactions ?? []) {
    const type = stringField(document, "type", "reaction")
    if (type === "like" || type === "dislike" || type === "heart") {
      addReaction(
        stringField(document, "postId", "post"),
        stringField(document, "userId", "user", "authorId"),
        type,
        dateField(document, "createdAt", "created") ?? new Date(0),
      )
    }
  }
  for (const post of source.collections.posts ?? []) {
    const postLegacyId = documentId(post)
    for (const [names, type] of [
      [["likes", "likedBy"], "like"],
      [["dislikes", "dislikedBy"], "dislike"],
      [["hearts", "heartedBy", "loves"], "heart"],
    ] as const) {
      const values = arrayField(post, ...names)
      for (const value of values) {
        addReaction(
          postLegacyId,
          isLegacyDocument(value)
            ? legacyString(field(value, "_id", "id", "userId"))
            : legacyString(value),
          type,
        )
      }
    }
  }

  return {
    users,
    media,
    posts,
    comments,
    reactions: [...reactions.values()],
    issues,
  } satisfies TransformedMigration
}
