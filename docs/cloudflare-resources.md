# Provision Cloudflare resources

This guide is for operators preparing a PistonPost preview or production environment. It records
resource names, binding contracts, and where configuration belongs without committing secret values.

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

Wrangler prints each database ID after creation. Store the production ID as
`PRODUCTION_D1_DATABASE_ID` in the tracked `.env.production` file. The deployment preparation step
adds it to the generated Wrangler configuration.

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

Authentication links and one-time codes never enter a Queue or D1 outbox row. Better Auth hands those
messages to the request execution context and the email transport uses a small bounded retry. Comment,
reply, moderation, security, product email, and Web Push notifications use ID-only outbox jobs. The
consumer reloads the current recipient, content, subscription, and optional preference before
sending. Push endpoints and encryption keys stay in D1 and never enter Queue payloads.

## Configure managed services

Some bindings require account-level setup rather than a create command:

- Enable Cloudflare Images and bind it as `IMAGES`.
- Enable Stream and bind it as `STREAM` after confirming the current first-party binding shape.
- Onboard `transactional.pistonmaster.net`, configure SPF, DKIM, and DMARC, then bind Email Service as `EMAIL`.
- Allow `auth@transactional.pistonmaster.net`, `notifications@transactional.pistonmaster.net`, and
  `updates@transactional.pistonmaster.net` as distinct Worker senders.
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

- `BETTER_AUTH_API_KEY`
- `BETTER_AUTH_SECRET`
- `EMAIL_UNSUBSCRIBE_SECRET`
- `MARKETING_POSTAL_ADDRESS`
- `TURNSTILE_SECRET`
- `STREAM_WEBHOOK_SECRET`
- `STREAM_ACCOUNT_ID`
- `STREAM_API_TOKEN`
- `VAPID_PRIVATE_KEY`

`STREAM_API_TOKEN` must be a dedicated token with Stream Write permission for the account in
`STREAM_ACCOUNT_ID`. Do not reuse the broader token that deploys the Worker. The Worker reads these
credentials only while creating a one-time TUS URL. They are never returned to the browser.

Create or select a store, then create each secret with the `workers` scope:

```bash
bunx wrangler secrets-store store list
STORE_ID=replace-with-your-store-id
bunx wrangler secrets-store secret create "$STORE_ID" --name BETTER_AUTH_API_KEY --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name BETTER_AUTH_SECRET --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name EMAIL_UNSUBSCRIBE_SECRET --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name MARKETING_POSTAL_ADDRESS --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name TURNSTILE_SECRET --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name STREAM_WEBHOOK_SECRET --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name STREAM_ACCOUNT_ID --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name STREAM_API_TOKEN --scopes workers --remote
bunx wrangler secrets-store secret create "$STORE_ID" --name VAPID_PRIVATE_KEY --scopes workers --remote
```

Store the selected store ID as `PRODUCTION_SECRETS_STORE_ID` in the tracked `.env.production` file.
The deployment workflow binds all nine values by name. Its Cloudflare API token needs permission to
deploy Secrets Store bindings in addition to the permissions required by the other configured
services.

Generate a VAPID pair once for each environment with
`bunx --bun web-push generate-vapid-keys --json`. Store the private value as
`VAPID_PRIVATE_KEY`. Put the matching public value in the relevant Wrangler environment as
`VAPID_PUBLIC_KEY`; for production, set `PRODUCTION_VAPID_PUBLIC_KEY` in `.env.production` so the
deployment preparation step can validate and inject it. The public key is configuration, but it is
useless if it does not match the private key. Keep the VAPID subject set to the monitored support
address.

The Sentinel browser plugin uses Better Auth's global identify endpoint by default. When the Better
Auth project has a project-scoped ingestion URL, set `VITE_PUBLIC_BETTER_AUTH_IDENTIFY_URL` in the
tracked `.env` file and rebuild. This URL is public configuration, but it must belong to the
PistonPost project. Do not copy another project's ingestion URL.

