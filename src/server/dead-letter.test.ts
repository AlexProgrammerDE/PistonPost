import { describe, expect, test } from "bun:test"

import { deadLetterMetadata } from "./dead-letter"

describe("dead-letter metadata", () => {
  test("keeps operator fields and drops private job content", () => {
    const metadata = deadLetterMetadata("pistonpost-dead-letter", {
      id: "message-one",
      attempts: 6,
      body: {
        type: "email.comment",
        to: "private@example.com",
        data: { actorName: "Private person" },
      },
    })

    expect(metadata).toEqual({
      messageId: "message-one",
      sourceQueue: "pistonpost-dead-letter",
      originalType: "email.comment",
      attempts: 6,
    })
    expect(JSON.stringify(metadata)).not.toContain("private@example.com")
  })
})
