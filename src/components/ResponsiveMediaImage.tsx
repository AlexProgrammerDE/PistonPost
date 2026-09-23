import type { ComponentProps } from "react"

import { AppImage } from "@/components/AppImage"
import type { PublicPostMedia } from "@/db/public-read-model"
import {
  DETAIL_IMAGE_WIDTHS,
  FEED_IMAGE_WIDTHS,
  createMediaImageSrcSet,
  createMediaImageSources,
  mediaImageUrl,
  type ResponsiveMediaImageVariant,
} from "@/lib/media-image"
import { cn } from "@/lib/utils"

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
  const sources = createMediaImageSources(image, variant, widths)
  const stillSrcSet = createMediaImageSrcSet(image, variant, widths, "still")
  const stillSource = stillSrcSet ?? mediaImageUrl(image.id, variant, undefined, "still")
  const placeholderStyle = {
    ...props.style,
    "--image-placeholder": image.placeholderColor ?? undefined,
  }

  return (
    <picture className="contents">
      <source
        media="(prefers-reduced-motion: reduce)"
        srcSet={stillSource}
        sizes={stillSrcSet ? sizes : undefined}
      />
      <AppImage
        {...props}
        alt={alt}
        src={mediaImageUrl(image.id, variant)}
        sources={sources}
        sizes={sizes}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        className={cn("bg-(--image-placeholder)", props.className)}
        style={placeholderStyle}
      />
    </picture>
  )
}
