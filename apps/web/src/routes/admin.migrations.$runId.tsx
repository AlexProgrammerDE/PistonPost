import { Badge } from "@pistonpost/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pistonpost/ui/components/table"
import { Link, createFileRoute } from "@tanstack/react-router"

import { getMigrationRunDetails } from "@/server/tables"

export const Route = createFileRoute("/admin/migrations/$runId")({
  loader: ({ params }) => getMigrationRunDetails({ data: { id: params.runId } }),
  head: () => ({ meta: [{ title: "Migration report · PistonPost" }] }),
  component: MigrationReport,
})

function MigrationReport() {
  const { run, states, problems } = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        to="/admin/$section"
        params={{ section: "migrations" }}
        search={{
          q: "",
          sort: "createdAt",
          direction: "desc",
          cursor: "",
          trail: "",
          hidden: "",
        }}
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        Back to migrations
      </Link>
      <header className="mt-5 border-b pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight">Migration report</h1>
          <Badge variant="outline" className="capitalize">
            {run.state}
          </Badge>
        </div>
        <p className="mt-2 text-sm break-all text-muted-foreground">{run.sourceFingerprint}</p>
      </header>

      <section className="mt-8" aria-labelledby="migration-counts">
        <h2 id="migration-counts" className="font-heading text-xl font-bold">
          Reconciliation
        </h2>
        <dl className="mt-4 grid grid-cols-2 border-y sm:grid-cols-4">
          {states.map((state) => (
            <div key={state.state} className="border-b px-3 py-4 sm:border-r sm:border-b-0">
              <dt className="text-sm text-muted-foreground capitalize">{state.state}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{state.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="migration-problems">
        <h2 id="migration-problems" className="font-heading text-xl font-bold">
          Problems
        </h2>
        {problems.length === 0 ? (
          <p className="mt-4 border-y py-6 text-sm text-muted-foreground">
            No failed or skipped records were reported.
          </p>
        ) : (
          <div className="mt-4 border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collection</TableHead>
                  <TableHead>Legacy ID</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((problem) => (
                  <TableRow key={problem.id}>
                    <TableCell>{problem.collection}</TableCell>
                    <TableCell>{problem.legacyId}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {problem.state}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {problem.reason ?? "No reason recorded"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  )
}
