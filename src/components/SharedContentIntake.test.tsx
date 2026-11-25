import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test"

import * as Effect from "effect/Effect"
import { AtomRegistry } from "effect/reactivity"
import { renderToStaticMarkup } from "react-dom/server"

import * as localStore from "@/lib/pwa/local-store"
import type { PendingShare } from "@/lib/pwa/share-intake"
import { sharedContentAtom } from "@/lib/pwa/shared-content-atom"

import { SharedContentIntake } from "./SharedContentIntake"

const readSharedContent = spyOn(localStore, "readSharedContent")

const share = {
  id: "2b7b1c55-3c55-4b8e-9d0e-0c6a9d1f6a10",
  ownerId: "user-1",
  createdAt: 0,
  content: { title: "", text: "Hello", url: "", files: [] },
} satisfies PendingShare

function load(shareId: string) {
  return Effect.runPromise(
    AtomRegistry.getResult(AtomRegistry.make(), sharedContentAtom({ shareId, userId: "user-1" })),
  )
}

describe("SharedContentIntake", () => {
  beforeEach(() => {
    readSharedContent.mockReset()
  })

  afterAll(() => {
    readSharedContent.mockRestore()
  })

  test("renders the loading state on the server without reading the device store", () => {
    const html = renderToStaticMarkup(
      <SharedContentIntake shareId="share-1" userId="user-1" onImport={() => Promise.resolve()} />,
    )

    expect(html).toContain("Checking shared content")
    expect(html).toContain("Loading what you shared")
    expect(readSharedContent).not.toHaveBeenCalled()
  })

  test("loads the share for the given user", async () => {
    readSharedContent.mockResolvedValue(share)

    expect(await load("share-2")).toEqual(share)
    expect(readSharedContent).toHaveBeenCalledWith("share-2", "user-1")
  })

  test("treats a failed read as a missing share", async () => {
    readSharedContent.mockRejectedValue(new Error("IndexedDB is unavailable"))

    expect(await load("share-3")).toBeNull()
  })
})
