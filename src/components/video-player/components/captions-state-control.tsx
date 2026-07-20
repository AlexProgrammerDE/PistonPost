"use client"

import { ClosedCaptioningIcon } from "@phosphor-icons/react"

import { CaptionsControl } from "@/components/limeplay/captions"
import { Button } from "@/components/video-player/components/button"
import { useCaptionsStore } from "@/hooks/limeplay/use-captions"

export function CaptionsStateControl() {
  const textTrackVisible = useCaptionsStore((state) => state.visible)

  return (
    <CaptionsControl render={<Button className="cursor-pointer" size="icon" variant="glass" />}>
      <ClosedCaptioningIcon weight={textTrackVisible ? "fill" : "bold"} />
    </CaptionsControl>
  )
}
