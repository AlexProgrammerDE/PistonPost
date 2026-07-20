import { ControlsTopContainer } from "@/components/limeplay/player-layout"
import type { VideoPlayerAsset } from "@/components/video-player/player"
import { useAsset } from "@/hooks/limeplay/use-asset"

export interface TopOverlayContainerProps {
  className?: string
}

export function TopOverlayContainer({ className }: TopOverlayContainerProps) {
  const { currentItem } = useAsset<VideoPlayerAsset>()
  const asset = currentItem?.properties
  const description = asset?.description
  const title = asset?.title?.trim()

  if (!title && !description) return null

  return (
    <ControlsTopContainer className={className}>
      <div className="max-w-xs @3xl/root:max-w-md">
        {title && (
          <h2 className="line-clamp-2 text-sm/tight font-semibold tracking-normal text-balance text-foreground drop-shadow-[0_3px_18px_rgba(0,0,0,0.86)] @3xl/root:text-lg/tight">
            {title}
          </h2>
        )}
        {description && (
          <p className="mt-1 line-clamp-1 max-w-sm text-xs/relaxed text-pretty text-foreground/80 drop-shadow-[0_2px_14px_rgba(0,0,0,0.78)] @3xl/root:line-clamp-2 @3xl/root:text-sm/relaxed">
            {description}
          </p>
        )}
      </div>
    </ControlsTopContainer>
  )
}
