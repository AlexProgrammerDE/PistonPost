# PistonPost

PistonPost is a small social feed for sharing art, images, videos, jokes, and everyday posts with familiar people. It uses TanStack Start, React 19, shadcn/ui on Base UI, Bun, Effect, Drizzle, and Cloudflare.

The implementation roadmap is in [PLAN.md](./PLAN.md). Agents and contributors must read [AGENTS.md](./AGENTS.md) before changing the repository.

## Repository layout

PistonPost is one Bun package and one deployable Cloudflare Worker:

- `src`: application routes, components, server code, auth, domain logic, database code, email, and shared utilities.
- `src/components/ui`: shadcn/ui components and Base UI primitives.
- `wasm/image-sanitizer`: the Rust source for client and Worker image sanitization.
- `drizzle`: generated D1 migrations and Drizzle metadata.
- `tests`: shared browser and DOM test setup.
- `docs`: operator and architecture documentation.

The folders under `src` keep architectural concerns visible without creating separate workspace packages.

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
bun run typecheck:web
bun run cf:typegen
bun run db:check
bun run wrangler:dry-run
```

The generated image sanitizer is checked in so normal Bun installs do not require Rust. After
changing `wasm/image-sanitizer`, install the `wasm32-unknown-unknown` Rust target and regenerate it:

```bash
rustup target add wasm32-unknown-unknown
bun run wasm:build
```

The Worker exposes a shallow `GET /health` endpoint. Anonymous public documents use `Cache-Control: no-cache` so browsers and Cloudflare revalidate HTML before using it. Authenticated, mutation, auth, admin, draft, preview, and unlisted responses stay private or `no-store`.

## Browser analytics

Post views and aggregate operational events use Cloudflare Analytics Engine. PistonPost also supports
consent-gated PostHog page analytics using the same provider pattern as the EnderDash website. The
tracked `.env` file enables PostHog in development and production with its public project token and
[managed reverse proxy](https://posthog.com/docs/advanced/proxy). Use `.env.local` when you need a
personal override. The client uses memory-only persistence and sends anonymous route categories
without dynamic post IDs, usernames, tag names, page titles, referrers, or query strings. Update
`.env` and redeploy when either public value changes.

See [Cloudflare resource provisioning](./docs/cloudflare-resources.md) before creating staging or production resources.

Production releases use the manually approved `Deploy production` GitHub Actions workflow. The
workflow loads non-secret deployment configuration from `.env.production`, reads only the Cloudflare
API token from the protected GitHub environment, builds the Worker with the production environment
selected, applies D1 migrations, deploys the Worker, and runs smoke tests. Complete the provisioning
and backup guides before triggering it.
