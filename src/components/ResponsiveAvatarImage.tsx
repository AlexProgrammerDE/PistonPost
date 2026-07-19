import type { ComponentProps } from "react"

import { AvatarImage } from "@/components/ui/avatar"
import { createManagedAvatarSrcSet } from "@/lib/media-image"

type ResponsiveAvatarImageProps = ComponentProps<typeof AvatarImage> & {
  readonly sizes: string
}

export function ResponsiveAvatarImage({ src, sizes, ...props }: ResponsiveAvatarImageProps) {
  const srcSet = typeof src === "string" ? createManagedAvatarSrcSet(src) : undefined
  const stillSrcSet = typeof src === "string" ? createManagedAvatarSrcSet(src, "still") : undefined

  if (!srcSet || !stillSrcSet) return <AvatarImage {...props} src={src} />

  return (
    <picture className="contents">
      <source media="(prefers-reduced-motion: reduce)" srcSet={stillSrcSet} sizes={sizes} />
      <AvatarImage {...props} src={src} srcSet={srcSet} sizes={sizes} />
    </picture>
  )
}
