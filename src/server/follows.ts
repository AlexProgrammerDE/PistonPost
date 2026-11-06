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
import { createRequestAuth } from "@/server/auth"
import {
  forbiddenFailure,
  notFoundFailure,
  rateLimitedFailure,
  runServerEffect,
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

export const getFollowingViewer = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const auth = await createRequestAuth(context)
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session ? { id: session.user.id } : null
})

export const getFollowingFeed = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(followingFeedInput))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const cursor = data.cursor ? await runServerEffect(decodePublicPostCursor(data.cursor)) : null
    const page = await listPublicPostReads(database, {
      cursor,
      limit: data.limit,
      followingUserId: session.user.id,
    })

    return {
      posts: page.posts,
      nextCursor: page.nextCursor ? encodePublicPostCursor(page.nextCursor) : null,
    }
  })

export const getFollowState = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(followTargetSchema))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const repository = createFollowRepository(database)

    if (data.kind === "user") {
      const state = await runServerEffect(
        repository.findUserFollow(session.user.id, normalize(data.username)),
      )
      return {
        canFollow: state ? canFollowUser(session.user.id, state.targetId) : false,
        following: state?.following ?? false,
      }
    }

    const state = await runServerEffect(
      repository.findTagFollow(session.user.id, normalize(data.tag)),
    )
    return { canFollow: state !== null, following: state?.following ?? false }
  })

export const setFollow = createServerFn({ method: "POST" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(setFollowSchema))
  .handler(async ({ context, data }) => {
    const { database, session } = context
    const rateLimit = await context.env.USER_RATE_LIMITER.limit({ key: session.user.id })
    if (!rateLimit.success) throw rateLimitedFailure("The follow rate limit was reached.")
    const repository = createFollowRepository(database)

    if (data.kind === "user") {
      const state = await runServerEffect(
        repository.findUserFollow(session.user.id, normalize(data.username)),
      )
      if (!state) throw notFoundFailure("The user was not found.")
      if (!canFollowUser(session.user.id, state.targetId)) {
        throw forbiddenFailure("You cannot follow yourself.")
      }
      await runServerEffect(
        repository.setUserFollow(session.user.id, state.targetId, data.following),
      )
    } else {
      const state = await runServerEffect(
        repository.findTagFollow(session.user.id, normalize(data.tag)),
      )
      if (!state) throw notFoundFailure("The tag was not found.")
      await runServerEffect(
        repository.setTagFollow(session.user.id, state.targetId, data.following),
      )
    }

    return { canFollow: true, following: data.following }
  })
