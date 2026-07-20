import { CircleNotchIcon, PauseIcon, PlayIcon, RepeatIcon } from "@phosphor-icons/react"

import { PlaybackControl } from "@/components/limeplay/playback-control"
import { Button } from "@/components/video-player/components/button"
import { usePlaybackStore } from "@/hooks/limeplay/use-playback"

export function PlaybackStateControl() {
  const status = usePlaybackStore((state) => state.status)

  return (
    <PlaybackControl render={<Button className="cursor-pointer" size="icon" variant="glass" />}>
      {status === "playing" ? (
        <PauseIcon weight="fill" />
      ) : status === "ended" ? (
        <RepeatIcon />
      ) : status === "buffering" || status === "loading" ? (
        <CircleNotchIcon className="animate-spin" weight="bold" />
      ) : (
        <PlayIcon weight="fill" />
      )}
    </PlaybackControl>
  )
}