Do not store secrets in Wrangler `vars`, GitHub logs, command output, or shell history.

## Verify media uploads

Image posts create all upload intents in one request. Before upload, a lazy browser worker removes
private metadata from JPEG, PNG, GIF, and WebP files. It converts AVIF files to WebP and bounds
oversized JPEG photos to 4096 pixels on their longest edge. The upload route runs the same Rust WASM
sanitizer and rejects any non-canonical bytes before writing to R2. A new post can contain 20 images,
with a limit of 15 MB and 80 megapixels per image.

Video bytes go directly from the browser to Cloudflare Stream. When the Stream credentials above
are configured, the Worker creates a resumable TUS upload URL with a 2 GB file-size limit and a
10-minute duration constraint. Local development can use the Stream binding's basic upload fallback
for videos under 200 MB when the credentials are blank. Cloudflare documents the distinction in its
[direct creator upload guide](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/).

Before a remote release, test one small video and one video larger than 200 MB. Confirm that both
reach `ready`, that interrupting the larger upload causes the client to retry its current TUS URL,
and that the post becomes publishable after the signed Stream webhook arrives.

## Configure production deployment

Create a protected GitHub environment named `production`. Add this environment secret:

- `CLOUDFLARE_API_TOKEN`

Keep non-secret production deployment values in the tracked `.env.production` file:

- `CLOUDFLARE_ACCOUNT_ID`: the account that owns the Worker and its resources.
- `PRODUCTION_BASE_URL`: `https://post.pistonmaster.net`.
- `PRODUCTION_D1_DATABASE_ID`: the ID returned when the production D1 database was created.
- `PRODUCTION_SECRETS_STORE_ID`: the ID of the store containing the nine Worker values.
- `PRODUCTION_TURNSTILE_SITE_KEY`: the public site key for the production Turnstile widget.
- `PRODUCTION_VAPID_PUBLIC_KEY`: the public half of the production VAPID key pair.
- `PRODUCTION_SMOKE_POST_SLUG`: an optional known public post checked after deployment.

The workflow loads this file into its environment after checkout. Do not put API tokens, Turnstile
secrets, authentication secrets, webhook secrets, or Stream credentials in either tracked env file.

The base URL determines the Worker Custom Domain. It must be an HTTPS origin without a path, query, port, or fragment. The hostname must belong to an active zone in the same Cloudflare account.

PostHog variables are public build configuration, not Worker secrets. Production builds load the
project key and proxy host from the tracked `.env` file, which also enables local development
analytics. Update that file and redeploy to rotate either value. Configure the PostHog project to
discard IP data and verify that the project key belongs to PistonPost before enabling analytics.

Production browser events use PostHog's
[managed reverse proxy](https://posthog.com/docs/advanced/proxy) at
`https://t.pistonmaster.net`. The tracked `.env` file pins that origin as the SDK `api_host`, and the
SDK uses `https://eu.posthog.com` as its `ui_host`, as required for an EU Cloud proxy. The proxy CNAME
must remain DNS-only in Cloudflare. Do not attach it to the PistonPost Worker or enable Cloudflare's
orange-cloud proxy because PostHog manages its routing and certificate.

PistonPost bundles the slim SDK with its toolbar extension while keeping replay, heatmaps, surveys,
and the other analytics extensions disabled. Analytics ingestion and the toolbar script load through
`https://t.pistonmaster.net`. Following PostHog's
[toolbar CSP guidance](https://posthog.com/docs/advanced/content-security-policy#enabling-the-toolbar),
the Content Security Policy also permits `https://*.posthog.com` for toolbar scripts, connections,
images, styles, fonts, and media. Update the SDK configuration, deployment workflow, and policy
together before changing the proxy origin or enabled extensions.

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

Before sending a product campaign, complete the live mailbox and raw-header checks in
[Email compliance controls](./email-compliance.md). Product preview and delivery fail when
`MARKETING_POSTAL_ADDRESS` is empty, which prevents a campaign from leaving without the required
physical mailing address.
