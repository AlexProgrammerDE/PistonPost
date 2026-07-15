import type { ComponentProps } from "react"

import { AvatarImage } from "@/components/ui/avatar"
import { createManagedAvatarSrcSet } from "@/lib/media-image"

type ResponsiveAvatarImageProps = ComponentProps<typeof AvatarImage> & {
  readonly sizes: string
}

export function ResponsiveAvatarImage({ src, sizes, ...props }: ResponsiveAvatarImageProps) {
  const srcSet = typeof src === "string" ? createManagedAvatarSrcSet(src) : undefined

  return <AvatarImage {...props} src={src} srcSet={srcSet} sizes={srcSet ? sizes : undefined} />
}
