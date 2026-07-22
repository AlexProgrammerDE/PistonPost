import { describe, expect, it } from "bun:test"

import { readRequiredEmailValue, readUnsubscribeKeyring } from "./email-config"

describe("email configuration", () => {
  it("retains old unsubscribe keys while selecting one current signing key", async () => {
    const current = "current-email-signing-key-with-at-least-32-characters"
    const previous = "previous-email-signing-key-with-at-least-32-characters"

    const keyring = await readUnsubscribeKeyring(
      JSON.stringify({ current, previous: [previous, current] }),
    )

    expect(keyring).toEqual({ current, verificationKeys: [current, previous] })
  })

  it("rejects missing campaign addresses and short signing keys", async () => {
    expect(readRequiredEmailValue("  ", "MARKETING_POSTAL_ADDRESS")).rejects.toThrow("unavailable")
    expect(readUnsubscribeKeyring("too-short")).rejects.toThrow("at least 32 characters")
  })
})
