import { createServerFn } from "@tanstack/react-start"
import { Effect, Schema } from "effect"

import { createD1Database } from "@/db/d1-database"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { readUnsubscribeKeyring } from "@/server/email-config"
import { applyUnsubscribeToken } from "@/server/email-preference-service"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"

export const unsubscribeFromEmail = createServerFn({ method: "POST" })
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        token: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(4096)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const keyring = yield* bindingOperation("unsubscribe.keyring", () =>
          readUnsubscribeKeyring(context.env.EMAIL_UNSUBSCRIBE_SECRET),
        )
        const database = createD1Database(context.env.DB)
        const preference = yield* applyUnsubscribeToken(
          database,
          data.token,
          keyring.verificationKeys,
          "email-link",
        )
        return { unsubscribed: true, preference }
      }),
    ),
  )
