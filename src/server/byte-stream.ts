/**
 * Types an untyped binding stream, such as an R2 object body, as a byte stream.
 * workers-types declares these bodies as `ReadableStream<any>`, while consumers such as the
 * Images binding expect `ReadableStream<Uint8Array>`. A chunk that is not bytes errors the stream.
 */
export function byteStream(body: ReadableStream<unknown>): ReadableStream<Uint8Array> {
  return body.pipeThrough(
    new TransformStream<unknown, Uint8Array>({
      transform(chunk, controller) {
        if (chunk instanceof Uint8Array) {
          controller.enqueue(chunk)
        } else {
          controller.error(new TypeError("Stream chunk is not a byte array."))
        }
      },
    }),
  )
}
