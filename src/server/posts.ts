import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import { incrementPostViewCount } from "@/db/post-view-repository"
import {
  getPublishedPostRead,
  getPublishedPostTrackingContext,
  getPublicProfileRead,
  listPublicPostReads,
} from "@/db/public-read-model"
import { decodePublicPostCursor, encodePublicPostCursor } from "@/domain"

import { recordPostView } from "./post-view-tracking"

const feedInput = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(30).default(12),
  tag: z.string().trim().min(1).max(64).optional(),
  username: z.string().trim().min(1).max(32).optional(),
})

export const getPublicFeed = createServerFn({ method: "GET" })
  .validator(feedInput)
  .handler(async ({ context, data }) => {
    const cursor = data.cursor ? await Effect.runPromise(decodePublicPostCursor(data.cursor)) : null
    const page = await listPublicPostReads(createD1Database(context.env.DB), {
      cursor,
      limit: data.limit,
      tag: data.tag?.toLocaleLowerCase("en-US"),
      username: data.username?.toLocaleLowerCase("en-US"),
    })

    return {
      posts: page.posts,
      nextCursor: page.nextCursor ? encodePublicPostCursor(page.nextCursor) : null,
    }
  })

export const getPublishedPost = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().trim().min(1).max(64) }))
  .handler(async ({ context, data }) =>
    getPublishedPostRead(createD1Database(context.env.DB), data.id),
  )

export const trackPostView = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().trim().min(1).max(64) }))
  .handler(async ({ context, data }) => {
    const headers = getRequestHeaders()
    const database = createD1Database(context.env.DB)
    const viewCount = await recordPostView(
      {
        analytics: context.env.ANALYTICS,
        findPublishedPost: (postId) => getPublishedPostTrackingContext(database, postId),
        incrementViewCount: (postId) => incrementPostViewCount(database, postId),
        limiter: context.env.POST_VIEW_RATE_LIMITER,
      },
      {
        address: headers.get("cf-connecting-ip") ?? "local",
        postId: data.id,
      },
    )

    return { tracked: viewCount !== null, viewCount }
  })

export const getPublicProfile = createServerFn({ method: "GET" })
  .validator(z.object({ username: z.string().trim().min(1).max(32) }))
  .handler(async ({ context, data }) =>
    getPublicProfileRead(createD1Database(context.env.DB), data.username),
  )
