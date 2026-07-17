import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import { Link, createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useDeferredValue, useEffect, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { AdminTablePageSkeleton } from "@/components/LoadingStates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { adminSections, getAdminSection, type AdminSection } from "@/lib/admin-sections"
import { adminRowsQueryOptions } from "@/lib/queries/admin"
import {
  DataTable,
  createAppColumnHelper,
  parseCursorTrail,
  popCursorTrail,
  pushCursorTrail,
  type DataTableUrlState,
} from "@/lib/table/app-table"
import { resolveContentReport } from "@/server/reports"
import {
  cleanupAdminMedia,
  getAdminRows,
  moderateEntity,
  retryAdminJob,
  updateAdminUser,
} from "@/server/tables"

const sectionSchema = z.enum(adminSections.map((section) => section.value))
const searchSchema = z.object({
  q: z.string().catch(""),
  sort: z.string().catch("createdAt"),
  direction: z.enum(["asc", "desc"]).catch("desc"),
  cursor: z.string().catch(""),
  trail: z.string().catch(""),
  hidden: z.string().catch(""),
})
type AdminRow = Awaited<ReturnType<typeof getAdminRows>>["rows"][number]
const column = createAppColumnHelper<AdminRow>()

function humanizeStatus(value: string | null) {
  if (!value) return "None"
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function ConfirmationAction({
  label,
  title,
  description,
  destructive = false,
  disabled = false,
  onConfirm,
}: {
  label: string
  title: string
  description: string
  destructive?: boolean
  disabled?: boolean
  onConfirm: () => void
}) {
  return (
    <Credenza>
      <CredenzaTrigger
        render={
          <Button variant={destructive ? "destructive" : "outline"} size="sm" disabled={disabled} />
        }
      >
        {label}
      </CredenzaTrigger>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{title}</CredenzaTitle>
          <CredenzaDescription>{description}</CredenzaDescription>
        </CredenzaHeader>
        <CredenzaFooter>
          <CredenzaClose render={<Button variant="outline" />}>Cancel</CredenzaClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={disabled}
            onClick={onConfirm}
          >
            {label}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}

function ModerationAction({ row, section }: { row: AdminRow; section: "posts" | "comments" }) {
  const [reason, setReason] = useState("")
  const router = useRouter()
  const action = row.status === "moderated" ? "restore" : "hide"
  const target = section === "posts" ? "post" : "comment"
  const mutation = useMutation({
    mutationFn: () => moderateEntity({ data: { target, id: row.id, action, reason } }),
    onSuccess: async () => {
      toast.success(
        action === "hide"
          ? `${humanizeStatus(target)} hidden`
          : `${humanizeStatus(target)} restored`,
      )
      await router.invalidate()
    },
    onError: () => toast.error(`The ${target} could not be updated.`),
  })
  return (
    <Credenza>
      <CredenzaTrigger render={<Button variant="outline" size="sm" />}>
        {action === "hide" ? "Hide" : "Restore"}
      </CredenzaTrigger>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>
            {action === "hide" ? `Hide this ${target}?` : `Restore this ${target}?`}
          </CredenzaTitle>
          <CredenzaDescription>
            {action === "hide"
              ? `The ${target} will stop appearing to other users.`
              : `The ${target} will become visible again.`}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <Field>
            <FieldLabel htmlFor={`moderation-reason-${row.id}`}>Reason</FieldLabel>
            <Textarea
              id={`moderation-reason-${row.id}`}
              name="reason"
              value={reason}
              maxLength={500}
              autoComplete="off"
              placeholder="Explain the decision…"
              onChange={(event) => setReason(event.currentTarget.value)}
            />
            <FieldDescription>This reason is saved in the audit log.</FieldDescription>
          </Field>
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose render={<Button variant="outline" />}>Cancel</CredenzaClose>
          <Button
            variant={action === "hide" ? "destructive" : "default"}
            disabled={reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Saving…"
              : action === "hide"
                ? `Hide ${target}`
                : `Restore ${target}`}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}

function UserActions({ row }: { row: AdminRow }) {
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: (action: "promote" | "demote" | "ban" | "unban") =>
      updateAdminUser({ data: { id: row.id, action } }),
    onSuccess: async () => {
      toast.success("User access updated")
      await router.invalidate()
    },
    onError: () => toast.error("The user’s access could not be updated."),
  })
  if (row.status === "banned") {
    return (
      <ConfirmationAction
        label="Unban"
        title="Restore this account?"
        description="The user will be able to sign in again."
        disabled={mutation.isPending}
        onConfirm={() => mutation.mutate("unban")}
      />
    )
  }
  const roleAction = row.status === "admin" ? "demote" : "promote"
  return (
    <div className="flex gap-2">
      <ConfirmationAction
        label={roleAction === "promote" ? "Make admin" : "Make member"}
        title={
          roleAction === "promote" ? "Grant administrator access?" : "Remove administrator access?"
        }
        description={
          roleAction === "promote"
            ? "This user will be able to manage content, users, and operations."
            : "This user will lose access to administration pages."
        }
        disabled={mutation.isPending}
        onConfirm={() => mutation.mutate(roleAction)}
      />
      <ConfirmationAction
        label="Ban"
        title="Ban this account?"
        description="Active sessions will be revoked and the user will not be able to sign in."
        destructive
        disabled={mutation.isPending}
        onConfirm={() => mutation.mutate("ban")}
      />
    </div>
  )
}

function MediaAction({ row }: { row: AdminRow }) {
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: () => cleanupAdminMedia({ data: { id: row.id } }),
    onSuccess: async () => {
      toast.success("Media cleanup queued")
      await router.invalidate()
    },
    onError: () => toast.error("The media cleanup could not be queued."),
  })
  if (!row.status || !["pending", "uploading", "processing", "failed"].includes(row.status)) {
    return null
  }
  return (
    <ConfirmationAction
      label="Remove"
      title="Remove this unfinished media?"
      description="The original file and any incomplete provider upload will be cleaned up."
      destructive
      disabled={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    />
  )
}

function JobAction({ row }: { row: AdminRow }) {
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: () => retryAdminJob({ data: { id: row.id } }),
    onSuccess: async () => {
      toast.success("Job queued again")
      await router.invalidate()
    },
    onError: () => toast.error("The job could not be queued again."),
  })
  if (row.status === "complete") return null
  return (
    <ConfirmationAction
      label="Retry"
      title="Retry this job?"
      description="The existing job payload will be sent to the queue again."
      disabled={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    />
  )
}

