# PistonPost

PistonPost is a small social feed for sharing art, images, videos, jokes, and everyday posts with familiar people. It uses TanStack Start, React 19, shadcn/ui on Base UI, Bun, Effect, Drizzle, and Cloudflare.

The implementation roadmap is in [PLAN.md](./PLAN.md). Agents and contributors must read [AGENTS.md](./AGENTS.md) before changing the repository.

## Repository layout

PistonPost is one Bun package and one deployable Cloudflare Worker:

- `src`: application routes, components, server code, auth, domain logic, database code, email, and shared utilities.
- `src/components/ui`: shadcn/ui components and Base UI primitives.
- `drizzle`: generated D1 migrations and Drizzle metadata.
- `tools/migrate`: the resumable, operator-run legacy migration CLI and its fixtures.
- `tests`: shared browser and DOM test setup.
- `docs`: operator and architecture documentation.

The folders under `src` keep architectural concerns visible without creating separate workspace packages. `tools/migrate` has a dedicated TypeScript configuration because it runs in Bun rather than the Cloudflare Worker, but it uses the same root dependency graph.

## Development

Install dependencies and start the application:

```bash
bun install
bun run dev
```

The Cloudflare Vite development server runs on port 3000. Add shadcn components from the repository root:

```bash
bunx --bun shadcn@latest add <component>
```

Run the complete local CI gate with:

```bash
bun run ci
```

Useful focused commands include:

```bash
bun run test:web
bun run test:migrate
bun run typecheck:web
bun run typecheck:migrate
bun run cf:typegen
bun run db:check
bun run wrangler:dry-run
```

The Worker exposes a shallow `GET /health` endpoint. Public document responses receive a short shared-cache policy only when the request is anonymous and the application has not already selected a stricter policy. Authenticated, mutation, auth, admin, draft, preview, and unlisted responses stay private or `no-store`.

See [Cloudflare resource provisioning](./docs/cloudflare-resources.md) before creating staging or production resources.

Production releases use the manually approved `Deploy production` GitHub Actions workflow. The workflow builds the Worker with the production environment selected, prepares the ignored deployment configuration from protected GitHub environment values, applies D1 migrations, deploys the Worker, and runs smoke tests. Complete the provisioning guide and cutover runbook before triggering it.

## Legacy migration

Analyze a mounted backup without changing a target:

```bash
bun run migrate analyze --source "/mnt/PistonPostBackup" --report reports/migration
```

Run the complete local rehearsal, then run it again to confirm idempotency:

```bash
bun run migrate apply \
  --source tools/migrate/fixtures/legacy-valid \
  --database .migration/rehearsal.sqlite \
  --report reports/migration
```

The CLI supports `analyze`, `dry-run`, `apply`, and `verify`, plus `--phase`, `--resume`, `--user`, `--limit`, and bounded media concurrency. Remote preview and production imports require explicit target configuration. Production also requires `--confirm-production`.

Read the [migration and cutover runbook](./docs/runbooks/migration-cutover.md) before using a real backup.
