import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { inArray } from "drizzle-orm"
import { Effect } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"

import { purgeAccountMedia } from "./account-media-purge"

export type AccountDeletionParams = {
  userId: string
  mediaIds: string[]
}

export class AccountDeletionWorkflow extends WorkflowEntrypoint<
  Cloudflare.Env,
  AccountDeletionParams
> {
  async run(event: Readonly<WorkflowEvent<AccountDeletionParams>>, step: WorkflowStep) {
    const { mediaIds, userId } = event.payload
    await step.do(
      "delete owned media",
      { retries: { limit: 8, delay: "10 seconds", backoff: "exponential" } },
      async () => {
        if (mediaIds.length === 0) return { deleted: 0 }
        const database = createD1Database(this.env.DB)
        const assets = await database
          .select({
            id: schema.mediaAssets.id,
            r2Key: schema.mediaAssets.r2Key,
            streamUid: schema.mediaAssets.streamUid,
          })
          .from(schema.mediaAssets)
          .where(inArray(schema.mediaAssets.id, mediaIds))

        await Effect.runPromise(
          purgeAccountMedia(assets, {
            deleteR2: (key) => this.env.MEDIA.delete(key),
            deleteStream: (uid) => this.env.STREAM.video(uid).delete(),
            deleteRecord: async (id) => {
              await database.delete(schema.mediaAssets).where(inArray(schema.mediaAssets.id, [id]))
            },
          }),
        )
        return { deleted: assets.length }
      },
    )

    await step.do("verify account purge", async () => {
      if (mediaIds.length > 0) {
        const remaining = await createD1Database(this.env.DB)
          .select({ id: schema.mediaAssets.id })
          .from(schema.mediaAssets)
          .where(inArray(schema.mediaAssets.id, mediaIds))
        if (remaining.length > 0) throw new Error("Owned media still requires deletion.")
      }
      await createD1Database(this.env.DB)
        .insert(schema.auditEvents)
        .values({
          id: crypto.randomUUID(),
          actorId: null,
          action: "account.deletion-complete",
          entityType: "user",
          entityId: userId,
          metadata: { mediaCount: mediaIds.length },
        })
      return { complete: true }
    })
  }
}
