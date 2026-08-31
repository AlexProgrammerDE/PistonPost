import { z } from "zod"

import {
  isShareAvailable,
  MAX_PENDING_SHARES,
  pendingShareSchema,
  sharedContentSchema,
  SHARE_RETENTION_MS,
  type SharedContent,
} from "./share-intake"

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pistonpost-local", 1)
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore("shares", { keyPath: "id" })
      request.result.createObjectStore("meta")
    })
    request.addEventListener("success", () => resolve(request.result))
    request.addEventListener("error", () => reject(request.error))
    request.addEventListener("blocked", () =>
      reject(new Error("Local storage is busy. Close other PistonPost tabs and try again.")),
    )
  })
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result))
    request.addEventListener("error", () => reject(request.error))
  })
}

async function transaction<T>(run: (shares: IDBObjectStore, meta: IDBObjectStore) => Promise<T>) {
  const database = await openDatabase()
  try {
    const tx = database.transaction(["shares", "meta"], "readwrite")
    const completion = new Promise<void>((resolve, reject) => {
      tx.addEventListener("complete", () => resolve())
      tx.addEventListener("abort", () =>
        reject(tx.error ?? new Error("Local storage could not be saved.")),
      )
      tx.addEventListener("error", () =>
        reject(tx.error ?? new Error("Local storage could not be saved.")),
      )
    })
    const operation = run(tx.objectStore("shares"), tx.objectStore("meta"))
    const [value] = await Promise.all([operation, completion])
    return value
  } finally {
    database.close()
  }
}

async function cleanShares(store: IDBObjectStore, userId?: string | null) {
  // Visit one record at a time instead of cloning every pending file into memory together.
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor()
    request.addEventListener("error", () => reject(request.error))
    request.addEventListener("success", () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      const parsed = pendingShareSchema.safeParse(cursor.value)
      if (
        !parsed.success ||
        parsed.data.createdAt > Date.now() ||
        Date.now() - parsed.data.createdAt >= SHARE_RETENTION_MS ||
        (userId !== undefined && parsed.data.ownerId !== null && parsed.data.ownerId !== userId)
      ) {
        cursor.delete()
      } else if (userId && parsed.data.ownerId === null) {
        // An anonymous share follows its first sign-in, then obeys account-switch cleanup.
        cursor.update({ ...parsed.data, ownerId: userId })
      }
      cursor.continue()
    })
  })
}

export async function reconcileLocalAccount(userId: string | null) {
  return transaction(async (shares, meta) => {
    await cleanShares(shares, userId)
    meta.put(userId, "account")
  })
}

export async function stageSharedContent(input: SharedContent) {
  const content = sharedContentSchema.parse(input)
  return transaction(async (shares, meta) => {
    await cleanShares(shares)
    if ((await result(shares.count())) >= MAX_PENDING_SHARES) {
      throw new Error("Open or discard an earlier share before sharing more files.")
    }
    const owner: unknown = await result(meta.get("account"))
    const share = {
      id: crypto.randomUUID(),
      ownerId: z.string().nullable().catch(null).parse(owner),
      createdAt: Date.now(),
      content,
    }
    shares.put(share)
    return share.id
  })
}

export async function readSharedContent(id: string, userId: string | null) {
  return transaction(async (shares) => {
    await cleanShares(shares)
    const record: unknown = await result(shares.get(id))
    const parsed = pendingShareSchema.safeParse(record)
    return parsed.success && isShareAvailable(parsed.data, userId) ? parsed.data : null
  })
}

export async function removeSharedContent(id: string) {
  return transaction(async (shares) => {
    await result(shares.delete(id))
  })
}
