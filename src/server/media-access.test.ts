import { describe, expect, test } from "bun:test"

import { canViewMedia, mediaAudience } from "./media-access"

const now = new Date("2026-11-16T12:00:00Z")
const owner = { id: "owner", role: "user", banned: false }
const admin = { id: "admin", role: "admin", banned: false }
const stranger = { id: "stranger", role: "user", banned: false }

describe("media access", () => {
  test("serves published media from an active author to everyone", () => {
    const audience = mediaAudience({ published: true, authorBanned: false })
    expect(audience).toBe("public")
    expect(canViewMedia(audience, "owner", null, now)).toBeTrue()
  })

  test("keeps unpublished media with its owner", () => {
    const audience = mediaAudience({ published: false, authorBanned: false })
    expect(audience).toBe("owner")
    expect(canViewMedia(audience, "owner", owner, now)).toBeTrue()
    expect(canViewMedia(audience, "owner", admin, now)).toBeFalse()
    expect(canViewMedia(audience, "owner", null, now)).toBeFalse()
  })

  test("hides a banned author's media from the public but not the owner or an admin", () => {
    const audience = mediaAudience({ published: true, authorBanned: true })
    expect(audience).toBe("owner-or-admin")
    expect(canViewMedia(audience, "owner", null, now)).toBeFalse()
    expect(canViewMedia(audience, "owner", stranger, now)).toBeFalse()
    expect(canViewMedia(audience, "owner", owner, now)).toBeTrue()
    expect(canViewMedia(audience, "owner", admin, now)).toBeTrue()
  })

  test("treats an admin with an active ban as a stranger and an expired ban as active", () => {
    const audience = mediaAudience({ published: true, authorBanned: true })
    const bannedAdmin = { ...admin, banned: true, banExpires: new Date("2026-11-17T00:00:00Z") }
    const expiredAdmin = { ...admin, banned: true, banExpires: new Date("2026-11-15T00:00:00Z") }
    expect(canViewMedia(audience, "owner", bannedAdmin, now)).toBeFalse()
    expect(canViewMedia(audience, "owner", expiredAdmin, now)).toBeTrue()
  })

  test("does not treat a missing owner as a match", () => {
    const audience = mediaAudience({ published: false, authorBanned: false })
    expect(canViewMedia(audience, null, stranger, now)).toBeFalse()
  })
})
