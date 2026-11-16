import { describe, expect, test } from "bun:test"

import { Effect, Exit } from "effect"

import { purgeAccountMedia, accountMediaPurgeLayer } from "./account-media-purge"

const asset = { id: "asset-one", r2Key: "users/one/image", streamUid: "stream-one" }

describe("account media purge", () => {
  test("does not remove the database record until both providers succeed", async () => {
    const deleted: string[] = []
    const first = await Effect.runPromiseExit(
      purgeAccountMedia([asset]).pipe(
        Effect.provide(
          accountMediaPurgeLayer({
            deleteR2: async () => undefined,
            deleteStream: async () => {
              throw new Error("temporary Stream failure")
            },
            deleteRecord: async (id) => {
              deleted.push(id)
            },
          }),
        ),
      ),
    )

    expect(Exit.isFailure(first)).toBe(true)
    expect(deleted).toEqual([])
  })

  test("is safe to resume when Stream already removed its video", async () => {
    const deleted: string[] = []
    await Effect.runPromise(
      purgeAccountMedia([asset]).pipe(
        Effect.provide(
          accountMediaPurgeLayer({
            deleteR2: async () => undefined,
            deleteStream: async () => {
              throw Object.assign(new Error("Video not found"), {
                name: "NotFoundError",
                code: 10003,
                statusCode: 404,
              })
            },
            deleteRecord: async (id) => {
              deleted.push(id)
            },
          }),
        ),
      ),
    )

    expect(deleted).toEqual([asset.id])
  })

  test("purges the remaining assets when one asset fails, then reports the failure", async () => {
    const deleted: string[] = []
    const assets = [
      { id: "asset-one", r2Key: "users/one/a", streamUid: null },
      { id: "asset-two", r2Key: "users/one/b", streamUid: null },
      { id: "asset-three", r2Key: "users/one/c", streamUid: null },
    ]
    const error = await Effect.runPromise(
      purgeAccountMedia(assets).pipe(
        Effect.flip,
        Effect.provide(
          accountMediaPurgeLayer({
            deleteR2: async (key) => {
              if (key === "users/one/a") throw new Error("temporary R2 failure")
            },
            deleteStream: async () => undefined,
            deleteRecord: async (id) => {
              deleted.push(id)
            },
          }),
        ),
      ),
    )

    expect(error).toMatchObject({ assetId: "asset-one", operation: "r2" })
    expect(deleted.toSorted()).toEqual(["asset-three", "asset-two"])
  })
})
