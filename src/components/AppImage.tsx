import { Image } from "@unpic/react/base"
import type { ComponentProps } from "react"

import { getCloudflareImageTransformer } from "@/lib/image-transformer"
import type { MediaImageSource } from "@/lib/media-image"

type AppImageProps = Omit<ComponentProps<"img">, "src" | "srcSet" | "width" | "height"> & {
  readonly src: string
  readonly width?: number
  readonly height?: number
  readonly sources?: ReadonlyArray<MediaImageSource>
}

const noSources: ReadonlyArray<MediaImageSource> = []

// Application CSS owns cropping and sizing. Fixed, unstyled output retains intrinsic
// dimensions without Unpic's inline styles overriding gallery and avatar layouts.
export function AppImage({ src, width, height, sources = noSources, ...props }: AppImageProps) {
  const cloudflareTransformer = getCloudflareImageTransformer(src)

  return (
    <Image
      {...props}
      src={src}
      unstyled
      {...(width && height ? { layout: "fixed", width, height } : { layout: "fullWidth" })}
      breakpoints={cloudflareTransformer ? undefined : sources.map((source) => source.width)}
      transformer={
        cloudflareTransformer ??
        ((source: string | URL, operations: { width?: number }) =>
          sources.find((candidate) => candidate.width === operations.width)?.src ??
          source.toString())
      }
    />
  )
}
