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

### Generate database schemas

If the Better Auth configuration changes, regenerate its Drizzle schema from the repository root:

```bash
bunx --bun auth@latest generate \
  --config ./auth-schema.config.ts \
  --output ./src/db/schema/auth.generated.ts \
  --yes
```

After any database schema change, create a named Drizzle migration:

```bash
bunx --bun drizzle-kit@latest generate --name <migration-name>
```

For a data backfill that a schema diff cannot create, generate a custom migration:

```bash
bunx --bun drizzle-kit@latest generate --custom --name <migration-name>
```

Edit only the SQL file that this command creates. Do not edit generated schema migrations or files in `drizzle/meta`.

The generated image sanitizer is checked in so normal Bun installs do not require Rust. After
changing `wasm/image-sanitizer`, install the `wasm32-unknown-unknown` Rust target and regenerate it:

```bash
rustup target add wasm32-unknown-unknown
bun run wasm:build
```

The Worker exposes a shallow `GET /health` endpoint. Anonymous public documents use `Cache-Control: no-cache` so browsers and Cloudflare revalidate HTML before using it. Authenticated, mutation, auth, admin, draft, preview, and unlisted responses stay private or `no-store`.

## Push notifications

Web Push uses one VAPID key pair per deployed environment. Generate a pair once:

```bash
bunx --bun web-push generate-vapid-keys --json
```

Put the public key in `VAPID_PUBLIC_KEY` for the relevant `wrangler.jsonc` environment. Put the
private key in the ignored `.dev.vars` file as `VAPID_PRIVATE_KEY`; production uses a Secrets Store
secret with the same name. The two values must come from the same pair. Keep
`VAPID_SUBJECT=mailto:support@pistonmaster.net` unless the monitored contact address changes.

Push stays unavailable in the interface when the public key is blank. After changing a binding,
run `bun run cf:typegen`. The existing `JOBS` Queue handles push delivery, retries, and expired
subscription cleanup without another Worker.

## Browser analytics

Post views and aggregate operational events use Cloudflare Analytics Engine. PistonPost also supports
consent-gated PostHog page analytics using the same provider pattern as the EnderDash website. The
tracked `.env` file enables PostHog in development and production with its public project token and
[managed reverse proxy](https://posthog.com/docs/advanced/proxy). Use `.env.local` when you need a
personal override. The client uses memory-only persistence and sends anonymous route categories
without dynamic post IDs, usernames, tag names, page titles, referrers, or query strings. Update
`.env` and redeploy when either public value changes.

See [Cloudflare resource provisioning](./docs/cloudflare-resources.md) before creating staging or production resources.
The [email compliance controls](./docs/email-compliance.md) document records message classification,
unsubscribe behavior, sender configuration, key rotation, and the live mailbox verification runbook.

Production releases use the manually approved `Deploy production` GitHub Actions workflow. The
workflow loads non-secret deployment configuration from `.env.production`, reads only the Cloudflare
API token from the protected GitHub environment, builds the Worker with the production environment
selected, applies D1 migrations, deploys the Worker, and runs smoke tests. Complete the provisioning
and backup guides before triggering it.

## Installed app and sharing

PistonPost offers installation help in the sidebar. The browser decides whether to show its
native install prompt. The manifest includes desktop and mobile screenshots captured with local
test content. Push notifications remain a separate opt-in.

- The service worker registers without notification permission. Push subscription setup waits
  for an active worker. The production URL stays `/push-sw.js` so existing subscriptions keep
  their registration.
- Offline navigation shows a generic fallback. Only its HTML, CSS, and script are cached. Feeds,
  private pages, API responses, and media are not saved by the service worker.
- Supported installed apps show an unnumbered activity badge when push arrives with no visible
  PistonPost window. Returning to the app or opening the notification clears it. This does not
  represent unread notifications.
- Native sharing sends post links or an individual image. Copy-link controls remain available.
  Image sharing has a prepare step followed by a separate share tap to preserve user activation.
- Installed share targets accept text, HTTP(S) links, and JPEG, PNG, GIF, WebP, or AVIF images.
  Desktop file handlers use the same image intake where supported. Each share is limited to
  20 images, 15 MB per image, and 50 MB total. The regular composer retains its 150-image limit.
- Incoming content stays in IndexedDB until the user adds or discards it, with at most three
  pending shares and a one-hour expiry. Anonymous shares survive sign-in and then belong to
  that account. The composer sanitizes images before upload. Importing never posts or uploads.
- Text and post details autosave locally and remain recoverable for seven days after the last
  save, separately from server drafts. Recovery requires the same account. Files and upload
  progress are not restored.
  Signing out or changing accounts clears previous account data. Expiry cleanup runs on access;
  browser eviction or clearing site data can remove drafts sooner.

These are progressive enhancements. Browser and OS support differs, especially for badges,
share targets, and desktop file handling. No background posting, background upload queue,
periodic sync, protocol handler, or offline feed replication is implemented.

Run `bun run test:e2e tests/e2e/pwa.spec.ts` for offline and incoming-share checks. The authoring
suite covers draft recovery and confirmed image intake. Test native OS share menus, installation,
push badges, and file associations on actual installed apps before release.

References: [MDN PWA reference](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Reference),
[Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API),
[Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API),
[share targets](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target),
and [file handlers](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/file_handlers).
