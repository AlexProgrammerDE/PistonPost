import { afterEach, describe, expect, it } from "bun:test"

import { eq } from "drizzle-orm"
import { Effect } from "effect"

import { createPost, createUser } from "@/db/factories"
import * as schema from "@/db/schema"
import { createMigratedTestDatabase } from "@/db/test-database"
import { commentEmailJob, replyEmailJob, type EmailDeliveryJob } from "@/email/jobs"

import { EmailJobResolver, emailJobResolverLayer } from "./email-job-resolver"

const databases: ReturnType<typeof createMigratedTestDatabase>[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close()
})

function setup() {
  const database = createMigratedTestDatabase()
  databases.push(database)
  database
    .insert(schema.user)
    .values([
      createUser({ id: "author", email: "author@example.com" }),
      createUser({ id: "commenter", email: "commenter@example.com" }),
    ])
    .run()
  database
    .insert(schema.posts)
    .values(
      createPost({
        id: "post",
        authorId: "author",
        status: "published",
        publishedAt: new Date(),
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
  const layer = emailJobResolverLayer(database, {
    baseURL: "https://pistonpost.test",
    getUnsubscribeSecret: () => Promise.resolve("test-unsubscribe-secret-with-enough-length"),
  })
  const resolve = (job: EmailDeliveryJob) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const resolver = yield* EmailJobResolver
        return yield* resolver.resolve(job)
      }).pipe(Effect.provide(layer)),
    )
  const ban = (banExpires: Date | null) => {
    database
      .update(schema.user)
      .set({ banned: true, banExpires })
      .where(eq(schema.user.id, "commenter"))
      .run()
  }
  return { resolve, ban }
}

describe("email job resolver", () => {
  it("sends comment and reply emails from an account in good standing", async () => {
    const { resolve } = setup()

    expect(await resolve(commentEmailJob("author", "comment"))).toMatchObject({
      _tag: "Ready",
      to: "author@example.com",
    })
    expect(await resolve(replyEmailJob("author", "reply"))).toMatchObject({
      _tag: "Ready",
      to: "author@example.com",
    })
  })

  it("skips comment and reply emails once the commenter is banned", async () => {
    const { resolve, ban } = setup()
    ban(null)

    expect(await resolve(commentEmailJob("author", "comment"))).toEqual({
      _tag: "Skip",
      reason: "content-unavailable",
    })
    expect(await resolve(replyEmailJob("author", "reply"))).toEqual({
      _tag: "Skip",
      reason: "content-unavailable",
    })
  })

  it("sends again after the commenter's ban expires", async () => {
    const { resolve, ban } = setup()
    ban(new Date(Date.now() - 60_000))

    expect(await resolve(commentEmailJob("author", "comment"))).toMatchObject({ _tag: "Ready" })
  })
})
