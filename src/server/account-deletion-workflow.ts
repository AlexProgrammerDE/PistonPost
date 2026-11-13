import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { inArray } from "drizzle-orm"
import { Effect, Layer } from "effect"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"

import {
  accountDeletionStoreLayer,
  deleteOwnedAccountMedia,
  scheduleAccountCachePurge,
  verifyAccountPurge,
  type AccountDeletionParams,
} from "./account-deletion-steps"
import { accountMediaPurgeLayer } from "./account-media-purge"

export class AccountDeletionWorkflow extends WorkflowEntrypoint<
  Cloudflare.Env,
  AccountDeletionParams
> {
  private services() {
    const database = createD1Database(this.env.DB)
    return Layer.mergeAll(
      accountDeletionStoreLayer(database, (job) => this.env.JOBS.send(job)),
      accountMediaPurgeLayer({
        deleteR2: (key) => this.env.MEDIA.delete(key),
        deleteStream: (uid) => this.env.STREAM.video(uid).delete(),
        deleteRecord: async (id) => {
          await database.delete(schema.mediaAssets).where(inArray(schema.mediaAssets.id, [id]))
        },
      }),
    )
  }

  async run(event: Readonly<WorkflowEvent<AccountDeletionParams>>, step: WorkflowStep) {
    const input = event.payload
    await step.do(
      "delete owned media",
      { retries: { limit: 8, delay: "10 seconds", backoff: "exponential" } },
      () => Effect.runPromise(deleteOwnedAccountMedia(input).pipe(Effect.provide(this.services()))),
    )
    await step.do(
      "schedule cached media purge",
      { retries: { limit: 8, delay: "10 seconds", backoff: "exponential" } },
      () =>
        Effect.runPromise(scheduleAccountCachePurge(input).pipe(Effect.provide(this.services()))),
    )
    await step.do("verify account purge", () =>
      Effect.runPromise(verifyAccountPurge(input).pipe(Effect.provide(this.services()))),
    )
  }
}
