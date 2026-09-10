import type { ComponentProps } from "react"

import { AppImage } from "@/components/AppImage"
import { AvatarImage } from "@/components/ui/avatar"
import { createManagedAvatarSources, createManagedAvatarSrcSet } from "@/lib/media-image"
import { cn } from "@/lib/utils"

type ResponsiveAvatarImageProps = ComponentProps<typeof AvatarImage> & {
  readonly sizes: string
}

export function ResponsiveAvatarImage({ src, sizes, ...props }: ResponsiveAvatarImageProps) {
  const sources = typeof src === "string" ? createManagedAvatarSources(src) : undefined
  const stillSrcSet = typeof src === "string" ? createManagedAvatarSrcSet(src, "still") : undefined

  if (!src) return <AvatarImage {...props} src={src} />

  const image = (
    <AvatarImage
      {...props}
      src={src}
      keepMounted
      render={(imageProps) => (
        <AppImage
          {...imageProps}
          src={src}
          width={256}
          height={256}
          sizes={sizes}
          sources={sources}
          className={cn(imageProps.className, "data-error:invisible data-loading:invisible")}
        />
      )}
    />
  )

  if (!stillSrcSet) return image

  return (
    <picture className="contents">
      <source media="(prefers-reduced-motion: reduce)" srcSet={stillSrcSet} sizes={sizes} />
      {image}
    </picture>
  )
}
