import { Schema } from "effect"

// StructWithRest keeps the fields the schema does not name, so tests can compare whole parts.
const rest = [Schema.Record(Schema.String, Schema.Unknown)] as const

const discordComponentSchema = Schema.StructWithRest(
  Schema.Struct({
    type: Schema.Finite,
    content: Schema.optional(Schema.String),
    items: Schema.optional(
      Schema.Array(
        Schema.StructWithRest(
          Schema.Struct({
            media: Schema.StructWithRest(Schema.Struct({ url: Schema.String }), rest),
          }),
          rest,
        ),
      ),
    ),
    components: Schema.optional(
      Schema.Array(
        Schema.StructWithRest(Schema.Struct({ url: Schema.optional(Schema.String) }), rest),
      ),
    ),
  }),
  rest,
)

const discordEmbedPayloadSchema = Schema.fromJsonString(
  Schema.Struct({
    component: Schema.Struct({
      type: Schema.Finite,
      components: Schema.Array(discordComponentSchema),
    }),
  }),
)

/** Parses the JSON that discordEmbedScript serializes for Discord component embeds. */
export const parseDiscordEmbedPayload = Schema.decodeSync(discordEmbedPayloadSchema)
