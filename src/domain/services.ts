import { Context, Effect, Layer } from "effect"
import { ulid } from "ulid"

import { AuthorizationError, NotFoundError, type RepositoryError } from "./errors"
import type { Actor, Post } from "./model"
import { canViewPost, requireAuthenticated } from "./policy"
import { PostRepository, type ListPublicPostsInput } from "./repositories"
import type { PostDraftInput } from "./validation"

export type IdGeneratorService = {
  readonly next: () => string
}

export class IdGenerator extends Context.Tag("@pistonpost/domain/IdGenerator")<
  IdGenerator,
  IdGeneratorService
>() {
  static readonly live = Layer.succeed(IdGenerator, { next: ulid })
}

export type PostServiceShape = {
  readonly createPostDraft: (
    actor: Actor,
    input: PostDraftInput,
  ) => Effect.Effect<Post, AuthorizationError | RepositoryError>
  readonly getPostForViewer: (
    actor: Actor,
    id: string,
  ) => Effect.Effect<Post, AuthorizationError | NotFoundError | RepositoryError>
  readonly listPublicPosts: (
    input: ListPublicPostsInput,
  ) => Effect.Effect<ReadonlyArray<Post>, RepositoryError>
}

export class PostService extends Context.Tag("@pistonpost/domain/PostService")<
  PostService,
  PostServiceShape
>() {
  static readonly live = Layer.effect(
    PostService,
    Effect.gen(function* () {
      const ids = yield* IdGenerator
      const repository = yield* PostRepository

      return {
        createPostDraft: Effect.fn("PostService.createPostDraft")(function* (
          actor: Actor,
          input: PostDraftInput,
        ) {
          const authenticated = yield* requireAuthenticated(actor, "createPostDraft")
          const now = new Date()
          const post: Post = {
            id: ids.next(),
            authorId: authenticated.userId,
            type: input.type,
            status: "draft",
            visibility: input.visibility,
            title: input.title,
            textContent: input.type === "text" ? input.textContent : null,
            createdAt: now,
            updatedAt: now,
            publishedAt: null,
            deletedAt: null,
            moderationReason: null,
            version: 1,
          }
          yield* repository.insert(post)
          return post
        }),
        getPostForViewer: Effect.fn("PostService.getPostForViewer")(function* (
          actor: Actor,
          id: string,
        ) {
          const post = yield* repository.findById(id)
          if (post === null) {
            return yield* NotFoundError.make({ entity: "post", id })
          }
          if (!canViewPost(actor, post)) {
            return yield* NotFoundError.make({ entity: "post", id })
          }
          return post
        }),
        listPublicPosts: repository.listPublic,
      }
    }),
  )
}
