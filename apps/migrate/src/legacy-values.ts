import { ObjectId } from "bson"

import type { LegacyDocument } from "./model"

export function isLegacyDocument(value: unknown): value is LegacyDocument {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function legacyString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (value instanceof ObjectId) return value.toHexString()
  if (value && typeof value === "object" && "toHexString" in value) {
    const method = value.toHexString
    if (typeof method === "function") return String(method.call(value))
  }
  if (value && typeof value === "object" && "$oid" in value) {
    return legacyString(value.$oid)
  }
  return undefined
}

export function field(document: LegacyDocument, ...names: string[]) {
  for (const name of names) {
    if (document[name] !== undefined && document[name] !== null) return document[name]
  }
  return undefined
}

export function stringField(document: LegacyDocument, ...names: string[]) {
  return legacyString(field(document, ...names))
}

export function booleanField(document: LegacyDocument, ...names: string[]) {
  const value = field(document, ...names)
  if (typeof value === "boolean") return value
  if (value === 1 || value === "true" || value === "1") return true
  if (value === 0 || value === "false" || value === "0") return false
  return undefined
}

export function dateField(document: LegacyDocument, ...names: string[]) {
  const value = field(document, ...names)
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (value && typeof value === "object" && "$date" in value) {
    return dateValue(value.$date)
  }
  return dateValue(value)
}

function dateValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

export function arrayField(document: LegacyDocument, ...names: string[]) {
  const value = field(document, ...names)
  return Array.isArray(value) ? value : []
}

export function documentId(document: LegacyDocument) {
  return stringField(document, "_id", "id", "uuid")
}

export function referenceIds(document: LegacyDocument, ...names: string[]) {
  return arrayField(document, ...names)
    .map(
      (value) =>
        legacyString(value) ??
        (isLegacyDocument(value)
          ? legacyString(field(value, "_id", "id", "imageId", "mediaId", "videoId"))
          : undefined),
    )
    .filter((value): value is string => value !== undefined)
}

export function legacyDateFromId(id: string | undefined) {
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return undefined
  return new Date(Number.parseInt(id.slice(0, 8), 16) * 1000)
}

export function legacyMediaFilename(document: LegacyDocument) {
  const explicit = stringField(document, "filename", "fileName", "path", "key", "src", "url")
  if (explicit) return explicit
  const id = documentId(document)
  const extension = stringField(document, "extension")?.replace(/^\./, "")
  return id && extension ? `${id}.${extension}` : undefined
}
