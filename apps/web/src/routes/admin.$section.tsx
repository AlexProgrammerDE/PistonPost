import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@pistonpost/ui/components/alert-dialog"
import { Badge } from "@pistonpost/ui/components/badge"
import { Button } from "@pistonpost/ui/components/button"
import { Checkbox } from "@pistonpost/ui/components/checkbox"
import { Input } from "@pistonpost/ui/components/input"
import { Textarea } from "@pistonpost/ui/components/textarea"
import { useMutation } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import {
  DataTable,
  createAppColumnHelper,
  parseCursorTrail,
  popCursorTrail,
  pushCursorTrail,
  type DataTableUrlState,
} from "@/lib/table/app-table"
import { getAdminRows, moderateEntity } from "@/server/tables"

const sectionSchema = z.enum(["posts", "comments", "users", "media", "jobs", "audit", "migration"])
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
const baseColumns = column.columns([
  column.display({
    id: "select",
    enableHiding: false,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
      />
    ),
  }),
  column.accessor("primary", { header: "Record", enableSorting: false }),
  column.accessor("secondary", { header: "Context", enableSorting: false }),
  column.accessor("status", {
    header: "State",
    enableSorting: false,
    cell: ({ getValue }) => <Badge variant="outline">{getValue() ?? "none"}</Badge>,
  }),
  column.accessor("createdAt", {
    header: "Created",
    cell: ({ getValue }) => getValue().toLocaleDateString("en"),
  }),
])

function ModerationAction({ row, section }: { row: AdminRow; section: "posts" | "comments" }) {
  const [reason, setReason] = useState("")
  const router = useRouter()
  const action = row.status === "moderated" ? "restore" : "hide"
  const mutation = useMutation({
    mutationFn: () =>
      moderateEntity({
        data: {
          target: section === "posts" ? "post" : "comment",
          id: row.id,
          action,
          reason,
        },
      }),
    onSuccess: async () => {
      toast.success(action === "hide" ? "Content hidden" : "Content restored")
      await router.invalidate()
    },
    onError: () => toast.error("The moderation action could not be applied."),
  })
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        {action === "hide" ? "Hide" : "Restore"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="capitalize">{action} this record?</AlertDialogTitle>
          <AlertDialogDescription>
            The action is enforced on the server and written to the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label htmlFor={`moderation-reason-${row.id}`} className="grid gap-2 text-sm font-medium">
          Reason
          <Textarea
            id={`moderation-reason-${row.id}`}
            value={reason}
            maxLength={500}
            placeholder="Explain the moderation decision"
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Applying…" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export const Route = createFileRoute("/admin/$section")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    getAdminRows({
      data: {
        section: sectionSchema.parse(params.section),
        query: deps.q,
        cursor: deps.cursor || undefined,
        direction: deps.direction,
      },
    }),
  head: ({ params }) => ({
    meta: [
      { title: `${params.section} administration · PistonPost` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminTable,
})

function AdminTable() {
  const result = Route.useLoaderData()
  const { section } = Route.useParams()
  const search = Route.useSearch()
  const { q } = search
  const navigate = useNavigate()
  const trail = parseCursorTrail(search.trail)
  const sections = sectionSchema.options
  const columns =
    section === "posts" || section === "comments"
      ? column.columns([
          ...baseColumns,
          column.display({
            id: "moderation",
            header: "",
            cell: ({ row }) => <ModerationAction row={row.original} section={section} />,
          }),
        ])
      : baseColumns
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8 grid gap-6 border-b pb-7 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="typeset">
          <p className="font-mono text-xs tracking-[0.18em] text-primary uppercase">Control room</p>
          <h1 className="capitalize">{section}</h1>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Administration">
          {sections.map((item) => (
            <Button
              key={item}
              nativeButton={false}
              variant={item === section ? "default" : "ghost"}
              size="sm"
              render={
                <Link
                  to="/admin/$section"
                  params={{ section: item }}
                  search={{
                    q: "",
                    sort: "createdAt",
                    direction: "desc",
                    cursor: "",
                    trail: "",
                    hidden: "",
                  }}
                />
              }
            >
              {item}
            </Button>
          ))}
        </nav>
      </header>
      <div className="mb-5 max-w-sm">
        <Input
          aria-label="Filter records"
          placeholder="Filter records"
          defaultValue={q}
          onChange={(event) =>
            void navigate({
              to: "/admin/$section",
              params: { section },
              search: { ...search, q: event.currentTarget.value, cursor: "", trail: "" },
              replace: true,
            })
          }
        />
      </div>
      <DataTable
        data={result.rows}
        columns={columns}
        getRowId={(row) => row.id}
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
    </main>
  )
}
