import { describe, expect, test } from "bun:test"

import { avatarInitials } from "./avatar-initials"

describe("avatar initials", () => {
  test("uses the first letters of the first and last words", () => {
    expect(avatarInitials("Alice Moss")).toBe("AM")
    expect(avatarInitials("  maria  de la cruz ")).toBe("MC")
    expect(avatarInitials("Mary-Jane Watson")).toBe("MW")
    expect(avatarInitials("Анна Петрова")).toBe("АП")
  })

  test("uses one letter for a single word", () => {
    expect(avatarInitials("alex")).toBe("A")
    expect(avatarInitials("x")).toBe("X")
    expect(avatarInitials("")).toBe("")
    expect(avatarInitials("   ")).toBe("")
  })

  test("skips emoji and punctuation in favor of letters", () => {
    expect(avatarInitials("🎨 Alice Moss")).toBe("AM")
    expect(avatarInitials("(alex) 😀")).toBe("A")
    expect(avatarInitials("éclair au chocolat")).toBe("ÉC")
    expect(avatarInitials("R2 D2")).toBe("RD")
    expect(avatarInitials("42 club")).toBe("4")
  })

  test("keeps one character for scripts without letter case", () => {
    expect(avatarInitials("山田 太郎")).toBe("山")
    expect(avatarInitials("김민준")).toBe("김")
  })

  test("falls back to a whole emoji when the name has no letters", () => {
    expect(avatarInitials("👩‍👩‍👧 🎉")).toBe("👩‍👩‍👧")
    expect(avatarInitials("🇩🇪")).toBe("🇩🇪")
  })
})
