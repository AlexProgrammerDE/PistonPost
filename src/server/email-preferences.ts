import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import * as schema from "@/db/schema"
import { verifyUnsubscribeToken } from "@/email"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { runServerEffect } from "@/server/server-function-failure"

async function readSecret(secret: string | SecretsStoreSecret) {
  const value = (typeof secret === "string" ? secret : await secret.get()).trim()
  if (!value) throw new Error("The unsubscribe signing secret is unavailable.")
  return value
}

export const unsubscribeFromProductEmail = createServerFn({ method: "POST" })
  .validator(serverFunctionValidator(z.object({ token: z.string().min(1).max(4096) })))
  .handler(async ({ context, data }) => {
    const secret = await readSecret(context.env.EMAIL_UNSUBSCRIBE_SECRET)
    const claims = await runServerEffect(verifyUnsubscribeToken(data.token, secret))
    const database = createD1Database(context.env.DB)
    await database
      .insert(schema.userSettings)
      .values({ userId: claims.userId, productNotifications: false })
      .onConflictDoUpdate({
        target: schema.userSettings.userId,
        set: { productNotifications: false, updatedAt: new Date() },
      })
    return { unsubscribed: true }
  })
