import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"

import { createD1Database } from "@/db/d1-database"
import { createFollowRepository } from "@/db/follow-repository"
import { listPublicPostReads } from "@/db/public-read-model"
import {
  canFollowUser,
  decodePublicPostCursor,
  encodePublicPostCursor,
  tagSchema,
  usernameSchema,
} from "@/domain"
import { createRequestAuth } from "@/server/auth"
import { assertMutationOrigin, requireRequestSession } from "@/server/session"

const followTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), username: usernameSchema }),
  z.object({ kind: z.literal("tag"), tag: tagSchema }),
])
const setFollowSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), username: usernameSchema, following: z.boolean() }),
  z.object({ kind: z.literal("tag"), tag: tagSchema, following: z.boolean() }),
])

const followingFeedInput = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(30).default(12),
})

export type FollowTarget = z.infer<typeof followTargetSchema>

function normalize(value: string) {
  return value.toLocaleLowerCase("en-US")
}

export const getFollowingViewer = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const auth = await createRequestAuth(context)
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session ? { id: session.user.id } : null
})

export const getFollowingFeed = createServerFn({ method: "GET" })
  .validator(followingFeedInput)
  .handler(async ({ context, data }) => {
    const session = await requireRequestSession(context)
    const cursor = data.cursor ? await Effect.runPromise(decodePublicPostCursor(data.cursor)) : null
    const page = await listPublicPostReads(createD1Database(context.env.DB), {
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
  .validator(followTargetSchema)
  .handler(async ({ context, data }) => {
    const session = await requireRequestSession(context)
    const repository = createFollowRepository(createD1Database(context.env.DB))

    if (data.kind === "user") {
      const state = await Effect.runPromise(
        repository.findUserFollow(session.user.id, normalize(data.username)),
      )
      return {
        canFollow: state ? canFollowUser(session.user.id, state.targetId) : false,
        following: state?.following ?? false,
      }
    }

    const state = await Effect.runPromise(
      repository.findTagFollow(session.user.id, normalize(data.tag)),
    )
    return { canFollow: state !== null, following: state?.following ?? false }
  })

export const setFollow = createServerFn({ method: "POST" })
  .validator(setFollowSchema)
  .handler(async ({ context, data }) => {
    assertMutationOrigin(context)
    const session = await requireRequestSession(context)
    const rateLimit = await context.env.USER_RATE_LIMITER.limit({ key: session.user.id })
    if (!rateLimit.success) throw new Error("The follow rate limit was reached.")
    const repository = createFollowRepository(createD1Database(context.env.DB))

    if (data.kind === "user") {
      const state = await Effect.runPromise(
        repository.findUserFollow(session.user.id, normalize(data.username)),
      )
      if (!state) throw new Error("The user was not found.")
      if (!canFollowUser(session.user.id, state.targetId)) {
        throw new Error("You cannot follow yourself.")
      }
      await Effect.runPromise(
        repository.setUserFollow(session.user.id, state.targetId, data.following),
      )
    } else {
      const state = await Effect.runPromise(
        repository.findTagFollow(session.user.id, normalize(data.tag)),
      )
      if (!state) throw new Error("The tag was not found.")
      await Effect.runPromise(
        repository.setTagFollow(session.user.id, state.targetId, data.following),
      )
    }

    return { canFollow: true, following: data.following }
  })
