"use client"

import { SpeakerHighIcon, SpeakerLowIcon, SpeakerXIcon } from "@phosphor-icons/react"

import { MuteControl } from "@/components/limeplay/mute-control"
import { Button } from "@/components/video-player/components/button"
import { useVolumeStore } from "@/hooks/limeplay/use-volume"

export function VolumeStateControl() {
  const muted = useVolumeStore((state) => state.muted)
  const volume = useVolumeStore((state) => state.level)

  return (
    <MuteControl render={<Button className="cursor-pointer" size="icon" variant="glass" />}>
      {muted || volume === 0 ? (
        <SpeakerXIcon weight="fill" />
      ) : volume < 0.5 ? (
        <SpeakerLowIcon weight="fill" />
      ) : (
        <SpeakerHighIcon weight="fill" />
      )}
    </MuteControl>
  )
}
