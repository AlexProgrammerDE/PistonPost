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
  getPublicTagRead,
  listPublicPostReads,
} from "@/db/public-read-model"
import { POST_VIEW_SURFACES, decodePublicPostCursor, encodePublicPostCursor } from "@/domain"

import { recordPostView } from "./post-view-tracking"

const feedInput = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(30).default(12),
  tag: z.string().trim().min(1).max(64).optional(),
  username: z.string().trim().min(1).max(32).optional(),
})

const postViewInput = z.object({
  postIds: z.array(z.string().trim().min(1).max(64)).min(1).max(30),
  surface: z.enum(POST_VIEW_SURFACES),
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

export const trackPostViews = createServerFn({ method: "POST" })
  .validator(postViewInput)
  .handler(async ({ context, data }) => {
    const headers = getRequestHeaders()
    const database = createD1Database(context.env.DB)
    const address = headers.get("cf-connecting-ip") ?? "local"
    const dependencies = {
      analytics: context.env.ANALYTICS,
      findPublishedPost: (postId: string) => getPublishedPostTrackingContext(database, postId),
      incrementViewCount: (postId: string) => incrementPostViewCount(database, postId),
      limiter: context.env.POST_VIEW_RATE_LIMITER,
    }
    const postIds = Array.from(new Set(data.postIds))
    const results = await Effect.runPromise(
      Effect.all(
        postIds.map((postId) =>
          recordPostView(dependencies, {
            address,
            postId,
            surface: data.surface,
          }).pipe(Effect.map((viewCount) => ({ postId, viewCount }))),
        ),
        { concurrency: 4 },
      ),
    )

    return {
      views: results.flatMap(({ postId, viewCount }) =>
        viewCount === null ? [] : [{ postId, viewCount }],
      ),
    }
  })

export const getPublicProfile = createServerFn({ method: "GET" })
  .validator(z.object({ username: z.string().trim().min(1).max(32) }))
  .handler(async ({ context, data }) =>
    getPublicProfileRead(createD1Database(context.env.DB), data.username),
  )

export const getPublicTag = createServerFn({ method: "GET" })
  .validator(z.object({ tag: z.string().trim().min(1).max(64) }))
  .handler(async ({ context, data }) =>
    getPublicTagRead(createD1Database(context.env.DB), data.tag.toLocaleLowerCase("en-US")),
  )
