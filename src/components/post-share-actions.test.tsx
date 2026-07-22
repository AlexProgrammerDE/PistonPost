import { describe, expect, test } from "bun:test"

import { DropdownMenu } from "@/components/ui/dropdown-menu"

import { CopyPostLinkButton, PostShareActions } from "./post-share-actions"

describe("post share actions", () => {
  test("uses a direct copy action unless the post has multiple share options", () => {
    const textPostAction = PostShareActions({ postId: "text-post", imageCount: 0 })
    const singleImagePostAction = PostShareActions({ postId: "image-post", imageCount: 1 })
    const galleryPostAction = PostShareActions({ postId: "gallery-post", imageCount: 2 })

    expect(textPostAction.type).toBe(CopyPostLinkButton)
    expect(singleImagePostAction.type).toBe(CopyPostLinkButton)
    expect(galleryPostAction.type).toBe(DropdownMenu)
  })
})
