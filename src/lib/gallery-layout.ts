export const galleryLayouts = ["masonry", "browser"] as const

export type GalleryLayout = (typeof galleryLayouts)[number]

export function isGalleryLayout(value: string): value is GalleryLayout {
  return galleryLayouts.some((layout) => layout === value)
}

export function resolveGalleryLayout(
  layout: GalleryLayout | undefined,
  selectedImageIndex: number | undefined,
): GalleryLayout {
  return layout ?? (selectedImageIndex === undefined ? "masonry" : "browser")
}
