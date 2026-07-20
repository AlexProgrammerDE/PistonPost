const CACHE_TAG_PATTERN = /^[\u0021-\u007e]{1,1024}$/u

export const FEED_CACHE_TAG = "pistonpost-feed"
export const SITEMAP_CACHE_TAG = "pistonpost-sitemap"

function scopedCacheTag(scope: "media" | "owner" | "post", id: string) {
  const tag = `pistonpost-${scope}-${encodeURIComponent(id)}`
  if (!CACHE_TAG_PATTERN.test(tag) || tag.includes(",")) {
    throw new Error(`Cannot create a cache tag for ${scope}.`)
  }
  return tag
}

export function mediaCacheTag(mediaId: string) {
  return scopedCacheTag("media", mediaId)
}

export function postCacheTag(postId: string) {
  return scopedCacheTag("post", postId)
}

export function ownerCacheTag(userId: string) {
  return scopedCacheTag("owner", userId)
}

export function cacheTagHeader(tags: ReadonlyArray<string>) {
  const uniqueTags = Array.from(new Set(tags))
  if (uniqueTags.some((tag) => !CACHE_TAG_PATTERN.test(tag) || tag.includes(","))) {
    throw new Error("Cache tags must be printable ASCII without spaces or commas.")
  }
  return uniqueTags.join(",")
}

export function isCacheTag(value: string) {
  return CACHE_TAG_PATTERN.test(value) && !value.includes(",")
}
