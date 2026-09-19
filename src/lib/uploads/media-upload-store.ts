import { createAtom, shallow } from "@tanstack/react-store"

import { mediaUploadReducer, type UploadAction, type UploadItem } from "./media-upload-state"

export function createMediaUploadStore() {
  const uploads = createAtom<UploadItem[]>([])
  const pickerItems = createAtom(
    () =>
      uploads.get().map(({ clientId, file, filename, kind, previewUrl, altText }) => ({
        clientId,
        file,
        filename,
        kind,
        previewUrl,
        altText,
      })),
    {
      compare: (previous, next) =>
        previous.length === next.length &&
        previous.every((item, index) => shallow(item, next[index])),
    },
  )

  return {
    uploads,
    pickerItems,
    dispatch: (action: UploadAction) => uploads.set((items) => mediaUploadReducer(items, action)),
  }
}

export type MediaUploadStore = ReturnType<typeof createMediaUploadStore>
