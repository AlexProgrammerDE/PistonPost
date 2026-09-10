import {
  extract as extractCloudflare,
  transform as transformCloudflare,
} from "unpic/providers/cloudflare"
import {
  extract as extractCloudflareImages,
  transform as transformCloudflareImages,
} from "unpic/providers/cloudflare_images"

type ImageTransformer = (
  source: string | URL,
  operations: { width?: number; height?: number },
) => string

const relativeOrigin = "https://pistonpost.invalid"

export function getCloudflareImageTransformer(src: string): ImageTransformer | undefined {
  const url = URL.parse(src, relativeOrigin)
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return undefined
  // These providers reconstruct URLs without query strings. Preserve signed URLs
  // and other query-dependent sources exactly as supplied.
  if (url.search || url.hash) return undefined

  if (extractCloudflare(src)) return transformCloudflare

  // Named delivery variants do not imply that flexible variants are enabled.
  // Only resize URLs that already use Cloudflare Images' transformation syntax.
  if (!url.pathname.split("/").at(-1)?.includes("=")) return undefined
  if (!extractCloudflareImages(url)) return undefined

  return (source: string | URL, operations: { width?: number; height?: number }) => {
    const resolved = new URL(source, relativeOrigin)
    const transformed = transformCloudflareImages(resolved, operations)
    return src.startsWith("/") && !src.startsWith("//")
      ? new URL(transformed).pathname
      : transformed
  }
}
