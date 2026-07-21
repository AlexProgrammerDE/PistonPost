export type UploadKind = "image" | "video"

export type UploadItem = {
  clientId: string
  file: File
  filename: string
  mimeType: string
  kind: UploadKind
  previewUrl: string | null
  assetId: string | null
  altText: string
  progress: number
  thumbnailTimestampPct: number | null
  status: "queued" | "uploading" | "processing" | "ready" | "failed"
  error: string | null
}

export type UploadAction =
  | { type: "add"; items: UploadItem[] }
  | { type: "remove"; clientId: string }
  | { type: "reorder"; activeId: string; overId: string }
  | { type: "uploading"; clientId: string; assetId: string }
  | { type: "progress"; clientId: string; progress: number }
  | { type: "alt-text"; clientId: string; altText: string }
  | { type: "processing"; clientId: string }
  | { type: "ready"; clientId: string }
  | { type: "failed"; clientId: string; error: string }
  | { type: "reset" }

function updateItem(
  items: UploadItem[],
  clientId: string,
  update: (item: UploadItem) => UploadItem,
) {
  return items.map((item) => (item.clientId === clientId ? update(item) : item))
}

export function mediaUploadReducer(items: UploadItem[], action: UploadAction): UploadItem[] {
  switch (action.type) {
    case "add":
      return [...items, ...action.items]
    case "remove":
      return items.filter((item) => item.clientId !== action.clientId)
    case "reorder": {
      const from = items.findIndex((item) => item.clientId === action.activeId)
      const to = items.findIndex((item) => item.clientId === action.overId)
      if (from < 0 || to < 0 || from === to) return items
      const reordered = [...items]
      const [moved] = reordered.splice(from, 1)
      if (!moved) return items
      reordered.splice(to, 0, moved)
      return reordered
    }
    case "uploading":
      return updateItem(items, action.clientId, (item) => ({
        ...item,
        assetId: action.assetId,
        progress: 0,
        status: "uploading",
        error: null,
      }))
    case "progress":
      return updateItem(items, action.clientId, (item) => ({
        ...item,
        progress: Math.min(100, Math.max(0, action.progress)),
      }))
    case "alt-text":
      return updateItem(items, action.clientId, (item) => ({ ...item, altText: action.altText }))
    case "processing":
      return updateItem(items, action.clientId, (item) => ({
        ...item,
        progress: 100,
        status: "processing",
      }))
    case "ready":
      return updateItem(items, action.clientId, (item) => ({
        ...item,
        progress: 100,
        status: "ready",
        error: null,
      }))
    case "failed":
      return updateItem(items, action.clientId, (item) => ({
        ...item,
        status: "failed",
        error: action.error,
      }))
    case "reset":
      return []
  }

  const exhaustiveAction: never = action
  return exhaustiveAction
}

export function createUploadItem(
  file: File,
  kind: UploadKind,
  metadata: { filename?: string; mimeType?: string; thumbnailTimestampPct?: number } = {},
): UploadItem {
  return {
    clientId: crypto.randomUUID(),
    file,
    filename: metadata.filename ?? file.name,
    mimeType: metadata.mimeType ?? file.type,
    kind,
    previewUrl: kind === "image" ? URL.createObjectURL(file) : null,
    assetId: null,
    altText: "",
    progress: 0,
    thumbnailTimestampPct: metadata.thumbnailTimestampPct ?? null,
    status: "queued",
    error: null,
  }
}

export function releaseUploadPreviews(items: UploadItem[]) {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
}
