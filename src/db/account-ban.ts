import { getTableName, not, sql, type Column, type SQL } from "drizzle-orm"

import { user } from "./schema"

type BanState = {
  readonly banned?: boolean | null
  readonly banExpires?: Date | null
}

/**
 * Match the Better Auth admin plugin: a ban applies while `banned` is set and the ban has no
 * expiry or expires in the future. An expired ban no longer applies.
 */
export function isBannedUser(account: BanState, now = new Date()) {
  return (
    account.banned === true && (!account.banExpires || account.banExpires.getTime() > now.getTime())
  )
}

/**
 * SQL form of `isBannedUser` for the account whose id is in `userId`. Public reads use
 * `notBannedAccount` so a banned account's posts, comments, and profile stay hidden until the
 * ban is lifted or expires. The subquery looks the account up by primary key for each row. The
 * column is written with its table name because Drizzle leaves columns unqualified in a
 * single-table query, where a bare `id` would resolve to the subquery's own row. Pass columns of
 * real tables, not aliases. A null `userId` counts as not banned.
 */
export function bannedAccount(userId: Column, now = new Date()): SQL<boolean> {
  const column = sql`${sql.identifier(getTableName(userId.table))}.${sql.identifier(userId.name)}`
  return sql<boolean>`exists (
    select 1 from ${user} banned_account
    where banned_account.id = ${column}
      and banned_account.banned = 1
      and (banned_account.ban_expires is null or banned_account.ban_expires > ${now.getTime()})
  )`.mapWith(Boolean)
}

export function notBannedAccount(userId: Column, now = new Date()) {
  return not(bannedAccount(userId, now))
}
