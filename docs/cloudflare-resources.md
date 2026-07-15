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

Wrangler prints each database ID after creation. Store the production ID in the GitHub production environment as `PRODUCTION_D1_DATABASE_ID`. The deployment preparation step adds it to the generated Wrangler configuration without committing the ID.

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
- Onboard `transactional.pistonmaster.net`, configure SPF, DKIM, and DMARC, then bind Email Service as `EMAIL`.
- Allow `auth@transactional.pistonmaster.net` and `notifications@transactional.pistonmaster.net` as distinct Worker senders.
- Use `support@pistonmaster.net` for replies and public support links.
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

Local development uses an ignored root `.dev.vars` file. Start from the committed example:

```bash
cp .dev.vars.example .dev.vars
```

Production secrets belong in Cloudflare Secrets Store. PistonPost documents secret names, never values. Expected names include:

- `BETTER_AUTH_SECRET`
- `TURNSTILE_SECRET`
- `STREAM_WEBHOOK_SECRET`

Create or select a store, then create each secret with the `workers` scope:

```bash
bunx wrangler secrets-store store list
STORE_ID=replace-with-your-store-id
bunx wrangler secrets-store secret create "$STORE_ID" --name BETTER_AUTH_SECRET --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name TURNSTILE_SECRET --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name STREAM_WEBHOOK_SECRET --scopes workers --remote
```

Store the selected store ID in the GitHub production environment as `PRODUCTION_SECRETS_STORE_ID`. The deployment workflow binds all three secrets by name. Its Cloudflare API token needs permission to deploy Secrets Store bindings in addition to the permissions required by the other configured services.

Do not store secrets in Wrangler `vars`, GitHub logs, migration reports, or shell history.

## Configure production deployment

Create a protected GitHub environment named `production`. Add these environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Add these environment variables:

- `PRODUCTION_BASE_URL`: `https://post.pistonmaster.net`.
- `PRODUCTION_D1_DATABASE_ID`: the ID returned when the production D1 database was created.
- `PRODUCTION_SECRETS_STORE_ID`: the ID of the store containing the three Worker secrets.
- `PRODUCTION_TURNSTILE_SITE_KEY`: the public site key for the production Turnstile widget.
- `PRODUCTION_SMOKE_POST_SLUG`: an optional known public post checked after deployment.

The base URL determines the Worker Custom Domain. It must be an HTTPS origin without a path, query, port, or fragment. The hostname must belong to an active zone in the same Cloudflare account.

The production workflow performs these steps in order:

1. Run the complete repository CI gate.
2. Build with `CLOUDFLARE_ENV=production` so the Cloudflare Vite plugin selects the production environment.
3. Add the external resource IDs, Custom Domain, Turnstile site key, and Secrets Store bindings to the ignored generated configuration.
4. Run a Wrangler dry run and stop if the build still points at local or placeholder resources.
5. Record a D1 Time Travel bookmark and apply generated migrations.
6. Deploy the Worker with commit metadata.
7. Run the production smoke tests and publish the rollback checkpoint.

After the cutover checklist is approved, open **Actions**, select **Deploy production**, choose **Run workflow**, and enter `deploy-production` as the confirmation value. Deploy only committed code from the reviewed branch.

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
