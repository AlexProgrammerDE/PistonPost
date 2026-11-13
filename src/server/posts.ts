import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect, Schema } from "effect"

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
import { serverFunctionValidator } from "@/lib/server-function-error"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"

import { recordPostView } from "./post-view-tracking"

const feedInput = Schema.Struct({
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  limit: Schema.Finite.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(1))
    .check(Schema.isLessThanOrEqualTo(30))
    .pipe(Schema.withDecodingDefaultType(Effect.succeed(12))),
  tag: Schema.optional(Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64))),
  username: Schema.optional(Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(32))),
})

const postViewInput = Schema.Struct({
  postIds: Schema.mutable(
    Schema.Array(Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64))),
  )
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(30)),
  surface: Schema.Literals(POST_VIEW_SURFACES),
})

export const getPublicFeed = createServerFn({ method: "GET" })
  .validator(serverFunctionValidator(feedInput))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const cursor = data.cursor ? yield* decodePublicPostCursor(data.cursor) : null
        const page = yield* bindingOperation("getPublicFeed.page", () =>
          listPublicPostReads(createD1Database(context.env.DB), {
            cursor,
            limit: data.limit,
            tag: data.tag?.toLocaleLowerCase("en-US"),
            username: data.username?.toLocaleLowerCase("en-US"),
          }),
        )

        return {
          posts: page.posts,
          nextCursor: page.nextCursor ? encodePublicPostCursor(page.nextCursor) : null,
        }
      }),
    ),
  )

export const getPublishedPost = createServerFn({ method: "GET" })
  .validator(
    serverFunctionValidator(
      Schema.Struct({ id: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)) }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      bindingOperation("getPublishedPost.operation", () =>
        getPublishedPostRead(createD1Database(context.env.DB), data.id),
      ),
    ),
  )

export const trackPostViews = createServerFn({ method: "POST" })
  .validator(serverFunctionValidator(postViewInput))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
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
        const results = yield* Effect.forEach(
          postIds,
          (postId) =>
            recordPostView(dependencies, {
              address,
              postId,
              surface: data.surface,
            }).pipe(Effect.map((viewCount) => ({ postId, viewCount }))),
          { concurrency: 4 },
        )

        return {
          views: results.flatMap(({ postId, viewCount }) =>
            viewCount === null ? [] : [{ postId, viewCount }],
          ),
        }
      }),
    ),
  )

export const getPublicProfile = createServerFn({ method: "GET" })
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        username: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(32)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      bindingOperation("getPublicProfile.operation", () =>
        getPublicProfileRead(createD1Database(context.env.DB), data.username),
      ),
    ),
  )

export const getPublicTag = createServerFn({ method: "GET" })
  .validator(
    serverFunctionValidator(
      Schema.Struct({
        tag: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(64)),
      }),
    ),
  )
  .handler(({ context, data }) =>
    runRequestEffect(
      bindingOperation("getPublicTag.operation", () =>
        getPublicTagRead(createD1Database(context.env.DB), data.tag.toLocaleLowerCase("en-US")),
      ),
    ),
  )
