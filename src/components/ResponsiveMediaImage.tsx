import type { ComponentProps } from "react"

import type { PublicPostMedia } from "@/db/public-read-model"
import {
  DETAIL_IMAGE_WIDTHS,
  FEED_IMAGE_WIDTHS,
  createMediaImageSrcSet,
  mediaImageUrl,
  type ResponsiveMediaImageVariant,
} from "@/lib/media-image"

type ResponsiveMediaImageProps = Omit<
  ComponentProps<"img">,
  "src" | "srcSet" | "sizes" | "width" | "height" | "alt"
> & {
  readonly alt: string
  readonly image: PublicPostMedia
  readonly variant: Exclude<ResponsiveMediaImageVariant, "avatar">
  readonly sizes: string
  readonly widths?: ReadonlyArray<number>
}

export function ResponsiveMediaImage({
  alt,
  image,
  variant,
  sizes,
  widths = variant === "detail" ? DETAIL_IMAGE_WIDTHS : FEED_IMAGE_WIDTHS,
  ...props
}: ResponsiveMediaImageProps) {
  const srcSet = createMediaImageSrcSet(image, variant, widths)

  return (
    <img
      {...props}
      alt={alt}
      src={mediaImageUrl(image.id, variant)}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
    />
  )
}
