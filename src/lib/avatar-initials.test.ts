import { describe, expect, test } from "bun:test"

import { avatarInitials } from "./avatar-initials"

describe("avatar initials", () => {
  test("uses the first two characters in upper case", () => {
    expect(avatarInitials("alex")).toBe("AL")
    expect(avatarInitials("  maria")).toBe("MA")
    expect(avatarInitials("x")).toBe("X")
    expect(avatarInitials("")).toBe("")
  })

  test("keeps emoji and combined characters whole", () => {
    expect(avatarInitials("😀😃 smile")).toBe("😀😃")
    expect(avatarInitials("👩‍👩‍👧family")).toBe("👩‍👩‍👧F")
    expect(avatarInitials("🇩🇪🇫🇷")).toBe("🇩🇪🇫🇷")
    expect(avatarInitials("éclair")).toBe("ÉC")
  })
})
