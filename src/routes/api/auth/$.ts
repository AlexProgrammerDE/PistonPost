import { createFileRoute } from "@tanstack/react-router"

import {
  createRequestAuth,
  enqueueSecurityNotification,
  privateAuthResponse,
  recordAuthAudit,
} from "@/server/auth"

const auditedMutations = new Map([
  ["/delete-user", "auth.deletion-requested"],
  ["/passkey/add-passkey", "auth.passkey-added"],
  ["/passkey/delete-passkey", "auth.passkey-deleted"],
  ["/passkey/update-passkey", "auth.passkey-updated"],
  ["/two-factor/enable", "auth.two-factor-enabled"],
  ["/two-factor/disable", "auth.two-factor-disabled"],
])

async function handleAuth({
  request,
  context,
}: {
  request: Request
  context: import("@/server").AppRequestContext
}) {
  const auth = await createRequestAuth(context)
  const path = new URL(request.url).pathname.replace("/api/auth", "")
  const action = request.method === "POST" ? auditedMutations.get(path) : undefined
  const sendsSecurityNotification = path === "/change-password" || path === "/change-email"
  const session =
    action || sendsSecurityNotification
      ? await auth.api.getSession({ headers: request.headers })
      : null
  const response = await auth.handler(request)

  if (action && session?.user.id && response.ok) {
    context.executionContext.waitUntil(recordAuthAudit(context, action, session.user.id))
  }

  const notificationAction =
    path === "/change-password"
      ? "auth.password-changed"
      : path === "/change-email"
        ? "auth.email-change-requested"
        : undefined
  if (notificationAction && session?.user.id && response.ok) {
    context.executionContext.waitUntil(
      enqueueSecurityNotification(context, session.user.id, notificationAction, session.user.id),
    )
  }

  return privateAuthResponse(response)
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handleAuth,
      POST: handleAuth,
    },
  },
})
