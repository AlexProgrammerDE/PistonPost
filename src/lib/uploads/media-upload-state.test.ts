import { describe, expect, test } from "bun:test"

import { mediaUploadReducer, type UploadItem } from "./media-upload-state"

function item(clientId: string): UploadItem {
  return {
    clientId,
    file: new File([clientId], `${clientId}.jpg`, { type: "image/jpeg" }),
    kind: "image",
    previewUrl: null,
    assetId: null,
    altText: "",
    progress: 0,
    status: "queued",
    error: null,
  }
}

describe("mediaUploadReducer", () => {
  test("tracks the upload lifecycle without storing files in form state", () => {
    const queued = [item("one")]
    const uploading = mediaUploadReducer(queued, {
      type: "uploading",
      clientId: "one",
      assetId: "asset-one",
    })
    const progressing = mediaUploadReducer(uploading, {
      type: "progress",
      clientId: "one",
      progress: 57,
    })
    const processing = mediaUploadReducer(progressing, { type: "processing", clientId: "one" })
    const ready = mediaUploadReducer(processing, { type: "ready", clientId: "one" })

    expect(ready[0]).toMatchObject({
      assetId: "asset-one",
      progress: 100,
      status: "ready",
    })
  })

  test("reorders by stable client identity", () => {
    const result = mediaUploadReducer([item("one"), item("two"), item("three")], {
      type: "reorder",
      activeId: "three",
      overId: "one",
    })

    expect(result.map(({ clientId }) => clientId)).toEqual(["three", "one", "two"])
  })

  test("keeps the previous list for unknown reorder identities", () => {
    const current = [item("one")]
    expect(
      mediaUploadReducer(current, { type: "reorder", activeId: "missing", overId: "one" }),
    ).toBe(current)
  })
})
