import { createServerFn } from "@tanstack/react-start"
import { Effect, Schema } from "effect"

import { listOwnedUnlistedPostReads } from "@/db/owned-post-read-model"
import { decodePublicPostCursor, encodePublicPostCursor } from "@/domain/cursor"
import { serverFunctionValidator } from "@/lib/server-function-error"
import { bindingOperation } from "@/server/operation"
import { runRequestEffect } from "@/server/request-effect"
import { authenticatedServerFunctionMiddleware } from "@/server/server-function-middleware"

const ownedUnlistedPostsInput = Schema.Struct({
  username: Schema.Trim.check(Schema.isMinLength(1)).check(Schema.isMaxLength(32)),
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  limit: Schema.Finite.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(1))
    .check(Schema.isLessThanOrEqualTo(30))
    .pipe(Schema.withDecodingDefaultType(Effect.succeed(12))),
})

/**
 * Lists the signed-in viewer's own unlisted posts on their profile so they can find them without
 * the link. Another user's profile returns an empty page, so the client never needs the owner ID.
 */
export const getOwnedUnlistedPosts = createServerFn({ method: "GET" })
  .middleware([authenticatedServerFunctionMiddleware])
  .validator(serverFunctionValidator(ownedUnlistedPostsInput))
  .handler(({ context, data }) =>
    runRequestEffect(
      Effect.gen(function* () {
        const { database, session } = context
        const cursor = data.cursor ? yield* decodePublicPostCursor(data.cursor) : null
        const page = yield* bindingOperation("getOwnedUnlistedPosts.page", () =>
          listOwnedUnlistedPostReads(database, {
            ownerId: session.user.id,
            username: data.username.toLocaleLowerCase("en-US"),
            cursor,
            limit: data.limit,
          }),
        )

        return {
          posts: page.posts,
          nextCursor: page.nextCursor ? encodePublicPostCursor(page.nextCursor) : null,
        }
      }),
    ),
  )
