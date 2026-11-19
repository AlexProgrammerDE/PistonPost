import { describe, expect, test } from "bun:test"

import { Schema } from "effect"

import { ResponsiveAvatarImage } from "./ResponsiveAvatarImage"
import { ResponsiveMediaImage } from "./ResponsiveMediaImage"

// React element props are typed as `any`, so decode the parts these tests read.
const pictureChildren = Schema.decodeUnknownSync(
  Schema.Struct({
    props: Schema.Struct({
      children: Schema.Tuple([
        Schema.Struct({
          props: Schema.Struct({ media: Schema.optional(Schema.String), srcSet: Schema.String }),
        }),
        Schema.Struct({
          props: Schema.Struct({
            src: Schema.String,
            sources: Schema.optional(Schema.Array(Schema.Struct({ src: Schema.String }))),
          }),
        }),
      ]),
    }),
  }),
)

describe("responsive media motion", () => {
  test("offers a still post image source when reduced motion is preferred", () => {
    const picture = ResponsiveMediaImage({
      alt: "An animated reaction",
      image: {
        id: "image-id",
        kind: "image",
        width: 640,
        height: 480,
        duration: null,
        altText: "An animated reaction",
      },
      variant: "feed",
      sizes: "40rem",
      widths: [320, 640],
    })
    const [stillSource, image] = pictureChildren(picture).props.children

    expect(picture.type).toBe("picture")
    expect(stillSource.props.media).toBe("(prefers-reduced-motion: reduce)")
    expect(stillSource.props.srcSet).toContain("animation=still")
    expect(image.props.src).toBe("/media/image/image-id/feed?v=1")
    expect(
      image.props.sources?.every(
        (source) => !new URL(source.src, "https://pistonpost.test").searchParams.has("animation"),
      ),
    ).toBe(true)
  })

  test("offers a still managed avatar source without changing external avatars", () => {
    const managed = ResponsiveAvatarImage({
      alt: "Moss",
      src: "/media/image/avatar-id/avatar",
      sizes: "2rem",
    })
    const external = ResponsiveAvatarImage({
      alt: "Moss",
      src: "https://images.example/avatar.gif",
      sizes: "2rem",
    })
    const [stillSource, image] = pictureChildren(managed).props.children

    expect(managed.type).toBe("picture")
    expect(stillSource.props.srcSet).toContain("animation=still")
    expect(image.props.src).toBe("/media/image/avatar-id/avatar")
    expect(external.type).not.toBe("picture")
  })
})