function ReportAction({ row }: { row: AdminRow }) {
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: (resolution: "resolved" | "dismissed") =>
      resolveContentReport({ data: { id: row.id, resolution } }),
    onSuccess: async (_, resolution) => {
      toast.success(resolution === "resolved" ? "Report resolved" : "Report dismissed")
      await router.invalidate()
    },
    onError: () => toast.error("The report could not be updated."),
  })
  if (row.status !== "open") return null
  return (
    <div className="flex gap-2">
      <ConfirmationAction
        label="Resolve"
        title="Mark this report resolved?"
        description="Use this after the reported content has been reviewed and any needed action is complete."
        disabled={mutation.isPending}
        onConfirm={() => mutation.mutate("resolved")}
      />
      <ConfirmationAction
        label="Dismiss"
        title="Dismiss this report?"
        description="The report will be closed without a moderation action."
        disabled={mutation.isPending}
        onConfirm={() => mutation.mutate("dismissed")}
      />
    </div>
  )
}

function RowAction({ row, section }: { row: AdminRow; section: AdminSection }) {
  if (section === "posts" || section === "comments") {
    return <ModerationAction row={row} section={section} />
  }
  if (section === "users") return <UserActions row={row} />
  if (section === "reports") return <ReportAction row={row} />
  if (section === "media") return <MediaAction row={row} />
  if (section === "jobs") return <JobAction row={row} />
  return null
}

export const Route = createFileRoute("/admin/$section")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) => {
    const input = {
      section: sectionSchema.parse(params.section),
      query: deps.q,
      cursor: deps.cursor || undefined,
      direction: deps.direction,
    }
    void context.queryClient.prefetchQuery(adminRowsQueryOptions(input))
    return input
  },
  head: ({ params }) => ({
    meta: [{ title: `${getAdminSection(params.section)?.label ?? "Administration"} · PistonPost` }],
  }),
  component: AdminTable,
  pendingComponent: AdminTablePageSkeleton,
})

function AdminTable() {
  const input = Route.useLoaderData()
  const result = useQuery({
    ...adminRowsQueryOptions(input),
    placeholderData: keepPreviousData,
  })
  const { section } = Route.useParams()
  const search = Route.useSearch()
  const parsedSection = sectionSchema.safeParse(section)
  if (!parsedSection.success) throw notFound()
  if (result.error) throw result.error
  if (!result.data) return <AdminTablePageSkeleton />
  return (
    <AdminTableView
      key={parsedSection.data}
      result={result.data}
      refreshing={result.isFetching}
      section={parsedSection.data}
      search={search}
    />
  )
}

