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
    value: "users",
    label: "Users",
    description: "Manage administrator access and account status.",
    primaryLabel: "User",
    secondaryLabel: "Username",
    statusLabel: "Access",
    searchPlaceholder: "Search names or usernames…",
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
  {
    value: "migrations",
    label: "Migrations",
    description: "Inspect import runs and reconciliation problems.",
    primaryLabel: "Source",
    secondaryLabel: "Latest error",
    statusLabel: "State",
    searchPlaceholder: "Search source fingerprints…",
  },
] as const

export type AdminSection = (typeof adminSections)[number]["value"]

export function getAdminSection(value: string) {
  return adminSections.find((section) => section.value === value)
}
