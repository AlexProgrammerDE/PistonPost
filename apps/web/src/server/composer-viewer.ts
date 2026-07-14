import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { createRequestAuth } from "@/server/auth"

export const getComposerViewer = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const auth = await createRequestAuth(context)
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session ? { id: session.user.id, name: session.user.name } : null
})
