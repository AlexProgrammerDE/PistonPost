export function missingStaticAssetResponse(request: Request) {
  if (!new URL(request.url).pathname.startsWith("/assets/")) return null

  return new Response(request.method === "HEAD" ? null : "Asset not found.", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
