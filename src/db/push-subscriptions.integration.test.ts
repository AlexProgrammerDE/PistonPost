import { afterEach, describe, expect, it } from "bun:test"

import { createMigratedTestDatabase, createUser, schema } from "@/db"

const databases: Array<ReturnType<typeof createMigratedTestDatabase>> = []

afterEach(() => {
  for (const database of databases) database.$client.close()
  databases.length = 0
})

function createDatabase() {
  const database = createMigratedTestDatabase()
  databases.push(database)
  return database
}

function createSession(id: string, userId: string) {
  const now = new Date("2026-07-21T12:00:00.000Z")
  return {
    id,
    userId,
    token: `token-${id}`,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date("2026-07-28T12:00:00.000Z"),
  }
}

function createSubscription(id: string, userId: string, sessionId: string, endpointHash: string) {
  return {
    id,
    userId,
    sessionId,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    endpointHash,
    p256dh: "p".repeat(64),
    auth: "a".repeat(24),
  }
}

describe("push subscription storage", () => {
  it("removes a browser capability when its auth session is revoked", () => {
    const database = createDatabase()
    database.insert(schema.user).values(createUser()).run()
    database.insert(schema.session).values(createSession("session", "test-user")).run()
    database
      .insert(schema.pushSubscriptions)
      .values(createSubscription("push", "test-user", "session", "a".repeat(64)))
      .run()

    database.delete(schema.session).run()

    expect(database.select().from(schema.pushSubscriptions).all()).toHaveLength(0)
  })

  it("keeps one owner for an endpoint capability", () => {
    const database = createDatabase()
    database
      .insert(schema.user)
      .values([
        createUser({ id: "first", email: "first@example.com" }),
        createUser({ id: "second", email: "second@example.com" }),
      ])
      .run()
    database
      .insert(schema.session)
      .values([createSession("first-session", "first"), createSession("second-session", "second")])
      .run()
    const endpointHash = "b".repeat(64)
    database
      .insert(schema.pushSubscriptions)
      .values(createSubscription("first-push", "first", "first-session", endpointHash))
      .run()

    expect(() =>
      database
        .insert(schema.pushSubscriptions)
        .values(createSubscription("second-push", "second", "second-session", endpointHash))
        .run(),
    ).toThrow()
  })

  it("defaults comment and reply push preferences on", () => {
    const database = createDatabase()
    database.insert(schema.user).values(createUser()).run()
    database.insert(schema.userSettings).values({ userId: "test-user" }).run()

    expect(database.select().from(schema.userSettings).get()).toMatchObject({
      commentPushNotifications: true,
      replyPushNotifications: true,
    })
  })
})