function AdminTableView({
  result,
  refreshing,
  section,
  search,
}: {
  result: Awaited<ReturnType<typeof getAdminRows>>
  refreshing: boolean
  section: AdminSection
  search: z.infer<typeof searchSchema>
}) {
  const details = getAdminSection(section)
  if (!details) throw notFound()
  const navigate = useNavigate()
  const trail = parseCursorTrail(search.trail)
  const [query, setQuery] = useState(search.q)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    if (deferredQuery === search.q) return
    void navigate({
      to: "/admin/$section",
      params: { section },
      search: { ...search, q: deferredQuery, cursor: "", trail: "" },
      replace: true,
    })
  }, [deferredQuery, navigate, search, section])

  const columns = column.columns([
    column.accessor("primary", {
      header: details.primaryLabel,
      enableSorting: false,
      cell: ({ getValue }) => <span className="block max-w-96 truncate">{getValue()}</span>,
    }),
    column.accessor("secondary", {
      header: details.secondaryLabel,
      enableSorting: false,
      cell: ({ getValue }) =>
        section === "reports" ? (
          <a className="text-sm underline underline-offset-4" href={getValue()}>
            Open reported content
          </a>
        ) : (
          <span className="block max-w-72 truncate text-muted-foreground">{getValue()}</span>
        ),
    }),
    column.accessor("status", {
      header: details.statusLabel,
      enableSorting: false,
      cell: ({ getValue }) =>
        section === "audit" ? (
          <code className="block max-w-56 truncate text-xs text-muted-foreground">
            {getValue() ?? "None"}
          </code>
        ) : (
          <Badge variant="outline">{humanizeStatus(getValue())}</Badge>
        ),
    }),
    column.accessor("createdAt", {
      header: "Created",
      cell: ({ getValue }) => getValue().toLocaleDateString("en"),
    }),
    column.display({
      id: "actions",
      header: "",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => <RowAction row={row.original} section={section} />,
    }),
  ])

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6 border-b pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{details.label}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{details.description}</p>
      </header>
      <nav className="mb-6 flex overflow-x-auto border-b" aria-label="Administration">
        {adminSections.map((item) => (
          <Link
            key={item.value}
            to="/admin/$section"
            params={{ section: item.value }}
            search={{
              q: "",
              sort: "createdAt",
              direction: "desc",
              cursor: "",
              trail: "",
              hidden: "",
            }}
            aria-current={item.value === section ? "page" : undefined}
            className="shrink-0 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mb-5 max-w-sm">
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={details.searchPlaceholder.replace("…", "")}
            name="admin-search"
            type="search"
            autoComplete="off"
            placeholder={details.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {refreshing ? (
            <InputGroupAddon align="inline-end">
              <Spinner aria-hidden="true" />
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <span className="sr-only" role="status" aria-live="polite">
          {refreshing ? "Updating results…" : ""}
        </span>
      </div>
      <div aria-busy={refreshing}>
        <DataTable
          data={result.rows}
          columns={columns}
          getRowId={(row) => row.id}
          emptyMessage={`No ${details.label.toLocaleLowerCase("en-US")} match this view.`}
          urlState={{
            sort: search.sort,
            direction: search.direction,
            page: 0,
            hidden: search.hidden ? search.hidden.split(",") : [],
          }}
          onUrlStateChange={(next: DataTableUrlState) =>
            void navigate({
              to: "/admin/$section",
              params: { section },
              search: {
                ...search,
                sort: next.sort || "createdAt",
                direction: next.sort ? next.direction : "desc",
                cursor: next.direction === search.direction ? search.cursor : "",
                trail: next.direction === search.direction ? search.trail : "",
                hidden: next.hidden.join(","),
              },
              replace: true,
            })
          }
          cursorPagination={{
            page: trail.length + 1,
            hasPrevious: trail.length > 0,
            hasNext: result.nextCursor !== null,
            onPrevious: () => {
              const previous = popCursorTrail(trail)
              void navigate({
                to: "/admin/$section",
                params: { section },
                search: { ...search, cursor: previous.cursor, trail: previous.trail.join(",") },
              })
            },
            onNext: () => {
              if (!result.nextCursor) return
              void navigate({
                to: "/admin/$section",
                params: { section },
                search: {
                  ...search,
                  cursor: result.nextCursor,
                  trail: pushCursorTrail(trail, search.cursor).join(","),
                },
              })
            },
          }}
        />
      </div>
    </main>
  )
}
