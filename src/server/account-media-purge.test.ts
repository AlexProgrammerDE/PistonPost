import { describe, expect, test } from "bun:test"

import { Effect, Exit } from "effect"

import { purgeAccountMedia } from "./account-media-purge"

const asset = { id: "asset-one", r2Key: "users/one/image", streamUid: "stream-one" }

describe("account media purge", () => {
  test("does not remove the database record until both providers succeed", async () => {
    const deleted: string[] = []
    const first = await Effect.runPromiseExit(
      purgeAccountMedia([asset], {
        deleteR2: async () => undefined,
        deleteStream: async () => {
          throw new Error("temporary Stream failure")
        },
        deleteRecord: async (id) => {
          deleted.push(id)
        },
      }),
    )

    expect(Exit.isFailure(first)).toBe(true)
    expect(deleted).toEqual([])
  })

  test("is safe to resume when a provider already removed its object", async () => {
    const deleted: string[] = []
    await Effect.runPromise(
      purgeAccountMedia([asset], {
        deleteR2: async () => {
          throw { status: 404 }
        },
        deleteStream: async () => undefined,
        deleteRecord: async (id) => {
          deleted.push(id)
        },
      }),
    )

    expect(deleted).toEqual([asset.id])
  })
})
