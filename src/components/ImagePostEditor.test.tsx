import { describe, expect, test } from "bun:test"

import { renderToString } from "react-dom/server"

import type { EditablePostImage } from "@/lib/uploads/post-edit-images"

import { ImagePostEditor } from "./ImagePostEditor"

const images: EditablePostImage[] = [
  {
    clientId: "first",
    id: "media-first",
    filename: "first.png",
    altText: "First",
    previewUrl: "/media/image/media-first/thumbnail",
    file: null,
  },
]

function render() {
  return renderToString(
    <ImagePostEditor
      images={images}
      disabled={false}
      preparing={false}
      onChange={() => undefined}
      onPreparing={() => undefined}
    />,
  )
}

/** The accessibility description each drag handle points at. */
function describedByIds(html: string) {
  return [...html.matchAll(/<button[^>]*aria-label="Reorder [^"]*"[^>]*>/gu)].map(
    ([button]) => /aria-describedby="([^"]+)"/u.exec(button)?.[1],
  )
}

describe("image post editor", () => {
  test("gives the drag handles the same accessibility IDs on every server render", () => {
    // dnd-kit's own counter keeps counting across renders in one server process, so the
    // browser would hydrate different IDs than the server sent.
    const first = describedByIds(render())
    const second = describedByIds(render())

    expect(first.length).toBeGreaterThan(0)
    expect(second).toEqual(first)
  })
})
