import { createMediaKit } from "@/components/limeplay/media-provider"
import { assetFeature } from "@/hooks/limeplay/use-asset"
import { captionsFeature } from "@/hooks/limeplay/use-captions"
import { mediaFeature } from "@/hooks/limeplay/use-media"
import { pictureInPictureFeature } from "@/hooks/limeplay/use-picture-in-picture"
import { playbackFeature } from "@/hooks/limeplay/use-playback"
import { playbackRateFeature } from "@/hooks/limeplay/use-playback-rate"
import { playerFeature } from "@/hooks/limeplay/use-player"
import { playlistFeature } from "@/hooks/limeplay/use-playlist"
import { timelineFeature } from "@/hooks/limeplay/use-timeline"
import { volumeFeature } from "@/hooks/limeplay/use-volume"

export const media = createMediaKit({
  features: [
    mediaFeature(),
    playerFeature(),
    playbackFeature(),
    playlistFeature(),
    volumeFeature(),
    timelineFeature(),
    captionsFeature(),
    playbackRateFeature(),
    pictureInPictureFeature(),
    assetFeature(),
  ] as const,
})

export const MediaProvider = media.MediaProvider
export const useMediaEvents = media.useMediaEvents
