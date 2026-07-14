export type ModerationAction = "hide" | "restore"
export function resolveModerationTransition(status: string, action: ModerationAction) {
  if (action === "hide" && status === "published") return "moderated" as const
  if (action === "restore" && status === "moderated") return "published" as const
  return null
}
