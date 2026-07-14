import { Context, type Effect } from "effect"

import type { RepositoryError } from "./errors"
import type { Post, PublicPostCursor } from "./model"

export type ListPublicPostsInput = {
  readonly cursor: PublicPostCursor | null
  readonly limit: number
}

export type PostRepositoryService = {
  readonly findById: (id: string) => Effect.Effect<Post | null, RepositoryError>
  readonly insert: (post: Post) => Effect.Effect<void, RepositoryError>
  readonly listPublic: (
    input: ListPublicPostsInput,
  ) => Effect.Effect<ReadonlyArray<Post>, RepositoryError>
}

export class PostRepository extends Context.Tag("@pistonpost/domain/PostRepository")<
  PostRepository,
  PostRepositoryService
>() {}
