import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  SearchAddIcon,
  SearchMinusIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMemo } from "react"
import Lightbox, { type SlideImage } from "yet-another-react-lightbox"
import Counter from "yet-another-react-lightbox/plugins/counter"
import Zoom from "yet-another-react-lightbox/plugins/zoom"

import type { PublicPostMedia } from "@/db/public-read-model"
import { DETAIL_IMAGE_WIDTHS, createMediaImageSources, mediaImageUrl } from "@/lib/media-image"

const lightboxPlugins = [Counter, Zoom]

function PreviousIcon() {
  return (
    <HugeiconsIcon
      aria-hidden="true"
      icon={ArrowLeft01Icon}
      strokeWidth={2}
      className="yarl__icon"
    />
  )
}

function NextIcon() {
  return (
    <HugeiconsIcon
      aria-hidden="true"
      icon={ArrowRight01Icon}
      strokeWidth={2}
      className="yarl__icon"
    />
  )
}

function CloseIcon() {
  return (
    <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} strokeWidth={2} className="yarl__icon" />
  )
}

function ZoomInIcon() {
  return (
    <HugeiconsIcon aria-hidden="true" icon={SearchAddIcon} strokeWidth={2} className="yarl__icon" />
  )
}

function ZoomOutIcon() {
  return (
    <HugeiconsIcon
      aria-hidden="true"
      icon={SearchMinusIcon}
      strokeWidth={2}
      className="yarl__icon"
    />
  )
}

export function ImageLightbox({
  images,
  title,
  index,
  onClose,
  onIndexChange,
}: {
  readonly images: ReadonlyArray<PublicPostMedia>
  readonly title: string
  readonly index: number
  readonly onClose: () => void
  readonly onIndexChange: (index: number) => void
}) {
  const slides = useMemo<ReadonlyArray<SlideImage>>(
    () =>
      images.map((image) => {
        const srcSet = createMediaImageSources(image, "detail", DETAIL_IMAGE_WIDTHS)
        return {
          src: mediaImageUrl(image.id, "detail"),
          alt: image.altText ?? title,
          ...(image.width && image.height
            ? { width: image.width, height: image.height }
            : undefined),
          ...(srcSet.length > 0 ? { srcSet } : undefined),
        }
      }),
    [images, title],
  )

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={lightboxPlugins}
      carousel={{ finite: images.length < 2, preload: 2 }}
      controller={{ closeOnBackdropClick: true }}
      zoom={{ scrollToZoom: true }}
      labels={{
        Lightbox: `${title} image viewer`,
        "Photo gallery": `${title} images`,
      }}
      render={{
        iconPrev: PreviousIcon,
        iconNext: NextIcon,
        iconClose: CloseIcon,
        iconZoomIn: ZoomInIcon,
        iconZoomOut: ZoomOutIcon,
      }}
      on={{
        view: ({ index: nextIndex }) => onIndexChange(nextIndex),
      }}
    />
  )
}
