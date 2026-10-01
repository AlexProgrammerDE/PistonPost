import { Schema } from "effect"

export const postTypeSchema = Schema.Literals(["text", "images", "video"])
export const postStatusSchema = Schema.Literals([
  "draft",
  "processing",
  "published",
  "moderated",
  "deleted",
  "failed",
])
export const postVisibilitySchema = Schema.Literals(["public", "unlisted"])

export const actorSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("anonymous") }),
  Schema.Struct({
    kind: Schema.Literal("authenticated"),
    userId: Schema.String,
    roles: Schema.Array(Schema.String),
  }),
])

export type Actor = Schema.Schema.Type<typeof actorSchema>

export const postSchema = Schema.Struct({
  id: Schema.String,
  authorId: Schema.String,
  type: postTypeSchema,
  status: postStatusSchema,
  visibility: postVisibilitySchema,
  title: Schema.String,
  textContent: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  publishedAt: Schema.NullOr(Schema.Date),
  deletedAt: Schema.NullOr(Schema.Date),
  moderationReason: Schema.NullOr(Schema.String),
  version: Schema.Int,
})

export type Post = Schema.Schema.Type<typeof postSchema>

export type PublicPostCursor = {
  readonly publishedAt: Date
  readonly id: string
}
