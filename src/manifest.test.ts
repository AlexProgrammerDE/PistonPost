import { describe, expect, it } from "bun:test"

import manifest from "../public/manifest.json"

describe("web manifest", () => {
  it("uses the PistonPost product identity", () => {
    expect(manifest.name).toBe("PistonPost")
    expect(manifest.short_name).toBe("PistonPost")
  })
})
