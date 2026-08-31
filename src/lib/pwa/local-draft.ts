import { z } from "zod"

const DRAFT_KEY = "pistonpost.composer-draft.v1"
const ACCOUNT_KEY = "pistonpost.local-account"
const DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export const draftValuesSchema = z.object({
  type: z.enum(["text", "images", "video"]),
  title: z.string().max(100),
  textContent: z.string().max(10_000),
  tags: z.array(z.string().max(100)).max(5),
  visibility: z.enum(["public", "unlisted"]),
})
export type DraftValues = z.infer<typeof draftValuesSchema>

const draftSchema = z.object({
  userId: z.string(),
  updatedAt: z.number(),
  values: draftValuesSchema,
})

export function reconcileDraftAccount(userId: string | null) {
  if (userId) localStorage.setItem(ACCOUNT_KEY, userId)
  else localStorage.removeItem(ACCOUNT_KEY)
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return
  try {
    const draft = draftSchema.parse(JSON.parse(raw))
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
    const draft = draftSchema.parse(JSON.parse(raw))
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
  const values = draftValuesSchema.parse(input)
  if (!values.title && !values.textContent && values.tags.length === 0) {
    removeLocalDraft(userId)
    return
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ userId, updatedAt: Date.now(), values }))
}
