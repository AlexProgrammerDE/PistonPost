import { and, eq, inArray, ne } from "drizzle-orm"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

import * as schema from "@/db/schema"
import { isValidUsername, MAX_USERNAME_LENGTH } from "@/domain/validation"

type ProfileDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>

type NewProfileUser = {
  readonly id: string
  readonly email: string
  readonly username?: string | null
  readonly displayUsername?: string | null
}

const FALLBACK_USERNAME = "user"
const SUFFIX_LENGTH = 6
const SUFFIX_CANDIDATES = 5

/** Better Auth stores `user.username` lowercase. Profiles use the same key. */
function normalizeUsername(username: string) {
  return username.toLocaleLowerCase("en-US")
}

/** Turn an email local part into a username that passes `usernameSchema`. */
function usernameFromEmail(email: string) {
  const localPart = email.split("@", 1)[0] ?? ""
  const sanitized = localPart
    .replaceAll(/[^A-Za-z0-9._~-]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, MAX_USERNAME_LENGTH)
  return isValidUsername(sanitized) ? sanitized : FALLBACK_USERNAME
}

function withRandomSuffix(base: string) {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, SUFFIX_LENGTH)
  return `${base.slice(0, MAX_USERNAME_LENGTH - SUFFIX_LENGTH - 1)}-${suffix}`
}

/** Find a profile other than `exceptUserId` that already owns this username. */
export async function findUsernameOwner(
  database: ProfileDatabase,
  username: string,
  exceptUserId?: string,
) {
  const normalizedUsername = normalizeUsername(username)
  const row = await database
    .select({ userId: schema.profiles.userId })
    .from(schema.profiles)
    .where(
      exceptUserId === undefined
        ? eq(schema.profiles.normalizedUsername, normalizedUsername)
        : and(
            eq(schema.profiles.normalizedUsername, normalizedUsername),
            ne(schema.profiles.userId, exceptUserId),
          ),
    )
    .get()
  return row?.userId
}

function preferredUsername(user: NewProfileUser) {
  for (const candidate of [user.displayUsername, user.username]) {
    if (typeof candidate === "string" && isValidUsername(candidate)) return candidate
  }
  return usernameFromEmail(user.email)
}

/**
 * Create the profile and settings rows for a new account.
 *
 * Only an existing profile for the same user is ignored. A username that
 * another profile owns gets a random suffix, so every account has a profile.
 */
export async function initializeUserProfile(database: ProfileDatabase, user: NewProfileUser) {
  const existing = await database
    .select({ userId: schema.profiles.userId })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, user.id))
    .get()

  if (!existing) {
    const base = preferredUsername(user)
    const candidates = [
      base,
      ...Array.from({ length: SUFFIX_CANDIDATES }, () => withRandomSuffix(base)),
    ]
    const taken = await database
      .select({ normalizedUsername: schema.profiles.normalizedUsername })
      .from(schema.profiles)
      .where(
        inArray(
          schema.profiles.normalizedUsername,
          candidates.map((candidate) => normalizeUsername(candidate)),
        ),
      )
      .all()
    const takenNames = new Set(taken.map(({ normalizedUsername }) => normalizedUsername))
    const username = candidates.find((candidate) => !takenNames.has(normalizeUsername(candidate)))
    if (username === undefined) throw new Error("No free username was found for the new profile.")

    await database
      .insert(schema.profiles)
      .values({ userId: user.id, username, normalizedUsername: normalizeUsername(username) })
      .onConflictDoNothing({ target: schema.profiles.userId })
  }

  await database
    .insert(schema.userSettings)
    .values({ userId: user.id })
    .onConflictDoNothing({ target: schema.userSettings.userId })
}

/** Keep the profile username in step with a Better Auth username change. */
export async function syncProfileUsername(
  database: ProfileDatabase,
  user: {
    readonly id: string
    readonly username: string
    readonly displayUsername?: string | null
  },
) {
  const displayUsername =
    typeof user.displayUsername === "string" &&
    normalizeUsername(user.displayUsername) === normalizeUsername(user.username)
      ? user.displayUsername
      : user.username
  const normalizedUsername = normalizeUsername(user.username)

  await database
    .update(schema.profiles)
    .set({ username: displayUsername, normalizedUsername, updatedAt: new Date() })
    .where(
      and(
        eq(schema.profiles.userId, user.id),
        // Skip the write when nothing changed. Every user update runs this hook.
        ne(schema.profiles.username, displayUsername),
      ),
    )
}
