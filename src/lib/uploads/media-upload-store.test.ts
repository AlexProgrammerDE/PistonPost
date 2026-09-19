import { expect, test } from "bun:test"

import { createAtom } from "@tanstack/react-store"

import { createUploadItem } from "./media-upload-state"
import { createMediaUploadStore } from "./media-upload-store"

test("upload progress only notifies the affected row, while picker edits remain reactive", () => {
  const store = createMediaUploadStore()
  const first = createUploadItem(new File([], "first.mp4"), "video")
  const second = createUploadItem(new File([], "second.mp4"), "video")
  store.dispatch({ type: "add", items: [first, second] })
  const row = createAtom(() => store.uploads.get().find((item) => item.clientId === first.clientId))
  const otherRow = createAtom(() =>
    store.uploads.get().find((item) => item.clientId === second.clientId),
  )
  let rowUpdates = 0
  let otherUpdates = 0
  let pickerUpdates = 0
  const subscriptions = [
    row.subscribe(() => rowUpdates++),
    otherRow.subscribe(() => otherUpdates++),
    store.pickerItems.subscribe(() => pickerUpdates++),
  ]
  try {
    store.dispatch({ type: "uploading", clientId: first.clientId, assetId: "asset" })
    store.dispatch({ type: "progress", clientId: first.clientId, progress: 45 })
    store.dispatch({ type: "ready", clientId: first.clientId })
    expect(rowUpdates).toBe(3)
    expect(otherUpdates).toBe(0)
    expect(pickerUpdates).toBe(0)

    store.dispatch({ type: "alt-text", clientId: second.clientId, altText: "Preview" })
    expect(pickerUpdates).toBe(1)
    store.dispatch({ type: "reorder", activeId: second.clientId, overId: first.clientId })
    expect(store.pickerItems.get().map((item) => item.clientId)).toEqual([
      second.clientId,
      first.clientId,
    ])
    expect(pickerUpdates).toBe(2)
    store.dispatch({ type: "remove", clientId: first.clientId })
    expect(row.get()).toBeUndefined()
    expect(pickerUpdates).toBe(3)
    store.dispatch({ type: "reset" })
    expect(store.pickerItems.get()).toEqual([])
    expect(createMediaUploadStore().uploads.get()).toEqual([])
  } finally {
    for (const subscription of subscriptions) subscription.unsubscribe()
  }
})
