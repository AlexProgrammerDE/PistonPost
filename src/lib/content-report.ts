export const contentReportReasons = [
  { value: "spam", label: "Spam or manipulation" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "illegal", label: "Illegal or dangerous content" },
  { value: "copyright", label: "Copyright concern" },
  { value: "other", label: "Something else" },
] as const

export type ContentReportReason = (typeof contentReportReasons)[number]["value"]
export type ContentReportTarget = {
  readonly type: "post" | "comment" | "profile"
  readonly id: string
}

export function isContentReportReason(value: unknown): value is ContentReportReason {
  return contentReportReasons.some((reason) => reason.value === value)
}
