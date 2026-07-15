import { SITE_URL } from "./seo"

export const MAX_SOCIAL_IMAGE_LINKS = 5

export function createPostShareLinks(postId: string, imageCount: number, origin = SITE_URL) {
  const postUrl = new URL(`/post/${encodeURIComponent(postId)}`, `${origin}/`)
  const normalizedImageCount = Math.min(Math.max(0, Math.floor(imageCount)), MAX_SOCIAL_IMAGE_LINKS)
  const imageUrls = Array.from({ length: normalizedImageCount }, (_, imageIndex) => {
    const imageUrl = new URL(postUrl)
    imageUrl.searchParams.set("image", imageIndex.toString())
    return imageUrl.toString()
  })

  return {
    postUrl: postUrl.toString(),
    imageUrls,
  }
}
