import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Schema, Effect } from "effect"

import { createFollowRepository } from "@/db/follow-repository"
import { listPublicPostReads } from "@/db/public-read-model"
import {
  canFollowUser,
  decodePublicPostCursor,
  encodePublicPostCursor,
  tagSchema,
  usernameSchema,
} from "@/domain"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { createRequestAuthEffect } from "@/server/auth"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import {
  forbiddenFailure,
  notFoundFailure,
  rateLimitedFailure,
} from "@/server/server-function-failure"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"

const followTargetSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("user"), username: usernameSchema }),
  Schema.Struct({ kind: Schema.Literal("tag"), tag: tagSchema }),
])
const setFollowSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("user"),
    username: usernameSchema,
    following: Schema.Boolean,
  }),
  Schema.Struct({ kind: Schema.Literal("tag"), tag: tagSchema, following: Schema.Boolean }),
])

const followingFeedInput = Schema.Struct({
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  limit: Schema.Finite.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(1))
    .check(Schema.isLessThanOrEqualTo(30))
    .pipe(Schema.withDecodingDefaultType(Effect.succeed(12))),
})

export type FollowTarget = (typeof followTargetSchema)["Type"]

function normalize(value: string) {
  return value.toLocaleLowerCase("en-US")
}

export const getFollowingViewer = createServerFn({ method: "GET" }).handler(({ context }) =>
  runRequestEffect(
    Effect.gen(function* () {
      const auth = yield* createRequestAuthEffect(context)
      const session = yield* bindingOperation("getFollowingViewer.session", () =>
        auth.api.getSession({ headers: getRequestHeaders() }),
      )
      return session ? { id: session.user.id } : null
    }),
  ),
)

export const getFollowingFeed = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(followingFeedInput))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const cursor = data.cursor ? yield* decodePublicPostCursor(data.cursor) : null
        const page = yield* bindingOperation("getFollowingFeed.page", () =>
          listPublicPostReads(database, {
            cursor,
            limit: data.limit,
            followingUserId: session.user.id,
          }),
        )

        return {
          posts: page.posts,
          nextCursor: page.nextCursor ? encodePublicPostCursor(page.nextCursor) : null,
        }
      }),
    ),
  )

export const getFollowState = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(followTargetSchema))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const repository = createFollowRepository(database)

        if (data.kind === "user") {
          const state = yield* repository.findUserFollow(session.user.id, normalize(data.username))
          return {
            canFollow: state ? canFollowUser(session.user.id, state.targetId) : false,
            following: state?.following ?? false,
          }
        }

        const state = yield* repository.findTagFollow(session.user.id, normalize(data.tag))
        return { canFollow: state !== null, following: state?.following ?? false }
      }),
    ),
  )

export const setFollow = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(setFollowSchema))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const rateLimit = yield* bindingOperation("setFollow.rateLimit", () =>
          context.env.USER_RATE_LIMITER.limit({ key: session.user.id }),
        )
        if (!rateLimit.success)
          return yield* rateLimitedFailure("The follow rate limit was reached.")
        const repository = createFollowRepository(database)

        return yield* Effect.gen(function* () {
          if (data.kind === "user") {
            const state = yield* repository.findUserFollow(
              session.user.id,
              normalize(data.username),
            )
            if (!state) return yield* notFoundFailure("The user was not found.")
            if (!canFollowUser(session.user.id, state.targetId)) {
              return yield* forbiddenFailure("You cannot follow yourself.")
            }
            yield* repository.setUserFollow(session.user.id, state.targetId, data.following)
          } else {
            const state = yield* repository.findTagFollow(session.user.id, normalize(data.tag))
            if (!state) return yield* notFoundFailure("The tag was not found.")
            yield* repository.setTagFollow(session.user.id, state.targetId, data.following)
          }

          return { canFollow: true, following: data.following }
        }).pipe(Effect.uninterruptible)
      }),
    ),
  )
