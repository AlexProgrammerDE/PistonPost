const HEALTH_METHODS = new Set(["GET", "HEAD"])

/**
 * Uptime checks often send HEAD, so it gets the GET status and headers with
 * no body. Other methods get 405 instead of falling through to the app.
 */
export function healthResponse(method: string) {
  if (!HEALTH_METHODS.has(method)) {
    return new Response(null, {
      headers: { Allow: [...HEALTH_METHODS].join(", "), "Cache-Control": "no-store" },
      status: 405,
    })
  }

  const response = Response.json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  )
  if (method === "GET") return response
  return new Response(null, { headers: response.headers, status: response.status })
}
