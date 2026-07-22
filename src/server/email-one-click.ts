import { Effect, Either } from "effect"

import { createD1Database } from "@/db/d1-database"
import { UnsubscribeTokenError } from "@/email"
import type { AppRequestContext } from "@/server"
import { readUnsubscribeKeyring } from "@/server/email-config"
import { applyUnsubscribeToken } from "@/server/email-preference-service"

function unsubscribeResponse(status: 204 | 400 | 415 | 500) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

function requestMediaType(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
}

export async function parseOneClickUnsubscribeRequest(request: Request) {
  const type = requestMediaType(request)
  if (type !== "application/x-www-form-urlencoded" && type !== "multipart/form-data") {
    return { kind: "invalid", status: 415 } as const
  }

  const token = new URL(request.url).searchParams.get("token")
  if (!token || token.length > 4096) return { kind: "invalid", status: 400 } as const

  let body: FormData
  try {
    body = await request.formData()
  } catch {
    return { kind: "invalid", status: 400 } as const
  }
  const fields = [...body.entries()]
  if (
    fields.length !== 1 ||
    fields[0]?.[0] !== "List-Unsubscribe" ||
    fields[0]?.[1] !== "One-Click"
  ) {
    return { kind: "invalid", status: 400 } as const
  }
  return { kind: "valid", token } as const
}

export async function handleOneClickUnsubscribe(request: Request, context: AppRequestContext) {
  const parsed = await parseOneClickUnsubscribeRequest(request)
  if (parsed.kind === "invalid") return unsubscribeResponse(parsed.status)

  try {
    const keyring = await readUnsubscribeKeyring(context.env.EMAIL_UNSUBSCRIBE_SECRET)
    const result = await Effect.runPromise(
      Effect.either(
        applyUnsubscribeToken(
          createD1Database(context.env.DB),
          parsed.token,
          keyring.verificationKeys,
          "one-click",
        ),
      ),
    )
    if (Either.isRight(result)) return unsubscribeResponse(204)
    if (result.left instanceof UnsubscribeTokenError) return unsubscribeResponse(400)
    console.error(JSON.stringify({ level: "error", event: "email.unsubscribe.failed" }))
    return unsubscribeResponse(500)
  } catch {
    console.error(JSON.stringify({ level: "error", event: "email.unsubscribe.failed" }))
    return unsubscribeResponse(500)
  }
}
