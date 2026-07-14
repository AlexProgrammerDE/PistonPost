# Provision Cloudflare resources

This guide is for operators preparing a PistonPost preview or production environment. It records resource names and binding contracts without committing account IDs, resource IDs, hostnames, or secret values.

## Before you begin

Install dependencies and authenticate Wrangler from the repository root:

```bash
bun install
bunx wrangler login
bunx wrangler whoami
```

Use separate resources for preview and production. The examples below use `pistonpost-staging` and `pistonpost-production` consistently.

## Create D1 databases

PistonPost uses one D1 database per environment for authentication and product data.

```bash
bunx wrangler d1 create pistonpost-staging --location weur
bunx wrangler d1 create pistonpost-production --location weur
```

Wrangler prints each database ID after creation. Add the matching ID to the local, uncommitted deployment configuration or CI environment. Do not paste resource IDs into documentation.

The local development database is created automatically by the Cloudflare Vite plugin. Regenerate Worker types after any binding change:

```bash
bun run cf:typegen
```

## Create media buckets

Phase 6 binds private R2 buckets as `MEDIA`. Create one bucket per remote environment:

```bash
bunx wrangler r2 bucket create pistonpost-staging-media --location weur
bunx wrangler r2 bucket create pistonpost-production-media --location weur
```

Do not make these buckets public. Image delivery passes private R2 objects through fixed Images binding variants.

## Create job queues

The Worker produces to and consumes from `JOBS`. Failed messages move to a separate dead-letter queue.

```bash
bunx wrangler queues create pistonpost-staging-jobs
bunx wrangler queues create pistonpost-staging-dead-letter
bunx wrangler queues create pistonpost-production-jobs
bunx wrangler queues create pistonpost-production-dead-letter
```

Queue names belong in Wrangler environment blocks. Queue payloads must use versioned schemas and must not contain secrets, rendered email bodies, message content, or direct personal data.

## Configure managed services

Some bindings require account-level setup rather than a create command:

- Enable Cloudflare Images and bind it as `IMAGES`.
- Enable Stream and bind it as `STREAM` after confirming the current first-party binding shape.
- Onboard the transactional email domain, configure SPF, DKIM, and DMARC, then bind Email Service as `EMAIL`.
- Bind Analytics Engine as `ANALYTICS`.
- Bind the account deletion Workflow as `ACCOUNT_DELETION`.
- Keep distinct Turnstile widgets and secrets for preview and production.
- Use distinct numeric namespaces for every rate-limit binding in every environment.

The Worker configuration is the binding source of truth. Run a dry deployment after every binding change:

```bash
bun run wrangler:dry-run
```

Inspect the binding summary and confirm that no preview resource appears in the production build.

## Configure secrets

Local development uses an ignored `apps/web/.dev.vars` file. Start from the committed example:

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Production secrets belong in Cloudflare Secrets Store. PistonPost documents secret names, never values. Expected names include:

- `BETTER_AUTH_SECRET`
- `TURNSTILE_SECRET`
- `STREAM_WEBHOOK_SECRET`

Do not store secrets in Wrangler `vars`, GitHub logs, migration reports, or shell history.

## Validate the environment

Run the same checks CI uses:

```bash
bun run generated:check
bun run ci
```

Then start the Cloudflare-compatible development runtime and verify the shallow health endpoint:

```bash
bun run dev:web
curl --fail http://127.0.0.1:3000/health
```

The expected body is `{"status":"ok"}` and the response must use `Cache-Control: no-store`.
