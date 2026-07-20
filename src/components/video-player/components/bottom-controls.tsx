import * as Layout from "@/components/limeplay/player-layout"
import { CaptionsStateControl } from "@/components/video-player/components/captions-state-control"
import { PictureInPictureControl } from "@/components/video-player/components/pip-control"
import { PlaybackStateControl } from "@/components/video-player/components/playback-state-control"
import { Playlist } from "@/components/video-player/components/playlist"
import { PlaylistNextControl } from "@/components/video-player/components/playlist-navigation-controls"
import { TimelineSliderControl } from "@/components/video-player/components/timeline-slider-control"
import { VolumeGroupControl } from "@/components/video-player/components/volume-group-control"
import { CONTROLS_FORCE_VISIBLE_ATTRIBUTE } from "@/hooks/limeplay/use-controls-visibility"

export interface BottomControlsProps {
  className?: string
}

export function BottomControls({ className }: BottomControlsProps) {
  return (
    <Layout.ControlsBottomContainer
      className={className}
      {...{ [CONTROLS_FORCE_VISIBLE_ATTRIBUTE]: "" }}
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-1 transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] @3xl/root:grid-cols-[1fr_3fr_1fr] @3xl/root:gap-2">
        <div className="col-start-1 row-start-2 flex flex-row items-center gap-2 justify-self-start @3xl/root:col-start-1 @3xl/root:row-start-1">
          <PlaybackStateControl />
          <PlaylistNextControl />
          <VolumeGroupControl />
        </div>

        <div className="col-span-2 col-start-1 row-start-1 w-full @3xl/root:col-span-1 @3xl/root:col-start-2 @3xl/root:row-start-1">
          <TimelineSliderControl />
        </div>

        <div className="col-start-2 row-start-2 flex flex-row items-center gap-2 justify-self-end @3xl/root:col-start-3 @3xl/root:row-start-1">
          <CaptionsStateControl />
          <PictureInPictureControl />
          <Playlist />
        </div>
      </div>
    </Layout.ControlsBottomContainer>
  )
}
