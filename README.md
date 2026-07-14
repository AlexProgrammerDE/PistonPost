# PistonPost

PistonPost is a small social feed for sharing art, images, videos, jokes, and everyday posts with familiar people. This repository rebuilds the original app with TanStack Start, React 19, shadcn/ui on Base UI, Bun, Turborepo, and Cloudflare.

The implementation roadmap is in [PLAN.md](./PLAN.md). Agents and contributors must read [AGENTS.md](./AGENTS.md) before changing the repository.

## Workspace

The repository currently contains:

- `apps/web`: the TanStack Start application and Cloudflare Worker entrypoint.
- `apps/migrate`: the resumable Bun CLI for legacy BSON and static-media imports.
- `packages/ui`: shared shadcn/ui components, fonts, styles, and UI utilities.
- `tests`: shared browser and DOM test setup.
- `docs`: operator and architecture documentation.

Product packages are added only when their phase owns a real boundary. The implementation status and acceptance gates remain in [PLAN.md](./PLAN.md).

## Development

```bash
bun install
bun run dev
```

The web application runs through the Cloudflare Vite plugin on port 3000. Add shadcn components from the repository root:

```bash
bunx --bun shadcn@latest add <component> -c apps/web
```

Run the local CI gate with:

```bash
bun run ci
```

Useful focused commands include:

```bash
bun run dev:web
bun run test:web
bun run typecheck:web
bun run cf:typegen
bun run wrangler:dry-run
```

The Worker exposes a shallow `GET /health` endpoint. Public document responses receive a short shared-cache policy only when the request is anonymous and the application has not already selected a stricter policy. Authenticated, mutation, auth, admin, draft, preview, and unlisted responses stay private or `no-store`.

See [Cloudflare resource provisioning](./docs/cloudflare-resources.md) before creating staging or production resources.

Production releases use the manually approved `Deploy production` GitHub Actions workflow. The workflow builds the Cloudflare Vite application with the production environment selected, prepares the ignored deployment configuration from protected GitHub environment values, applies D1 migrations, deploys the Worker, and runs smoke tests. Complete the provisioning guide and cutover runbook before triggering it.

## Legacy migration

Analyze a mounted backup without changing a target:

```bash
bun run migrate analyze --source "/mnt/PistonPostBackup" --report reports/migration
```

Run the complete local rehearsal, then run it again to confirm idempotency:

```bash
bun run migrate apply \
  --source apps/migrate/fixtures/legacy-valid \
  --database .migration/rehearsal.sqlite \
  --report reports/migration
```

The CLI supports `analyze`, `dry-run`, `apply`, and `verify`, plus `--phase`, `--resume`, `--user`, `--limit`, and bounded media concurrency. Remote preview and production imports require explicit target configuration. Production also requires `--confirm-production`.

Read the [migration and cutover runbook](./docs/runbooks/migration-cutover.md) before using a real backup.
