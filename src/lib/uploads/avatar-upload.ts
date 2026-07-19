import { mediaImageUrl } from "@/lib/media-image"
import { normalizeImageUploadMetadata } from "@/lib/uploads/image-file-normalization"
import { MAX_IMAGE_UPLOAD_BYTES, isImageUploadMimeType } from "@/lib/uploads/image-upload-policy"
import { cancelAvatarUpload, createAvatarUploadIntent, deleteManagedAvatar } from "@/server/avatar"

import { UploadClientError, uploadImage } from "./image-upload-client"

export function preserveAvatarOriginal(file: File) {
  return Promise.resolve(file)
}

export async function uploadManagedAvatar(file: File) {
  if (file.size < 1 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new UploadClientError("The avatar must be no larger than 15 MB.")
  }
  const metadata = await normalizeImageUploadMetadata(file)
  if (!isImageUploadMimeType(metadata.mimeType)) {
    throw new UploadClientError("Choose a JPEG, PNG, GIF, WebP, or AVIF image.")
  }

  const intent = await createAvatarUploadIntent({
    data: {
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      byteSize: file.size,
    },
  })

  try {
    await uploadImage(intent.uploadUrl, file, metadata, () => undefined)
  } catch (error) {
    await cancelAvatarUpload({ data: { id: intent.assetId } }).catch(() => undefined)
    throw error
  }

  return mediaImageUrl(intent.assetId, "avatar")
}

export async function removeManagedAvatar() {
  await deleteManagedAvatar({ data: {} })
}
