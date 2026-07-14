import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { basename, extname, relative, resolve } from "node:path"

import { BSON } from "bson"

import { documentId, isLegacyDocument, referenceIds, stringField } from "./legacy-values"
import type {
  LegacyCollection,
  LegacyDocument,
  LegacySource,
  MigrationIssue,
  SourceFile,
  SourceInventory,
} from "./model"

const collectionAliases: Record<string, LegacyCollection> = {
  user: "users",
  users: "users",
  post: "posts",
  posts: "posts",
  comment: "comments",
  comments: "comments",
  reaction: "reactions",
  reactions: "reactions",
  image: "images",
  images: "images",
  video: "videos",
  videos: "videos",
  account: "accounts",
  accounts: "accounts",
  session: "sessions",
  sessions: "sessions",
  verificationtoken: "verificationTokens",
  verificationtokens: "verificationTokens",
  verification_token: "verificationTokens",
}
const imageExtensions = new Set([".avif", ".gif", ".heic", ".jpeg", ".jpg", ".png", ".webp"])
const videoExtensions = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"])

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
      .map((entry) => {
        const path = resolve(directory, entry.name)
        return entry.isDirectory() ? walk(path) : Promise.resolve([path])
      }),
  )
  return nested.flat()
}

async function checksum(path: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

function inferCollection(path: string) {
  const extension = extname(path).toLocaleLowerCase("en-US")
  if (extension !== ".bson" && extension !== ".json" && extension !== ".jsonl") return undefined
  const name = basename(path, extension)
    .replace(/\.metadata$/i, "")
    .replaceAll(/[-_]/g, "")
    .toLocaleLowerCase("en-US")
  return collectionAliases[name]
}

function classify(path: string, collection?: LegacyCollection): SourceFile["kind"] {
  if (collection) return "collection"
  const extension = extname(path).toLocaleLowerCase("en-US")
  if (imageExtensions.has(extension)) return "image"
  if (videoExtensions.has(extension)) return "video"
  return "other"
}

function readBsonDocuments(data: Uint8Array) {
  const documents: LegacyDocument[] = []
  let offset = 0
  while (offset < data.byteLength) {
    if (offset + 4 > data.byteLength) throw new Error(`Truncated BSON document at byte ${offset}.`)
    const length = new DataView(data.buffer, data.byteOffset + offset, 4).getInt32(0, true)
    if (length < 5 || offset + length > data.byteLength) {
      throw new Error(`Invalid BSON document length ${length} at byte ${offset}.`)
    }
    const document = BSON.deserialize(data.subarray(offset, offset + length))
    if (!isLegacyDocument(document)) {
      throw new Error(`BSON value at byte ${offset} is not a document.`)
    }
    documents.push(document)
    offset += length
  }
  return documents
}

async function readCollection(path: string) {
  const extension = extname(path).toLocaleLowerCase("en-US")
  const data = await readFile(path)
  if (extension === ".bson") return readBsonDocuments(data)
  const text = data.toString("utf8")
  if (extension === ".jsonl") {
    const values: unknown[] = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
    if (!values.every(isLegacyDocument)) {
      throw new Error(`${path} contains a non-document JSON line.`)
    }
    return values
  }
  const parsed: unknown = JSON.parse(text)
  if (Array.isArray(parsed)) {
    if (!parsed.every(isLegacyDocument)) {
      throw new Error(`${path} contains a non-document value.`)
    }
    return parsed
  }
  if (parsed && typeof parsed === "object" && "documents" in parsed) {
    const documents = parsed.documents
    if (Array.isArray(documents) && documents.every(isLegacyDocument)) return documents
  }
  if (!isLegacyDocument(parsed)) throw new Error(`${path} does not contain a JSON document.`)
  return [parsed]
}

function sourceIssues(
  collections: LegacySource["collections"],
  mediaByName: Map<string, SourceFile>,
) {
  const issues: MigrationIssue[] = []
  const users = collections.users ?? []
  const userIds = new Set(users.map(documentId).filter(Boolean))
  const duplicate = (label: "email" | "username") => {
    const seen = new Map<string, string>()
    for (const user of users) {
      const id = documentId(user) ?? "unknown"
      const value = stringField(user, label)?.toLocaleLowerCase("en-US")
      if (!value) continue
      const prior = seen.get(value)
      if (prior) {
        issues.push({
          severity: "error",
          code: `duplicate-${label}`,
          collection: "users",
          legacyId: id,
          message: `${label} collides with legacy user ${prior}.`,
        })
      } else seen.set(value, id)
    }
  }
  duplicate("email")
  duplicate("username")

  for (const post of collections.posts ?? []) {
    const id = documentId(post) ?? "unknown"
    const authorId = stringField(post, "authorId", "userId", "user", "author")
    if (!authorId || !userIds.has(authorId)) {
      issues.push({
        severity: "error",
        code: "missing-post-author",
        collection: "posts",
        legacyId: id,
        message: `Post author ${authorId ?? "none"} does not exist.`,
      })
    }
  }

  const referencedMedia = new Set<string>()
  for (const post of collections.posts ?? []) {
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
  for (const collection of ["images", "videos"] as const) {
    for (const media of collections[collection] ?? []) {
      const id = documentId(media) ?? "unknown"
      const filename = stringField(media, "filename", "fileName", "path", "key", "src")
      if (!referencedMedia.has(id)) {
        const archivedFile = filename
          ? mediaByName.get(basename(filename).toLocaleLowerCase("en-US"))
          : undefined
        issues.push({
          severity: "warning",
          code: "orphan-media-record",
          collection,
          legacyId: id,
          message: "Media record is not referenced by a post.",
          path: archivedFile?.relativePath,
        })
      }
      if (filename && !mediaByName.has(basename(filename).toLocaleLowerCase("en-US"))) {
        issues.push({
          severity: "error",
          code: "missing-media-file",
          collection,
          legacyId: id,
          message: `Archive file ${filename} is missing.`,
        })
      }
    }
  }
  const recordedFiles = new Set(
    [...(collections.images ?? []), ...(collections.videos ?? [])]
      .map((media) => stringField(media, "filename", "fileName", "path", "key", "src"))
      .filter((value): value is string => value !== undefined)
      .map((value) => basename(value).toLocaleLowerCase("en-US")),
  )
  for (const [name, file] of mediaByName) {
    if (!recordedFiles.has(name)) {
      issues.push({
        severity: "warning",
        code: "unmatched-archive-file",
        message: "Archive media file has no database record and will be quarantined.",
        path: file.relativePath,
      })
    }
  }
  for (const collection of ["accounts", "sessions", "verificationTokens"] as const) {
    const count = collections[collection]?.length ?? 0
    if (count > 0) {
      issues.push({
        severity: "warning",
        code: "discarded-auth-records",
        collection,
        message: `${count} legacy authentication records are intentionally not imported.`,
      })
    }
  }
  return issues
}

export async function loadLegacySource(sourcePath: string, limit?: number): Promise<LegacySource> {
  const source = resolve(sourcePath)
  if (!(await stat(source)).isDirectory())
    throw new Error("The migration source must be a directory.")
  const paths = await walk(source)
  const files = await Promise.all(
    paths.map(async (path): Promise<SourceFile> => {
      const collection = inferCollection(path)
      const details = await stat(path)
      return {
        path,
        relativePath: relative(source, path),
        bytes: details.size,
        checksum: await checksum(path),
        kind: classify(path, collection),
        collection,
      }
    }),
  )
  const sortedFiles = files.toSorted((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )
  const collections: LegacySource["collections"] = {}
  const collectionFiles = sortedFiles.filter(
    (file): file is SourceFile & { collection: LegacyCollection } => file.collection !== undefined,
  )
  const loadedCollections = await Promise.all(
    collectionFiles.map(async (file) => ({ file, documents: await readCollection(file.path) })),
  )
  for (const { file, documents } of loadedCollections) {
    collections[file.collection] = [...(collections[file.collection] ?? []), ...documents].slice(
      0,
      limit,
    )
  }
  const mediaFiles = sortedFiles.filter((file) => file.kind === "image" || file.kind === "video")
  const mediaByName = new Map(
    mediaFiles.map((file) => [basename(file.path).toLocaleLowerCase("en-US"), file]),
  )
  const fingerprint = createHash("sha256")
    .update(
      sortedFiles.map((file) => `${file.relativePath}:${file.bytes}:${file.checksum}`).join("\n"),
    )
    .digest("hex")
  const issues = sourceIssues(collections, mediaByName)
  const inventory: SourceInventory = {
    source,
    fingerprint,
    generatedAt: new Date().toISOString(),
    collections: Object.fromEntries(
      Object.entries(collections).map(([collection, documents]) => [collection, documents.length]),
    ),
    files: sortedFiles,
    mediaFiles: {
      images: mediaFiles.filter((file) => file.kind === "image").length,
      videos: mediaFiles.filter((file) => file.kind === "video").length,
      bytes: mediaFiles.reduce((total, file) => total + file.bytes, 0),
    },
    issues,
  }
  return { inventory, collections, mediaByName }
}
