import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { readUnsubscribeKeyring } from "@/server/email-config"
import { applyUnsubscribeToken } from "@/server/email-preference-service"
import { runServerEffect } from "@/server/server-function-failure"

export const unsubscribeFromEmail = createServerFn({ method: "POST" })
  .validator(serverFunctionValidator(z.object({ token: z.string().min(1).max(4096) })))
  .handler(async ({ context, data }) => {
    const keyring = await readUnsubscribeKeyring(context.env.EMAIL_UNSUBSCRIBE_SECRET)
    const database = createD1Database(context.env.DB)
    const preference = await runServerEffect(
      applyUnsubscribeToken(database, data.token, keyring.verificationKeys, "email-link"),
    )
    return { unsubscribed: true, preference }
  })
