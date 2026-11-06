import { Schema } from "effect"

const DRAFT_KEY = "pistonpost.composer-draft.v1"
const ACCOUNT_KEY = "pistonpost.local-account"
const DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export const draftValuesSchema = Schema.Struct({
  type: Schema.Literals(["text", "images", "video"]),
  title: Schema.String.check(Schema.isMaxLength(100)),
  textContent: Schema.String.check(Schema.isMaxLength(10_000)),
  tags: Schema.mutable(Schema.Array(Schema.String.check(Schema.isMaxLength(100)))).check(
    Schema.isMaxLength(5),
  ),
  visibility: Schema.Literals(["public", "unlisted"]),
})
export type DraftValues = (typeof draftValuesSchema)["Type"]

const draftSchema = Schema.Struct({
  userId: Schema.String,
  updatedAt: Schema.Finite,
  values: draftValuesSchema,
})

export function reconcileDraftAccount(userId: string | null) {
  if (userId) localStorage.setItem(ACCOUNT_KEY, userId)
  else localStorage.removeItem(ACCOUNT_KEY)
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return
  try {
    const draft = Schema.decodeUnknownSync(draftSchema, { errors: "all" })(JSON.parse(raw))
    if (
      draft.userId === userId &&
      draft.updatedAt <= Date.now() &&
      Date.now() - draft.updatedAt < DRAFT_RETENTION_MS
    )
      return
  } catch {
    /* Remove invalid records along with records from other accounts. */
  }
  localStorage.removeItem(DRAFT_KEY)
}

export function readLocalDraft(userId: string, now = Date.now()) {
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return null
  try {
    const draft = Schema.decodeUnknownSync(draftSchema, { errors: "all" })(JSON.parse(raw))
    if (
      draft.userId === userId &&
      draft.updatedAt <= now &&
      now - draft.updatedAt < DRAFT_RETENTION_MS
    )
      return draft.values
  } catch {
    /* Malformed or expired drafts must never prevent composing a post. */
  }
  return null
}

export function removeLocalDraft(userId: string) {
  if (localStorage.getItem(ACCOUNT_KEY) === userId) localStorage.removeItem(DRAFT_KEY)
}

export function saveLocalDraft(userId: string, input: unknown) {
  // Prevent an unmount or another tab from restoring private data after sign-out.
  if (localStorage.getItem(ACCOUNT_KEY) !== userId) return
  const values = Schema.decodeUnknownSync(draftValuesSchema, { errors: "all" })(input)
  if (!values.title && !values.textContent && values.tags.length === 0) {
    removeLocalDraft(userId)
    return
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ userId, updatedAt: Date.now(), values }))
}
