export const adminSections = [
  {
    value: "posts",
    countLabel: "total",
    label: "Posts",
    description: "Review published and hidden posts.",
    primaryLabel: "Post",
    secondaryLabel: "Author",
    statusLabel: "Status",
    searchPlaceholder: "Search post titles…",
  },
  {
    value: "comments",
    countLabel: "total",
    label: "Comments",
    description: "Review discussions and moderation history.",
    primaryLabel: "Comment",
    secondaryLabel: "Author",
    statusLabel: "Status",
    searchPlaceholder: "Search comments…",
  },
  {
    value: "reports",
    countLabel: "open",
    label: "Reports",
    description: "Review content flagged by community members.",
    primaryLabel: "Reason",
    secondaryLabel: "Target",
    statusLabel: "Status",
    searchPlaceholder: "Search reports…",
  },
  {
    value: "users",
    countLabel: "total",
    label: "Users",
    description: "Manage accounts, access, sessions, and impersonation.",
    primaryLabel: "User",
    secondaryLabel: "Email",
    statusLabel: "Access",
    searchPlaceholder: "Search names or email addresses…",
  },
  {
    value: "media",
    countLabel: "failed",
    label: "Media",
    description: "Find failed uploads and remove abandoned files.",
    primaryLabel: "File",
    secondaryLabel: "Kind",
    statusLabel: "Status",
    searchPlaceholder: "Search filenames…",
  },
  {
    value: "jobs",
    countLabel: "unfinished",
    label: "Jobs",
    description: "Inspect queue delivery and retry unfinished work.",
    primaryLabel: "Job",
    secondaryLabel: "Attempts",
    statusLabel: "Status",
    searchPlaceholder: "Search job types…",
  },
  {
    value: "audit",
    countLabel: "events",
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

export const adminOverviewDestination = {
  value: "overview",
  label: "Overview",
  description: "Moderate content, manage access, and inspect operational problems.",
} as const

export const adminEmailCampaignsDestination = {
  value: "email-campaigns",
  label: "Email campaigns",
  description: "Draft, preview, and queue optional product updates.",
} as const

/** Every destination in the administration area, in navigation order. */
export const adminDestinations = [
  adminOverviewDestination,
  ...adminSections,
  adminEmailCampaignsDestination,
] as const

export type AdminDestination = (typeof adminDestinations)[number]["value"]

export function getAdminSection(value: string) {
  return adminSections.find((section) => section.value === value)
}
