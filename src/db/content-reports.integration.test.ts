import { afterEach, describe, expect, it } from "bun:test"

import { createUser } from "./factories"
import { contentReports, user } from "./schema"
import { createMigratedTestDatabase } from "./test-database"

let close: (() => void) | undefined

afterEach(() => {
  close?.()
  close = undefined
})

describe("content reports", () => {
  it("retains moderation evidence when the reporter account is deleted", () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()
    const reporter = createUser({ id: "reporter" })
    database.insert(user).values(reporter).run()
    database
      .insert(contentReports)
      .values({
        id: "report-one",
        reporterId: reporter.id,
        targetType: "post",
        targetId: "post-one",
        reason: "spam",
      })
      .run()

    database.delete(user).run()

    expect(database.select().from(contentReports).get()?.reporterId).toBeNull()
  })

  it("enforces report details at the database boundary", () => {
    const database = createMigratedTestDatabase()
    close = () => database.$client.close()

    expect(() =>
      database
        .insert(contentReports)
        .values({
          id: "invalid-report",
          targetType: "profile",
          targetId: "alex",
          reason: "other",
          details: "x".repeat(1001),
        })
        .run(),
    ).toThrow()
  })
})
