import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start"

import type { ServerFunctionError } from "@/lib/server-function-error"
import { serverFunctionErrorMiddleware } from "@/server/server-function-middleware"

const serverFunctionCsrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
})

function isJson(text: string) {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Returns a 400 response when a server function payload is not valid JSON. TanStack Start decodes the
 * payload outside function middleware and reports the parse failure as a 500, so check it first.
 */
export async function malformedServerFunctionPayload(request: Request) {
  const contentType = request.headers.get("Content-Type") ?? ""
  // Start ignores an empty GET payload but always parses a JSON body.
  const payload =
    request.method === "GET"
      ? new URL(request.url).searchParams.get("payload") || null
      : contentType.includes("application/json")
        ? await request.clone().text()
        : null
  if (payload === null || isJson(payload)) return null
  const error: ServerFunctionError = {
    code: "INVALID_INPUT",
    message: "The request payload could not be read.",
    issues: [],
  }
  return Response.json(error, { status: 400, headers: { "Cache-Control": "no-store" } })
}

const serverFunctionPayloadMiddleware = createMiddleware().server(
  async ({ request, handlerType, next }) => {
    if (handlerType !== "serverFn") return next()
    return (await malformedServerFunctionPayload(request)) ?? next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [serverFunctionCsrfMiddleware, serverFunctionPayloadMiddleware],
  functionMiddleware: [serverFunctionErrorMiddleware],
}))
