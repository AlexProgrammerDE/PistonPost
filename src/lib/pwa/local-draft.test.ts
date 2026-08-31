import { afterAll, beforeEach, describe, expect, it } from "bun:test"

import {
  readLocalDraft,
  reconcileDraftAccount,
  removeLocalDraft,
  saveLocalDraft,
  type DraftValues,
} from "./local-draft"

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const entries = new Map<string, string>()
const storage: Storage = {
  get length() {
    return entries.size
  },
  clear: () => entries.clear(),
  getItem: (key) => entries.get(key) ?? null,
  key: (index) => [...entries.keys()][index] ?? null,
  removeItem: (key) => {
    entries.delete(key)
  },
  setItem: (key, value) => {
    entries.set(key, value)
  },
}
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
beforeEach(() => storage.clear())
afterAll(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage)
  else Reflect.deleteProperty(globalThis, "localStorage")
})

const values: DraftValues = {
  type: "text",
  title: "A draft",
  textContent: "Keep this",
  tags: ["notes"],
  visibility: "unlisted",
}

describe("local composer recovery", () => {
  it("restores only the current account's valid text and details, without media references", () => {
    reconcileDraftAccount("first")
    saveLocalDraft("first", {
      ...values,
      mediaId: "server-file",
      mediaIds: ["image"],
      files: [new File(["private"], "photo.png")],
    })
    expect(readLocalDraft("first")).toEqual(values)
    expect(readLocalDraft("second")).toBeNull()
    expect(readLocalDraft("first", Date.now() + 7 * 24 * 60 * 60 * 1000)).toBeNull()
    expect(readLocalDraft("first", 0)).toBeNull()
  })

  it("clears on sign-out and prevents late saves from recreating an old account's draft", () => {
    reconcileDraftAccount("first")
    saveLocalDraft("first", values)
    reconcileDraftAccount(null)
    saveLocalDraft("first", values)
    expect(readLocalDraft("first")).toBeNull()
    reconcileDraftAccount("second")
    saveLocalDraft("second", values)
    saveLocalDraft("first", values)
    removeLocalDraft("first")
    expect(readLocalDraft("second")).toEqual(values)
    reconcileDraftAccount("first")
    expect(readLocalDraft("second")).toBeNull()
  })

  it("removes cleared drafts and tolerates corrupt records", () => {
    reconcileDraftAccount("first")
    saveLocalDraft("first", values)
    saveLocalDraft("first", { ...values, title: "", textContent: "", tags: [] })
    expect(readLocalDraft("first")).toBeNull()
    storage.setItem("pistonpost.composer-draft.v1", "corrupt")
    expect(readLocalDraft("first")).toBeNull()
    reconcileDraftAccount("first")
    expect(storage.getItem("pistonpost.composer-draft.v1")).toBeNull()
  })
})
