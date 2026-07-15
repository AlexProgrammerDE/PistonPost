import { createFileRoute } from "@tanstack/react-router"

import {
  createRequestAuth,
  privateAuthResponse,
  recordAuthAudit,
  sendSecurityNotification,
} from "@/server/auth"

const auditedMutations = new Map([
  ["/change-email", "auth.email-changed"],
  ["/change-password", "auth.password-changed"],
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
  const session = action ? await auth.api.getSession({ headers: request.headers }) : null
  const response = await auth.handler(request)

  if (action && session?.user.id && response.ok) {
    context.executionContext.waitUntil(recordAuthAudit(context, action, session.user.id))
  }

  const notificationTemplate =
    path === "/change-password"
      ? "password-changed"
      : path === "/change-email"
        ? "email-changed"
        : undefined
  if (notificationTemplate && session?.user.id && response.ok) {
    context.executionContext.waitUntil(
      sendSecurityNotification(
        context,
        session.user.id,
        notificationTemplate,
        `${notificationTemplate}:${session.user.id}:${crypto.randomUUID()}`,
      ),
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
