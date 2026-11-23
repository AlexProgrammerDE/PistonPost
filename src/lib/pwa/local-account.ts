type SessionQuery = {
  readonly status: "pending" | "error" | "success"
  readonly data: { readonly user: { readonly id: string } } | null | undefined
}

/**
 * Returns the account that owns local drafts and shares, null after a confirmed sign-out, or
 * undefined while that is unknown. A failed session request is not a sign-out, so it must not
 * clear the previous account's local data.
 */
export function knownLocalAccount(session: SessionQuery) {
  return session.status === "success" ? (session.data?.user.id ?? null) : undefined
}
