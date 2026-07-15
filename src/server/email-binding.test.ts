import { describe, expect, test } from "bun:test"

import { requireEmailBinding } from "./email-binding"

describe("requireEmailBinding", () => {
  test("rejects environments without email delivery", () => {
    expect(() => requireEmailBinding({})).toThrow("Email delivery is not configured")
  })

  test("returns the configured binding", () => {
    const binding = { send: async () => ({ messageId: "test-message" }) }

    expect(requireEmailBinding({ EMAIL: binding })).toBe(binding)
  })
})
