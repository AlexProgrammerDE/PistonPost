import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"

import { createRequestAuthEffect } from "@/server/auth"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"

export const getComposerViewer = createServerFn({ method: "GET" }).handler(({ context }) =>
  runRequestEffect(
    Effect.gen(function* () {
      const auth = yield* createRequestAuthEffect(context)
      const session = yield* bindingOperation("composer-viewer.session", () =>
        auth.api.getSession({ headers: getRequestHeaders() }),
      )
      return session ? { id: session.user.id, name: session.user.name } : null
    }),
  ),
)
