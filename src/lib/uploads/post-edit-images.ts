import { Schema } from "effect"

import { createImageUploadIntents } from "@/server/composer"

import { IMAGE_UPLOAD_MIME_TYPES, createImageUploadBatches } from "./image-upload-policy"
import { uploadImage } from "./upload-client"

export type EditablePostImage = {
  clientId: string
  id: string | null
  filename: string
  altText: string
  previewUrl: string
  file: File | null
}

export async function uploadPostEditImages(
  postId: string,
  images: EditablePostImage[],
  callbacks: {
    onReady: (clientId: string, id: string) => void
    onProgress: (filename: string, progress: number) => void
  },
) {
  const ready = new Map(images.flatMap((image) => (image.id ? [[image.clientId, image.id]] : [])))
  const pending = images.filter(
    (image): image is EditablePostImage & { file: File } =>
      image.id === null && image.file !== null,
  )
  for (const batch of createImageUploadBatches(pending)) {
    // Issue slots close to use and upload in order to bound memory and D1 writes.
    // eslint-disable-next-line no-await-in-loop
    const intents = await createImageUploadIntents({
      data: {
        postId,
        editing: true,
        files: batch.map((image) => ({
          filename: image.filename,
          mimeType: Schema.decodeUnknownSync(Schema.Literals(IMAGE_UPLOAD_MIME_TYPES))(
            image.file.type,
          ),
          byteSize: image.file.size,
          altText: image.altText,
        })),
      },
    })
    for (const [index, image] of batch.entries()) {
      const intent = intents[index]
      if (!intent) throw new Error("The image upload could not be started.")
      // eslint-disable-next-line no-await-in-loop
      await uploadImage(
        intent.uploadUrl,
        image.file,
        {
          filename: image.filename,
          mimeType: image.file.type,
        },
        (progress) => callbacks.onProgress(image.filename, progress),
      )
      ready.set(image.clientId, intent.assetId)
      callbacks.onReady(image.clientId, intent.assetId)
    }
  }
  return images.map((image) => {
    const id = ready.get(image.clientId)
    if (!id) throw new Error("Choose at least one ready image.")
    return { id, altText: image.altText }
  })
}
