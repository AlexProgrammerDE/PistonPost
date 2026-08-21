export const adminSections = [
  {
    value: "posts",
    label: "Posts",
    description: "Review published and hidden posts.",
    primaryLabel: "Post",
    secondaryLabel: "Author",
    statusLabel: "Status",
    searchPlaceholder: "Search post titles…",
  },
  {
    value: "comments",
    label: "Comments",
    description: "Review discussions and moderation history.",
    primaryLabel: "Comment",
    secondaryLabel: "Author",
    statusLabel: "Status",
    searchPlaceholder: "Search comments…",
  },
  {
    value: "reports",
    label: "Reports",
    description: "Review content flagged by community members.",
    primaryLabel: "Reason",
    secondaryLabel: "Target",
    statusLabel: "Status",
    searchPlaceholder: "Search reports…",
  },
  {
    value: "users",
    label: "Users",
    description: "Manage accounts, access, sessions, and impersonation.",
    primaryLabel: "User",
    secondaryLabel: "Email",
    statusLabel: "Access",
    searchPlaceholder: "Search names or email addresses…",
  },
  {
    value: "media",
    label: "Media",
    description: "Find failed uploads and remove abandoned files.",
    primaryLabel: "File",
    secondaryLabel: "Kind",
    statusLabel: "Status",
    searchPlaceholder: "Search filenames…",
  },
  {
    value: "jobs",
    label: "Jobs",
    description: "Inspect queue delivery and retry unfinished work.",
    primaryLabel: "Job",
    secondaryLabel: "Attempts",
    statusLabel: "Status",
    searchPlaceholder: "Search job types…",
  },
  {
    value: "audit",
    label: "Audit",
    description: "Trace administrator and security-sensitive changes.",
    primaryLabel: "Action",
    secondaryLabel: "Target type",
    statusLabel: "Target ID",
    searchPlaceholder: "Search actions…",
  },
] as const

type AdminTableSection = Exclude<(typeof adminSections)[number], { value: "users" }>

export const adminTableSections = adminSections.filter(
  (section): section is AdminTableSection => section.value !== "users",
)

export type AdminSection = AdminTableSection["value"]

export function getAdminSection(value: string) {
  return adminSections.find((section) => section.value === value)
}
