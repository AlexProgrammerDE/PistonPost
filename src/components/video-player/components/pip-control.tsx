import { PictureInPictureIcon } from "@phosphor-icons/react"

import { PictureInPictureControl as PictureInPictureControlPrimitive } from "@/components/limeplay/picture-in-picture-control"
import { Button } from "@/components/video-player/components/button"
import { usePictureInPictureStore } from "@/hooks/limeplay/use-picture-in-picture"

export function PictureInPictureControl() {
  const isPictureInPictureActive = usePictureInPictureStore((state) => state.active)

  return (
    <PictureInPictureControlPrimitive
      shortcut="P"
      render={<Button className="cursor-pointer" size="icon" variant="glass" />}
    >
      <PictureInPictureIcon weight={isPictureInPictureActive ? "fill" : "bold"} />
    </PictureInPictureControlPrimitive>
  )
}
