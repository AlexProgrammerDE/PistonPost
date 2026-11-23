import { afterEach, describe, expect, it } from "bun:test"

import { eq } from "drizzle-orm"
import { Effect } from "effect"

import { createPost, createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"
import { commentPushJob, replyPushJob, type PushDeliveryJob } from "@/push/jobs"

import { PushJobResolver, pushJobResolverLayer } from "./push-job-resolver"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close()
})

function setup() {
  const database = createMigratedTestDatabase()
  databases.push(database)
  const now = Date.now()
  database
    .insert(schema.user)
    .values([
      createUser({ id: "author", email: "author@example.com" }),
      createUser({ id: "commenter", email: "commenter@example.com" }),
    ])
    .run()
  database
    .insert(schema.session)
    .values({
      id: "author-session",
      userId: "author",
      token: "author-token",
      createdAt: new Date(now),
      updatedAt: new Date(now),
      expiresAt: new Date(now + 60 * 60 * 1000),
    })
    .run()
  database
    .insert(schema.pushSubscriptions)
    .values({
      id: "author-push",
      userId: "author",
      sessionId: "author-session",
      endpoint: "https://fcm.googleapis.com/fcm/send/author",
      endpointHash: "a".repeat(64),
      p256dh: "p".repeat(64),
      auth: "a".repeat(24),
    })
    .run()
  database
    .insert(schema.posts)
    .values(
      createPost({
        id: "post",
        authorId: "author",
        status: "published",
        publishedAt: new Date(now),
      }),
    )
    .run()
  database
    .insert(schema.comments)
    .values([
      { id: "parent", postId: "post", authorId: "author", content: "Parent" },
      { id: "comment", postId: "post", authorId: "commenter", content: "Comment" },
      {
        id: "reply",
        postId: "post",
        authorId: "commenter",
        parentId: "parent",
        content: "Reply",
      },
    ])
    .run()
  const identity = { recipientUserId: "author", subscriptionId: "author-push" }
  const resolve = (job: PushDeliveryJob) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const resolver = yield* PushJobResolver
        return yield* resolver.resolve(job)
      }).pipe(Effect.provide(pushJobResolverLayer(database))),
    )
  const ban = (banExpires: Date | null) => {
    database
      .update(schema.user)
      .set({ banned: true, banExpires })
      .where(eq(schema.user.id, "commenter"))
      .run()
  }
  return { identity, resolve, ban }
}

describe("push job resolver", () => {
  it("delivers comment and reply pushes from an account in good standing", async () => {
    const { identity, resolve } = setup()

    expect(await resolve(commentPushJob(identity, "comment"))).toMatchObject({
      _tag: "Ready",
      payload: { url: "/post/post#comment-comment" },
    })
    expect(await resolve(replyPushJob(identity, "reply"))).toMatchObject({
      _tag: "Ready",
      payload: { url: "/post/post#comment-reply" },
    })
  })

  it("skips comment and reply pushes once the commenter is banned", async () => {
    const { identity, resolve, ban } = setup()
    ban(null)

    expect(await resolve(commentPushJob(identity, "comment"))).toEqual({
      _tag: "Skip",
      reason: "comment-unavailable",
    })
    expect(await resolve(replyPushJob(identity, "reply"))).toEqual({
      _tag: "Skip",
      reason: "comment-unavailable",
    })
  })

  it("delivers again after the commenter's ban expires", async () => {
    const { identity, resolve, ban } = setup()
    ban(new Date(Date.now() - 60_000))

    expect(await resolve(commentPushJob(identity, "comment"))).toMatchObject({ _tag: "Ready" })
  })
})
