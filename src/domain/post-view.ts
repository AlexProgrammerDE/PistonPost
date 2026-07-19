import { Schema } from "effect"

export const POST_VIEW_SURFACES = ["timeline", "following", "tag", "profile", "detail"] as const

export const postViewSurfaceSchema = Schema.Literal(...POST_VIEW_SURFACES)

export type PostViewSurface = Schema.Schema.Type<typeof postViewSurfaceSchema>
