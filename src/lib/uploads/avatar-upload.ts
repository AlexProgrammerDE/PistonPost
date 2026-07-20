import { mediaImageUrl } from "@/lib/media-image"
import { prepareImageForUpload } from "@/lib/uploads/image-preparation"
import { cancelAvatarUpload, createAvatarUploadIntent, deleteManagedAvatar } from "@/server/avatar"

import { uploadImage } from "./image-upload-client"

// Better Auth UI otherwise square-crops and re-encodes before our shared image pipeline runs.
export function preserveAvatarSource(file: File) {
  return Promise.resolve(file)
}

export async function uploadManagedAvatar(file: File) {
  const prepared = await prepareImageForUpload(file)

  const intent = await createAvatarUploadIntent({
    data: {
      filename: prepared.metadata.filename,
      mimeType: prepared.metadata.mimeType,
      byteSize: prepared.file.size,
    },
  })

  try {
    await uploadImage(intent.uploadUrl, prepared.file, prepared.metadata, () => undefined)
  } catch (error) {
    await cancelAvatarUpload({ data: { id: intent.assetId } }).catch(() => undefined)
    throw error
  }

  return mediaImageUrl(intent.assetId, "avatar")
}

export async function removeManagedAvatar() {
  await deleteManagedAvatar({ data: {} })
}
