import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react"
import { useMemo } from "react"
import Lightbox, { type SlideImage } from "yet-another-react-lightbox"
import Counter from "yet-another-react-lightbox/plugins/counter"
import Zoom from "yet-another-react-lightbox/plugins/zoom"

import type { PublicPostMedia } from "@/db/public-read-model"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { DETAIL_IMAGE_WIDTHS, createMediaImageSources, mediaImageUrl } from "@/lib/media-image"

const lightboxPlugins = [Counter, Zoom]

type ImageLightboxViewerProps = {
  readonly slides: ReadonlyArray<SlideImage>
  readonly label: string
  readonly galleryLabel: string
  readonly index: number
  readonly onClose: () => void
  readonly onIndexChange: (index: number) => void
}

function PreviousIcon() {
  return <ChevronLeft aria-hidden="true" className="yarl__icon" />
}

function NextIcon() {
  return <ChevronRight aria-hidden="true" className="yarl__icon" />
}

function CloseIcon() {
  return <X aria-hidden="true" className="yarl__icon" />
}

function ZoomInIcon() {
  return <ZoomIn aria-hidden="true" className="yarl__icon" />
}

function ZoomOutIcon() {
  return <ZoomOut aria-hidden="true" className="yarl__icon" />
}

export function ImageLightboxViewer({
  slides,
  label,
  galleryLabel,
  index,
  onClose,
  onIndexChange,
}: ImageLightboxViewerProps) {
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={lightboxPlugins}
      carousel={{ finite: slides.length < 2, preload: 2 }}
      controller={{ closeOnBackdropClick: true }}
      zoom={{ scrollToZoom: true }}
      labels={{
        Lightbox: label,
        "Photo gallery": galleryLabel,
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
  const prefersReducedMotion = usePrefersReducedMotion()
  const animation = prefersReducedMotion ? "still" : "auto"
  const slides = useMemo<ReadonlyArray<SlideImage>>(
    () =>
      images.map((image) => {
        const srcSet = createMediaImageSources(image, "detail", DETAIL_IMAGE_WIDTHS, animation)
        return {
          src: mediaImageUrl(image.id, "detail", undefined, animation),
          alt: image.altText ?? "",
          ...(image.width && image.height
            ? { width: image.width, height: image.height }
            : undefined),
          ...(srcSet.length > 0 ? { srcSet } : undefined),
        }
      }),
    [animation, images],
  )

  return (
    <ImageLightboxViewer
      slides={slides}
      label={`${title} image viewer`}
      galleryLabel={`${title} images`}
      index={index}
      onClose={onClose}
      onIndexChange={onIndexChange}
    />
  )
}
