# PistonPost Rewrite Execution Plan

Status: prepared for execution

Last updated: 2026-07-22

## How to execute this plan

This file is the implementation contract for the PistonPost rewrite. The next agent should read AGENTS.md, inspect the current worktree, and begin with Phase 0. Do not skip phase gates because later work depends on the boundaries established earlier.

Use these status markers:

- [ ] not started
- [~] in progress
- [x] complete and validated

When completing work:

1. Implement one coherent slice.
2. Add or update focused tests.
3. Run the narrow package checks.
4. Run the phase exit gate.
5. Mark only proven items complete.
6. Record any deliberate deviation in the Decisions and deviations section.

The repository was initialized with the exact requested command:

```bash
bunx --bun shadcn@latest init --preset b1x9M8ZeJW --template start --monorepo --pointer
```

The generated project started as a Bun and Turborepo monorepo with `apps/web` and `packages/ui`. It was flattened into one Bun package on 2026-07-15 because the repository has one product, one dependency graph, and one deployable Worker. The current generated stack uses TanStack Start, Tailwind CSS v4, Base UI, Maia, Lucide, and Outfit. The initial Raleway, taupe, and amber brand layer was replaced by the PistonPost identity defined below.

## Product objective

Rebuild PistonPost as a fast, accessible social feed for sharing art, images, videos, jokes, and everyday posts with familiar people. Preserve the useful behavior and data of the old Next.js and Java/MongoDB system without recasting the product as a professional publishing platform.

## Product identity

PistonPost is a small shared corner of the internet. It should feel casual, expressive, and content-led. The interface speaks plainly and leaves the personality to the people and posts inside it.

The legacy archive makes that identity concrete: most posts are large image collections, especially recurring furry-art posts, mixed with memes, music links, videos, running jokes, short messages, and conversations between friends. The rewrite must feel natural around a post titled "hi" and around a gallery containing dozens of images.

Identity principles:

- Show posts before product explanation. The public feed has no marketing hero.
- Use direct social language: post, posted, latest, comments, hearts, and visibility.
- Keep technical terms such as published status inside code, schemas, administration, and operations where precision matters. Do not expose that vocabulary as a brand voice.
- Use a quiet warm canvas, coral as the main accent, and yellow sparingly. Artwork and video provide most of the color.
- Use friendly Outfit typography throughout instead of an editorial heading and body split.
- Present multi-image posts as art and meme dumps with useful previews and a browsable full collection.
- Keep the wordmark simple and lowercase in the interface.
- Do not use industrial press language, transmission metaphors, portfolio language, furry mascots, paw motifs, forced slang, or self-consciously cute microcopy.

The rewrite must support:

- Email-based accounts and modern account security.
- Public profiles with usernames, avatars, bio, website, and location.
- User and tag follows with a private feed that combines both sources.
- Text, image-gallery, and video posts.
- Public, unlisted, draft, moderated, and deleted lifecycle states.
- Up to five normalized tags per post, preserving the old tag contract.
- Comments with author and moderator deletion.
- Heart reactions with at most one heart per user and post.
- A recent-post feed, tag feeds, profile feeds, and account-owned post management.
- Post creation, editing, deletion, upload progress, and media processing status.
- User settings, email preferences, theme preference, and account deletion.
- Administrator moderation and operational observability.

## Historical behavior contract

The old frontend was a Next.js Pages application backed by a Dropwizard Java API and MongoDB. It used NextAuth email magic links and stored media as backend-managed static files.

The old product exposed these user-facing routes:

| Old route         | Behavior to preserve                  | New route          |
| ----------------- | ------------------------------------- | ------------------ |
| /                 | Recent public posts                   | /                  |
| /post/[id]        | Post detail, reactions, comments      | /post/$postId      |
| /post/[id]/edit   | Owner or admin edit and delete        | /post/$postId/edit |
| /tag/[id]         | Public posts for a tag                | /tag/$tag          |
| /user/[name]      | Profile and recent public posts       | /user/$username    |
| /account/post     | Create text, image, or video post     | /posts/new         |
| /account/posts    | Current user post list                | /posts             |
| /account/settings | Profile, preferences, theme, deletion | /settings          |
| /privacy          | Privacy policy                        | /privacy           |
| /tos              | Terms                                 | /terms             |

Historical data semantics that remain supported:

- Post types: TEXT, IMAGES, VIDEO.
- Historical LIKE, DISLIKE, and HEART reactions are normalized to hearts in the rewrite.
- Maximum title length: 100 characters.
- Maximum text-post content length: 1,000 characters.
- Maximum comment length: 250 characters.
- One to five tags using letters, numbers, hyphen, dot, underscore, and tilde.
- Unlisted posts excluded from home, tag, and profile feeds but available by direct URL.
- Owners and administrators can edit or delete posts.
- Comment authors and administrators can delete comments.
- Profiles include username, avatar, roles, bio, website, and location.
- User preference fields include email notifications and theme.

The rewrite may improve limits and workflows only when it preserves migrated content and documents the new policy. For example, new uploads can have stricter practical limits than the old 150-image form, but existing galleries must remain viewable.

## Non-goals for the first production release

- Organizations, teams, or Better Auth active organizations.
- Billing, subscriptions, API key products, or an OAuth provider.
- Direct messages, group chat, or live collaborative editing.
- Algorithmic ranking or ad targeting.
- A native mobile application.
- Federated social protocols.
- AI-generated content as a core dependency.

These can be proposed later. They must not complicate the initial data model or cutover.

## Architectural decisions

### Repository

- Bun is the package manager and script runtime.
- One root package owns dependencies, scripts, generated files, and build tooling.
- Oxc provides linting and formatting through Oxlint and Oxfmt.
- TypeScript remains strict under one root configuration.
- The root TanStack Start application is the only deployable production Worker.
- Internal boundaries remain explicit under `src`, without workspace package manifests or package-level dependency indirection.

### Web application

- TanStack Start owns routing, SSR, server functions, document metadata, and Cloudflare deployment.
- React 19 is the UI runtime.
- TanStack Query owns server state and hydration.
- TanStack Form owns complex forms with shared Zod validation.
- TanStack Table v9 owns administrator data grids. The account post screen uses a responsive
  management list because each row is a single post with one primary action, not a dense dataset.
- Tailwind CSS v4 and shadcn/ui provide the UI system.
- Base UI is the primitive layer. Do not mix Radix APIs into generated components.

TanStack Form currently uses its own 1.x release line. The v9 requirement applies to TanStack Table. Pin Table v9 exactly because it is beta, and use the current compatible TanStack Form release.

### Cloudflare

- D1 is the relational source of truth.
- Drizzle ORM and generated Drizzle migrations manage D1.
- R2 stores original images and non-video binary objects.
- Cloudflare Images transforms and delivers image variants from trusted originals.
- Cloudflare Stream ingests, transcodes, and thumbnails video, then Vidstack plays adaptive DASH
  manifests for Google Cast and native HLS manifests for AirPlay-capable browsers.
- Queues handle durable asynchronous email, Web Push, cleanup, media finalization, and analytics projection jobs.
- Workflows handle long-running, resumable account deletion.
- Email Service sends Better Auth and product emails.
- Turnstile protects authentication and abuse-sensitive mutations.
- Rate Limiting bindings protect broad anonymous, authenticated, auth, comment, heart, and upload classes.
- Analytics Engine records privacy-safe product and operational events, including post views.
- Consent-gated PostHog records anonymous browser page views by stable route class without content,
  identity, or dynamic URL properties.
- Workers Cache may retain public document and feed responses for revalidation, but it never serves document HTML without checking the current Worker.
- Secrets Store provides production secrets.
- Cron triggers schedule orphan cleanup, reconciliation, retention, and delivery retries.
- Worker logs, traces, source maps, and deployment metadata provide operational visibility.

Do not add Durable Objects, KV, Vectorize, Browser Rendering, or Workers AI just to use more platform products. Add one only when a measured requirement fits its consistency and cost model. Durable Objects are a future option for live counters or collaboration, not a first-release dependency.

## Target repository layout

```text
PistonPost/
├── src/
│   ├── auth/
│   ├── components/
│   │   ├── auth/
│   │   └── ui/
│   ├── db/
│   │   └── schema/
│   ├── domain/
│   ├── email/
│   ├── lib/
│   ├── routes/
│   ├── server/
│   └── styles/
├── drizzle/
├── public/
├── tests/
├── .github/workflows/
├── AGENTS.md
├── CLAUDE.md
├── PLAN.md
├── README.md
├── components.json
├── drizzle.config.ts
├── lefthook.yml
├── package.json
├── tsconfig.json
├── vite.config.ts
└── wrangler.jsonc
```

## Runtime request flow

```text
Browser
  -> Cloudflare edge and Turnstile
  -> TanStack Start Worker
       -> Better Auth request-scoped instance
       -> domain services and authorization policy
       -> Drizzle repositories
       -> D1
       -> R2 and Images for images
       -> Stream for video
       -> Queue producers
  -> public cached response or private no-store response

Queue consumers
  -> email dispatch
  -> Web Push dispatch
  -> media finalization and orphan cleanup
  -> analytics projection
  -> reconciliation and retry
```

## Cloudflare binding contract

Use descriptive binding names and keep actual IDs out of committed documentation.

| Binding               | Type                   | Responsibility                                 |
| --------------------- | ---------------------- | ---------------------------------------------- |
| DB                    | D1Database             | Better Auth and product data                   |
| MEDIA                 | R2Bucket               | Original images and non-video binary objects   |
| IMAGES                | ImagesBinding          | Image validation, transformation, and variants |
| STREAM                | StreamBinding          | Video status, playback, and provider cleanup   |
| STREAM_ACCOUNT_ID     | secret/config          | Account used to create direct TUS uploads      |
| STREAM_API_TOKEN      | secret                 | Dedicated Stream Write credential              |
| STREAM_WEBHOOK_SECRET | secret                 | Stream webhook signature verification          |
| ASSETS                | Fetcher                | Built TanStack Start assets                    |
| EMAIL                 | SendEmail              | Auth and product email delivery                |
| JOBS                  | Queue                  | General durable background jobs                |
| ANALYTICS             | AnalyticsEngineDataset | Privacy-safe events and operational metrics    |
| AUTH_RATE_LIMITER     | RateLimit              | Better Auth requests                           |
| ANON_RATE_LIMITER     | RateLimit              | Anonymous reads and probes                     |
| USER_RATE_LIMITER     | RateLimit              | Authenticated mutations                        |
| UPLOAD_RATE_LIMITER   | RateLimit              | Upload initialization and finalization         |
| TURNSTILE_SECRET      | Secret                 | Server-side captcha verification               |
| BETTER_AUTH_SECRET    | Secret                 | Better Auth signing and encryption             |
| VAPID_PUBLIC_KEY      | config                 | Browser Web Push subscription key              |
| VAPID_PRIVATE_KEY     | Secret                 | Server Web Push signing key                    |
| VAPID_SUBJECT         | config                 | Monitored Web Push contact                     |

wrangler.jsonc should follow the useful EnderDash patterns:

- Current compatibility date.
- nodejs_compat only when required.
- Smart placement.
- Worker-first routing for API, auth, upload callbacks, and Stream webhooks.
- Static asset binding.
- Source map upload.
- Workers Cache enabled with application-level cache policy.
- Observability with full development sampling and deliberate production trace sampling.
- Explicit rate-limit bindings.
- Secrets Store bindings for production secrets.
- Environment blocks for preview and production.

Do not copy EnderDash account IDs, namespace IDs, routes, hostnames, Hyperdrive, Durable Object migrations, or product-specific secrets.

## Data model

All primary keys use text IDs that are URL-safe and sortable for new records. Existing imported
records keep their established public IDs as canonical identifiers so old links continue to work.

### Better Auth tables

Generate the exact Better Auth schema for the selected plugins and Drizzle adapter. Expected concepts include:

- user
- session
- account
- verification
- passkey
- twoFactor

Do not hand-author these from memory. Generate, inspect, and then add required indexes through the schema source and Drizzle migration flow.

### Product tables

#### profiles

- userId, primary key and foreign key to user.
- username and normalizedUsername, unique.
- bio, website, location.
- avatarMediaId, nullable.
- createdAt and updatedAt.

#### userSettings

- userId, primary key.
- Independent comment, reply, and product email preferences.
- Independent comment and reply push preferences.
- theme, constrained to system, light, or dark.
- locale and timeZone only if the UI exposes them.

#### pushSubscriptions

- id, primary key.
- userId and sessionId, both cascading foreign keys.
- endpoint and endpointHash, with one owner per endpoint capability.
- p256dh and auth encryption material.
- expirationTime, lastSuccessAt, disabledAt, createdAt, and updatedAt.
- Never copy endpoints or encryption material into Queue, outbox, log, or analytics payloads.

#### posts

- id, primary key.
- authorId.
- type: text, images, or video.
- status: draft, processing, published, moderated, deleted, or failed.
- visibility: public or unlisted.
- title.
- textContent, nullable.
- createdAt, updatedAt, publishedAt, and deletedAt.
- moderationReason, nullable.
- optimistic concurrency version.

#### tags and postTags

- tags.id, displayName, normalizedName, createdAt.
- unique normalized tag name.
- postTags.postId, tagId, and ordinal.
- primary key on postId and tagId.
- check and service policy enforcing one to five tags.

#### mediaAssets

- id, ownerId, kind, provider, status.
- r2Key for image originals.
- streamUid for video.
- originalFilename, MIME type, byte size.
- width, height, duration, and checksum where available.
- altText.
- createdAt, finalizedAt, and deletedAt.
- providerMetadata containing only necessary non-secret JSON.

#### postMedia

- postId, mediaId, ordinal.
- caption, nullable.
- primary key on postId and mediaId.
- unique postId and ordinal.

#### comments

- id, postId, authorId.
- content.
- status: published, moderated, or deleted.
- createdAt, updatedAt, and deletedAt.
- moderationReason, nullable.

#### reactions

- postId and userId.
- createdAt and updatedAt.
- primary key on postId and userId so one user has at most one heart per post.

A row represents a heart. Removing a heart deletes it. Existing reaction rows become hearts when
the heart-only migration runs. Aggregate counts are queried or projected, never trusted from the
client.

#### userFollows and tagFollows

- userFollows.followerId and followedUserId form the primary key.
- Self-follows are rejected by domain policy and a database check.
- tagFollows.userId and tagId form the primary key.
- Follow rows cascade when either account or tag is deleted.

#### auditEvents

- id, actorId, action, entityType, entityId.
- metadata with a strict allowlist.
- createdAt.

#### outbox

- id, kind, payload, attempts, availableAt, processedAt, and lastError.
- Used only where a D1 transaction must reliably schedule queue work.

### Required indexes

At minimum:

- posts by status, visibility, publishedAt, and id.
- posts by authorId, status, and createdAt.
- postTags by tagId and postId.
- comments by postId, status, and createdAt.
- reactions by postId through the composite primary key.
- userFollows by followedUserId and followerId.
- tagFollows by tagId and userId.
- profiles by normalizedUsername.
- mediaAssets by ownerId, status, and createdAt.
- outbox by processedAt and availableAt.
- auditEvents by entityType, entityId, and createdAt.

Use cursor pagination based on publishedAt plus id or createdAt plus id. Do not use large offsets for feeds.

## Better Auth design

Use Better Auth minimal with the Drizzle adapter and a request-scoped D1 database. Mirror EnderDash's proven separation:

- Server factory in `src/auth`.
- Runtime binding resolution in `src/server`.
- Client configuration in `src/auth/client`.
- Better Auth UI provider and route views in `src/components/auth` and `src/routes`.
- React Email templates in `src/email`.
- Cloudflare Email transport behind a small interface.

Initial authentication capabilities:

- Email and password with email verification.
- Magic-link sign in to preserve the old product's familiar flow.
- Email OTP for verification and recovery where it improves the UI.
- Username plugin for profile identity, while email remains the account anchor.
- Passkeys.
- Two-factor authentication.
- Admin roles.
- Multi-session account management if it remains simple and tested.
- Have I Been Pwned password checks.
- Email Harmony normalization.
- Turnstile captcha.
- Last-login-method UX if supported by the selected Better Auth version.

Do not enable organization, API key, Stripe, SSO, or OAuth-provider plugins.

Security configuration:

- Strong Better Auth secret from Secrets Store.
- Exact trusted origins per environment.
- Secure cookies in production.
- Five-minute encrypted JWE cookie cache only after revocation tests pass.
- Cloudflare connecting-IP headers handled intentionally.
- Rate limiting before expensive auth work.
- Turnstile on sign-up, sign-in, password reset, magic link, and OTP initiation.
- Generic responses for account-discovery-sensitive endpoints.
- No auth or session data in public cache.
- Audit events for role, email, password, passkey, 2FA, and deletion changes.

The old NextAuth JWT sessions, verification tokens, and active login cookies will not migrate. Users sign in again after cutover. This is a deliberate security boundary.

## Better Auth UI and email

Use @better-auth-ui/core and @better-auth-ui/react at the same architectural level as EnderDash. Port only PistonPost-relevant customizations:

- Auth provider and view routing.
- Magic-link view and button.
- Username fields.
- Turnstile widget adapter.
- Error toaster.
- User button and account menu.
- User profile, security, sessions, passkeys, 2FA, and account deletion views.
- Email verification, OTP, magic link, password reset, password changed, email changed, and new-device templates.

Exclude EnderDash organization, API key, subscription, OAuth-provider, Minecraft, and desktop surfaces.

Use Cloudflare Email Service through a transport interface. In development, capture rendered messages without sending. Add snapshot or structural tests for subject, recipient, action URL, expiry wording, plain-text fallback, and branded HTML.

All email jobs must be idempotent. Queue payloads carry a template key and safe template data, not pre-rendered HTML or secrets.

Web Push uses the same outbox and Queue boundary. A comment, reply, moderation, or security event
creates one ID-only job per active session-bound subscription. The consumer checks the current
content state, recipient, preference, session, and subscription before delivery. Provider 404 and
410 responses remove expired capabilities, 429 responses honor `Retry-After`, and transient failures
use bounded queue concurrency and delayed outbox retries.

## Route plan

### Public

- /: recent public feed with cursor pagination.
- /post/$postId: post detail with metadata, media, heart counts, and comments.
- /tag/$tag: public tag feed.
- /user/$username: profile and public posts.
- /privacy: privacy policy.
- /terms: terms.
- /auth/$view: Better Auth UI routes.
- /api/auth/$: Better Auth handler.
- /health: shallow Worker health without secret or database details.

### Authenticated

- /following: public posts from followed users or followed tags, deduplicated and cursor paginated.
- /posts/new: post composer.
- /posts: responsive owner management list covering draft, processing, published,
  unlisted, failed, moderated, and deleted states.
- /post/$postId/edit: owner or admin editor.
- /settings/profile.
- /settings/security.
- /settings/sessions.
- /settings/preferences.
- /settings/danger.

### Administrator

- /admin: moderation overview.
- /admin/posts: searchable and filterable table.
- /admin/comments: moderation queue and history.
- /admin/users: role and account status management.
- /admin/media: failed, orphaned, and reported media.
- /admin/audit: audit event table.

Validate route params and search params with Zod. Keep filters, pagination, sorting, and table view state in the URL when users benefit from sharing or restoring the view.

## Product query and mutation boundaries

Create service functions with explicit policy checks:

- listPublicPosts
- getPostForViewer
- createPostDraft
- updatePost
- publishPost
- deletePost
- listPostsByTag
- listPostsByAuthor
- createComment
- deleteComment
- setHeart
- updateProfile
- updatePreferences
- requestAccountDeletion
- moderatePost
- moderateComment
- updateUserRole

Each service receives an actor and validated input. Repositories do not decide authorization. UI routes and handlers do not reproduce policy logic.

Visibility rules:

- Public published posts appear in public feeds and can be cached.
- Unlisted published posts resolve by direct ID but never appear in public feeds, sitemaps, tag pages, profile feeds, or shared cache.
- Draft, processing, failed, and deleted posts are visible only to the owner and administrators.
- Moderated posts show a controlled tombstone to the owner and administrators and a not-found response to other users unless policy later requires transparency.
- Comments inherit post visibility.

## Media workflows

### Images

1. Authenticated user requests a batch of upload slots for the selected gallery.
2. Server validates quota, rate limit, intended count, and declared metadata.
3. A lazy browser worker removes private metadata before upload. Rust WASM performs lossless
   container or coefficient rewrites for JPEG, PNG, GIF, and WebP. AVIF is decoded to WebP, and
   oversized JPEG photos are bounded to 4096 pixels on their longest edge.
4. Browser uploads the cleaned bytes through a narrowly scoped Worker endpoint.
5. Worker validates actual content type, size, dimensions, checksum, and sanitizer idempotence. It
   rejects bytes that are not already in the canonical cleaned form.
6. The cleaned original is stored in private R2.
7. mediaAssets records the finalized object.
8. Image delivery runs through the Images binding with named variant policies.
9. Post publication verifies ownership and finalized state for every attached image.

Named variants should cover thumbnail, feed, detail, avatar, and Open Graph use. Preserve aspect ratio by default and avoid destructive cropping unless the UI explicitly requests it.

### Video

1. Server creates a direct TUS upload for an authenticated user with a short expiry and duration constraint.
2. Browser uploads directly to Stream in resumable chunks without receiving the API token.
3. Stream webhook reaches a Worker-first route.
4. Webhook signature is verified.
5. mediaAssets moves through pending, processing, ready, or failed.
6. Ready video records duration, dimensions, playback ID, and thumbnail information.
7. Post publication requires ready state.

Do not proxy large video bodies through the Worker.

### Cleanup

- Unattached uploads expire after a documented grace period.
- Queue jobs delete orphaned R2 and Stream assets.
- Account deletion uses a Workflow to tombstone content, revoke auth, delete or anonymize according to policy, remove media, and verify completion.
- Every destructive provider operation is idempotent.

## UI system and experience

The visual direction should feel like a clean community scrapbook without decorative scrapbook effects:

- A quiet warm canvas with coral as the main action color and yellow used sparingly.
- Friendly Outfit typography throughout, with weight and scale providing hierarchy.
- A simple lowercase wordmark without literal piston, paw, or mascot imagery.
- A single-column public feed that starts with posts instead of marketing copy.
- Strong media framing, readable text measure, and minimal container chrome.
- Multi-image feed previews that reveal several images. Detail views use responsive masonry by
  default and a focused image browser for explicit shared-image links. Gallery options let readers
  switch between both layouts.
- Detail pages that prioritize the post, then hearts and discussion.
- Account and admin tables that are dense, calm, direct, and keyboard-friendly.
- Responsive behavior designed deliberately for narrow screens.

Use shadcn components as the default vocabulary:

| Need              | Preferred composition                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| Navigation        | NavigationMenu, DropdownMenu, Sheet                                               |
| Account menu      | Avatar, DropdownMenu, Badge                                                       |
| Auth and settings | Card, Field, Input, InputOTP, Alert, Tabs                                         |
| Composer          | FieldGroup, Select, Textarea, Tabs or ToggleGroup, Dropzone composition, Progress |
| Feed filters      | Tabs, Select, ToggleGroup                                                         |
| Post actions      | Button, DropdownMenu, Tooltip, AlertDialog                                        |
| Comments          | Avatar, Textarea, Button, Separator                                               |
| Upload state      | Progress, Skeleton, Alert, Empty                                                  |
| Tables            | Table primitives plus TanStack Table v9                                           |
| Filters           | Popover, Command, Checkbox, Select                                                |
| Feedback          | Sonner, Alert, Empty, Skeleton                                                    |
| Destructive flow  | AlertDialog                                                                       |

Do not put every section inside a Card. Use borders, separators, typography, and whitespace before adding containers.

## TanStack integration

### Query

- Create a stable QueryClient factory for browser and request scopes.
- Integrate dehydration and hydration with TanStack Start.
- Centralize query keys by domain.
- Prefetch critical public route data in loaders.
- Use mutation defaults and explicit invalidation.
- Use optimistic updates for hearts and comments with rollback.
- Separate viewer-dependent query keys from public query keys.
- Never cache unlisted or personalized results under a public key.

### Form

- Use TanStack Form for composer, profile, structured settings, and admin mutation forms.
- Save independent binary preferences immediately through one-setting mutations.
- Share Zod schemas with server boundaries.
- Validate files separately because browser File objects and server streams differ.
- Use field metadata for accessible errors.
- Preserve drafts locally only after privacy and stale-data behavior are defined.
- Prevent duplicate submissions and expose useful progress.

### Table v9

- Pin the exact beta version.
- Create a shared DataTable shell under `src/lib/table` only after separating domain-free table UI from product-specific columns.
- Build sorting, filtering, column visibility, row selection, pagination, expansion, and URL-state features as reusable v9 features.
- Use stable row IDs.
- Keep v9 state in its store or atom model.
- Use tables for account posts, users, moderation, media, and audit.
- Do not force the public media feed into a table.

## Caching policy

Workers Cache is enabled, but code decides what is safe:

- Public home, tag, profile, and published-post documents use `Cache-Control: no-cache` so browsers and Cloudflare revalidate HTML before using it.
- Static assets use content hashes and immutable caching.
- Public image variants can use long cache lifetimes.
- Better Auth, account, admin, following, mutation, preview, draft, unlisted, and viewer-personalized responses use private or no-store.
- Heart state for the current viewer must not leak into a public cached response. Return aggregate public counts separately from viewer state or keep the response private.
- Invalidate or version public cached documents after publish, edit, moderation, or delete.

Add tests that assert Cache-Control and Vary behavior for representative public and private routes.

## Analytics and privacy

Use Analytics Engine for aggregate, operationally useful events:

- Public page view by route class.
- Post impression and open.
- Composer start and successful publish by post type.
- Upload success, failure, size bucket, and processing duration.
- Auth flow success and failure by method and coarse reason.
- Queue and Workflow completion or retry.
- Cache hit policy category when available.

Do not send email, username, post text, comment text, exact IP, auth tokens, or raw user-agent strings. Use opaque IDs only where retention and deletion policy are clear.

Use PostHog only for consented browser page analytics. Keep persistence in memory, disable
autocapture, replay, heatmaps, exceptions, and person profiles, and rewrite dynamic routes to stable
classes before capture. Send production browser events through `https://t.pistonmaster.net` instead
of directly to PostHog. This is a PostHog-managed EU Cloud reverse proxy, so initialize the SDK with
the proxy as `api_host` and `https://eu.posthog.com` as `ui_host`. Configure the PostHog project to
discard IP data. A missing public project key must disable the integration without affecting the
application. Keep the PostHog toolbar extension available and allow the regional PostHog assets it
requires in the Content Security Policy.

## Retired legacy migration

The legacy importer is no longer part of the repository or release process. Its final bookkeeping
tables, `migration_runs` and `migration_mappings`, were removed after the migration tooling and
operator surfaces were retired. Import-only IDs, the temporary profile avatar URL, and the unused
legacy media provider were also removed after a production audit. Existing post IDs remain the
canonical public identifiers, so historical post links do not need an alias table.

## Delivery phases

### Phase 0: Baseline and repository hygiene

- [x] Create the repository with the requested shadcn TanStack Start monorepo command.
- [x] Verify Base UI, Maia, Lucide, fonts, colors, and aliases through shadcn info.
- [x] Add PLAN.md, AGENTS.md, CLAUDE.md, and a project README.
- [x] Consolidate package metadata under the root PistonPost package.
- [x] Record the exact current dependency versions and replace latest ranges with deliberate compatible ranges.
- [ ] Add LICENSE after confirming the desired license for the rewrite.
- [x] Add EditorConfig and normalize line endings.
- [x] Ensure generated starter title and metadata say PistonPost.
- [x] Run baseline install, lint, typecheck, and build.

Exit gate:

```bash
bun install
bun run lint
bun run typecheck
bun run build
```

### Phase 1: Modern project tooling

- [x] Replace ESLint and Prettier with Oxlint and Oxfmt.
- [x] Add shared Oxc configuration and editor recommendations.
- [x] Add root check, fix, test, ci, and runtime-focused scripts.
- [x] Configure direct root scripts for deterministic build, test, typecheck, and deployment tasks.
- [x] Configure focused Bun test suites without replacing server runtime Web APIs globally.
- [x] Add Playwright for end-to-end tests.
- [x] Add Knip for unused exports and dependencies.
- [x] Add Lefthook with staged Oxc checks and appropriate type/tests.
- [x] Add Renovate configuration with grouped TanStack and Cloudflare updates.
- [x] Add GitHub Actions for install, generated-file verification, check, typecheck, test, build, and Wrangler dry run.
- [x] Keep CI installation and validation deterministic from the root lockfile.
- [x] Ensure hooks are fast enough for normal commits and never bypassed.

Exit gate:

```bash
bun run ci
```

### Phase 2: Cloudflare and TanStack Start runtime

- [x] Add the Cloudflare Vite plugin using the current TanStack Start integration.
- [x] Create wrangler.jsonc with preview and production environments.
- [x] Configure assets, smart placement, source maps, observability, cache, rate limits, and initial D1 binding.
- [x] Add generated Worker environment types.
- [x] Create a typed runtime-env resolver.
- [x] Separate public cache policy from private no-store policy.
- [x] Add shallow health endpoint.
- [x] Add local development variable examples without secret values.
- [x] Add Wrangler dry-run build and type generation to CI.
- [x] Document Cloudflare resource provisioning commands.

Exit criteria:

- Local development serves through the Cloudflare-compatible runtime.
- Worker type generation is clean.
- Production build and Wrangler dry run succeed.
- Public and private cache policy tests pass.

### Phase 3: D1, Drizzle, and domain foundation

- [x] Create `src/db` and `src/domain` boundaries.
- [x] Define schema for profiles, settings, posts, tags, media, comments, hearts, audit, outbox, and migration tracking.
- [x] Generate the first Drizzle migration. Do not hand-edit it.
- [x] Add D1 database factory and transaction helpers.
- [x] Add repository interfaces and D1 implementations.
- [x] Add domain actor, visibility, ownership, and moderation policy.
- [x] Add cursor pagination utilities.
- [x] Add seed factories for local development and tests.
- [x] Add integration tests for constraints, indexes, transactions, and policies.
- [x] Verify D1 foreign keys are enabled where expected.

Exit criteria:

- Fresh local D1 applies every generated migration.
- Repository integration tests pass against SQLite-compatible storage.
- Duplicate hearts, duplicate usernames, orphan relationships, and illegal post states are rejected.

### Phase 4: Better Auth, Better Auth UI, captcha, and email

- [x] Create `src/auth` and `src/email` boundaries.
- [x] Install compatible Better Auth, passkey, Better Auth UI, Harmony, React Email, and Turnstile packages.
- [x] Generate Better Auth schema for the selected plugins.
- [x] Integrate generated auth schema into `src/db` and generate the Drizzle migration.
- [x] Build request-scoped auth factory with D1 Drizzle adapter.
- [x] Add auth client and typed session helpers.
- [x] Add email/password, verification, magic link, email OTP, username, passkey, 2FA, admin, HIBP, Harmony, captcha, and optional multi-session plugins.
- [x] Add Turnstile widget and server verification.
- [x] Add Better Auth UI routes and account settings views.
- [x] Port the relevant EnderDash auth UI patterns without organization or billing code.
- [x] Add React Email templates and Cloudflare Email transport.
- [x] Harden immediate and queue-backed email delivery with idempotency.
  - [x] Defer token-bearing authentication email with the request execution context without
        persisting links, codes, or tokens.
  - [x] Store only opaque record IDs in durable email jobs and resolve recipients, content, and
        preferences at delivery time.
  - [x] Claim outbox work with expiring leases, complete it only after provider acceptance, and
        stop automatic retries after dead-letter delivery.
  - [x] Add reply notifications, administrator-controlled product campaigns, and signed product
        email unsubscribe links.
  - [x] Declare the Email Service binding in local, preview, and production environments.
- [x] Add session-bound Web Push for comment, reply, moderation, and security alerts.
  - [x] Add separate push preferences and per-device opt-in controls without prompting on page load.
  - [x] Keep push capabilities in D1 and durable jobs ID-only.
  - [x] Add VAPID delivery, delayed retries, expired-subscription cleanup, and safe service-worker navigation.
  - [x] Document privacy, retention, browser provider, and production key configuration.
- [x] Add auth rate limits, no-store policy, trusted origins, and audit hooks.
- [x] Test session revocation before enabling cookie cache.
- [x] Add end-to-end sign-up, verification, sign-in, recovery, passkey, 2FA, and sign-out coverage.

Exit criteria:

- A new user can register, verify, sign in, secure the account, manage sessions, and delete the account in local Cloudflare development.
- Captcha and rate-limit failures are clear and safe.
- No auth response is publicly cached.
- Email templates render and transport tests pass.
- Push subscriptions follow session revocation and push delivery contracts pass.

### Phase 5: Public reading experience

- [x] Establish final PistonPost visual system and page shell.
- [x] Build an accessible responsive sidebar, account menu, error boundaries, not-found view, and metadata defaults.
- [x] Implement public feed query and cursor pagination.
- [x] Implement text, image-gallery, and video post renderers.
- [x] Implement public post detail.
- [x] Implement tag feed and profile feed.
- [x] Add public profile header.
- [x] Add public aggregate heart counts without viewer leakage.
- [x] Add loading, empty, error, and offline-aware states.
- [x] Add Open Graph metadata, canonical URLs, robots, and sitemap rules.
- [x] Exclude unlisted and non-published content from discovery and caching.
- [x] Add accessibility and responsive tests for representative posts.

Exit criteria:

- Anonymous users can browse all public surfaces.
- Direct unlisted URLs work but never appear in public discovery.
- Public cache headers are correct and user-specific state never leaks.
- Core pages pass keyboard and automated accessibility checks.

### Phase 6: Composer and media

- [x] Build TanStack Form schemas for text, images, and video.
- [x] Add draft creation before upload association.
- [x] Add R2 upload initiation, validation, completion, and abort flow.
- [x] Add Images delivery variants.
- [x] Add Stream direct upload creation and webhook handling.
- [x] Add media status polling through TanStack Query.
- [x] Add sortable image gallery with stable media IDs.
- [x] Add alt text and upload progress.
- [x] Add publish validation and optimistic-concurrency edit flow.
- [x] Add owner and admin edit/delete behavior.
- [x] Add Queue cleanup and Cron reconciliation.
- [x] Add Cloudflare-backed media upload rate limits and provider-enforced capacity boundaries.
- [x] Strip private image metadata in client-side Rust WASM and reject unsanitized bytes before R2.
- [x] Add local end-to-end coverage for text publishing, multi-image publishing, invalid-image recovery, and interrupted resumable video upload.
- [ ] Verify successful Stream direct upload, encoding readiness, and TUS resume end to end against disposable Cloudflare preview resources.

Exit criteria:

- Users can create, publish, edit, and delete each post type.
- Interrupted and failed uploads recover or clean up.
- Unauthorized media cannot be attached or read.
- Video webhooks are signature verified and idempotent.

### Phase 7: Social actions, profiles, settings, and tables

- [x] Implement optimistic heart and clear-heart mutations.
- [x] Implement comment creation and deletion.
- [x] Add comment and heart rate limits.
- [x] Implement user and tag follows with a private Following feed.
- [x] Implement profile and preference forms.
- [x] Implement account deletion Workflow.
- [x] Install and pin TanStack Table v9.
- [x] Build shared table features and tests.
- [x] Build the responsive account post management view.
- [x] Build admin posts, comments, users, media, and audit tables.
- [x] Add moderation actions with confirmations and audit events.
- [x] Add URL-synchronized filters, sorting, pagination, and column visibility.
- [x] Add permission and stale-state regression tests.

Exit criteria:

- Social mutations remain correct under optimistic failure and retry.
- Owners and administrators see only allowed actions.
- Tables update immediately and correctly after mutations.
- Account deletion completes or resumes without leaving live credentials or orphaned private media.

### Phase 8: Legacy migration retirement

- [x] Remove the retired legacy migration CLI, fixtures, configuration, UI, and runbooks.
- [x] Remove `migrationRuns` and `migrationMappings` through a generated D1 migration.
- [x] Remove import-only legacy columns and the unused legacy media provider without changing public IDs.

Exit criteria:

- The application has no migration route, administration view, or operator CLI.
- D1 contains no legacy migration bookkeeping tables.
- Historical post URLs resolve through the unchanged canonical post IDs.

### Phase 9: Security, performance, and operational hardening

- [x] Threat-model auth, uploads, Stream webhooks, comments, hearts, and admin actions.
- [x] Add security headers and a tested Content Security Policy.
- [x] Add CSRF, origin, and content-type checks where the framework or Better Auth does not already cover them.
- [x] Add body and field size limits before parsing.
- [x] Add abuse tests for spoofed MIME types, oversized input, IDOR, role changes, and cache confusion.
- [x] Add D1 query plans for hot queries.
- [x] Add bundle analysis and remove server/client boundary leaks.
- [x] Tune cache TTL, query stale times, image variants, and trace sampling from measurements.
- [x] Add Queue dead-letter handling and operator alerts.
- [x] Add backup, restore, and D1 time-travel runbook.
- [x] Add dashboards or queries for Worker errors, queue lag, media failures, and auth failures.
- [x] Run warm local load tests for feed, populated post detail, and auth initiation.
- [ ] Run authenticated preview load tests for hearts and comments.

Exit criteria:

- No critical or high threat-model finding remains.
- Hot queries use expected indexes.
- Error, latency, and queue signals are visible.
- Restore procedure is rehearsed.

### Phase 10: Launch

- [ ] Take a final backup and record a D1 Time Travel bookmark.
- [ ] Verify permissions, sampled accounts, and sampled public URLs.
- [ ] Configure production routes, domain, email, Turnstile, R2, Images, Stream, Queues, Workflows, D1, cache, and secrets.
- [ ] Deploy the Worker with generated migrations applied by the defined CI flow.
- [ ] Run production smoke tests.
- [ ] Verify Google Search Console ownership and submit the production sitemap index.
- [ ] Validate representative text, gallery, video, profile, and paginated URLs with Google Rich Results Test and URL Inspection.
- [ ] Validate representative social cards with the Facebook, LinkedIn, and X inspection tools.
- [ ] Monitor auth, 404, media, queue, D1, and Worker metrics.
- [ ] Publish user guidance explaining the required fresh sign-in.
- [ ] Close launch only after the rollback window and verification pass.

Go-live checks:

- Public feed and sampled old post URLs.
- Text, image, and video rendering.
- New sign-in and existing-user magic link.
- Profile, tag, and unlisted behavior.
- Heart and comment mutation.
- New upload and media processing.
- Admin moderation.
- Email delivery.
- Account deletion initiation.
- Cache privacy.
- Error and trace visibility.

## CI and deployment plan

Pull request CI:

1. bun ci install.
2. Verify generated route, Worker, Better Auth, and Drizzle files.
3. Oxc check.
4. Typecheck.
5. Unit and integration tests.
6. Production build.
7. Wrangler deploy dry run.
8. Playwright smoke suite for affected critical routes.

Production deployment:

- Apply generated D1 migrations through one controlled CI job.
- Deploy Worker after migration success.
- Upload source maps.
- Attach commit SHA and deployment metadata.
- Run smoke tests.
- Do not deploy from uncommitted local state.

Use path filters only after proving they do not skip required application checks. Shared configuration, lockfile, schema, or runtime changes should invalidate every relevant task.

## Definition of done

The rewrite is complete when:

- Every required legacy feature has a tested new equivalent or an approved documented replacement.
- The production application runs on the intended Cloudflare services.
- Existing data and media remain accessible within approved thresholds.
- Existing users can regain access without restoring unsafe sessions or tokens.
- Public, unlisted, draft, deleted, and moderated states behave correctly.
- Authentication, authorization, captcha, rate limits, caching, and uploads pass security tests.
- The application is usable with keyboard and assistive technology.
- Mobile and desktop layouts are deliberate and stable.
- CI is green and generated artifacts are reproducible.
- Deployment, restore, rollback, and incident runbooks exist.
- There are no unexplained orphaned production objects.

## Decisions and deviations

Record future changes here with date, decision, reason, and affected phases.

- 2026-07-14: Use a single TanStack Start Worker for the initial product. This keeps SSR, auth, API, and Cloudflare bindings in one request boundary while explicit source folders preserve modularity.
- 2026-07-15: Flatten the repository into one Bun package. PistonPost is one application with one deployable Worker, so workspace manifests and Turborepo added indirection without an independent release or ownership boundary. Keep auth, database, domain, email, and UI boundaries under `src`.
- 2026-07-14: Use Base UI because the requested shadcn preset generated Base UI and the user explicitly requested it.
- 2026-07-14: Treat TanStack Table v9 as an exact-pinned beta and TanStack Form as the current compatible 1.x line.
- 2026-07-14: Do not migrate legacy sessions or verification tokens. Require fresh authentication at cutover.
- 2026-07-14: Do not add Better Auth organizations. PistonPost authorization is user, ownership, and role based.
- 2026-07-14: Use Cloudflare products where they solve a concrete requirement. Do not add platform services without a matching domain or operational need.
- 2026-07-15: Replace the industrial independent-publishing identity with a plain, content-first social identity grounded in the legacy archive. User-facing copy says post rather than transmission or publish, the feed starts with content, image collections receive first-class presentation, and the visual system uses Outfit with a warm neutral, coral, and yellow palette.
- 2026-07-15: Import incomplete public image posts as partial galleries when at least one image survives. Omit incomplete unlisted posts and media used only by those posts. Keep empty public media posts and incomplete non-gallery media posts as cutover-blocking failures.
- 2026-07-15: Preserve the legacy SEO contract independently from visual identity changes. Public routes use absolute canonical URLs, complete Open Graph and Twitter metadata, safe JSON-LD, and a crawler-visible PNG card. Image and video posts expose media-specific cards, while a cached dynamic sitemap lists public posts, profiles, and tags and non-production robots rules block indexing.
- 2026-07-20: Keep the mixed-visibility R2 bucket private and route every image through PistonPost's
  visibility checks. Image URLs carry per-variant cache versions, while image sitemaps and structured
  data reuse the normal feed rendition instead of creating a dedicated detail rendition for every
  crawler. Share Workers Cache entries across deployments and attach media, post, owner, feed, and
  sitemap tags so publish, edit, moderation, deletion, and account deletion can purge cached public
  responses globally. This affects Phases 5, 6, 9, and 10.
- 2026-07-14: Use Effect for domain services, repository and provider adapters, queues, Workflows, retries, configuration, and typed operational errors. Keep TanStack, React, Better Auth, and Drizzle composition native at their public boundaries.
- 2026-07-22: Standardize TanStack Start server functions on global error middleware and explicit
  authenticated and administrator middleware. Validate server-function input with Zod before each
  handler, map expected Effect and domain failures to a stable discriminated wire contract, and
  return unexpected defects as generic errors with request IDs while logging only safe diagnostic
  metadata. This affects Phases 4, 5, 6, 7, and 9.
- 2026-07-14: Use shadcn Typeset for long-form post rendering and use Base UI-backed shadcn components whenever they own a real product interaction. Do not add components without a concrete use.
- 2026-07-14: Generate Better Auth-owned tables before adding product-to-user foreign keys. Phase 3 enforces every product-only relationship immediately; Phase 4 adds the user relationships from the generated auth schema so the auth tables are never hand-authored from memory.
- 2026-07-14: New posts may contain up to 20 images at 15 MB each, or one video up to 2 GB and 10 minutes. Existing migrated galleries remain viewable even when they exceed the new-authoring limits.
- 2026-07-19: Accept GIF files for image posts and managed avatars. Preserve animation in feed, detail, and avatar variants through animated WebP, while thumbnails, social previews, and reduced-motion requests use a still frame. Keep the 15 MB file limit, the existing 80 megapixel canvas limit, and a 50 megapixel total-frame limit for animations so Cloudflare Images can transform every accepted GIF. This affects Phases 6 and 9.
- 2026-07-19: Count a post view when the post receives a meaningful viewport impression on the
  public timeline, following feed, tag feed, profile feed, or detail page. Include anonymous and
  self views, while the per-address and post rate limit prevents rapid repeats from inflating the
  public aggregate. Record detail opens as a separate Analytics Engine event so reach and stronger
  engagement remain distinct. This affects Phases 5 and 9.
- 2026-07-14: Account deletion starts a durable Workflow before Better Auth removes the user. Media ownership becomes nullable only during that handoff, provider objects are deleted idempotently, and the final media records are removed after R2 and Stream succeed.
- 2026-07-14: Administration tables use server-side `(created_at, id)` cursors. Cursor history, sort direction, filters, and column visibility live in URL search parameters so large datasets never rely on offset pagination.
- 2026-07-16: Retire the legacy migration CLI, fixtures, configuration, public and administrator routes, transactional email variant, and operator runbooks. Preserve `migrationRuns`, `migrationMappings`, and generated D1 artifacts until a separate schema change deliberately removes the historical state. This affects Phases 7 through 10.
- 2026-07-17: Remove `migrationRuns` and `migrationMappings` through a generated Drizzle migration. The importer and every application or operator surface that used the tables had already been retired, so keeping their historical state no longer justified the schema surface.
- 2026-07-22: Remove the remaining import-only `legacyId` and `legacyAvatarUrl` columns and the
  unused legacy media provider after auditing production. Keep imported public post IDs unchanged
  as their permanent canonical IDs, preserve archived media provenance in provider metadata, and
  redirect superseded account and terms paths to their canonical routes. This affects Phases 3, 5,
  8, and 10.
- 2026-07-17: Revalidate public HTML on every use and reload once when Vite reports a missing preload. Content-hashed route chunks change between deployments, so stale document caching can otherwise reference assets that no longer exist. This affects Phases 2 and 9.
- 2026-07-14: Keep the full Better Auth UI provider scoped to authentication, settings, and other account routes. Public navigation uses a small session-aware account menu so passkey, two-factor, CAPTCHA, and account-management code do not enter the public root bundle.
- 2026-07-19: Supersede the scoped Better Auth UI provider decision. Follow the official TanStack Start integration with one root AuthProvider so UserButton and plugin-contributed account switching and theme controls share one configuration and session cache across the application. Keep public bundle size measured through the existing build and bundle checks. This affects Phases 4 and 5.
- 2026-07-15: Use a responsive management list for `/posts` instead of TanStack Table. The
  screen has one primary object and action per row, so a list keeps status and actions readable on
  narrow screens without duplicating desktop and mobile presentations. Admin datasets remain on
  the shared TanStack Table boundary.
- 2026-07-15: Keep multi-image post detail views in responsive masonry by default. URLs with an
  explicit `?image=N` parameter open the focused image browser and select the matching social
  preview. A gallery options menu writes an explicit `layout=masonry` or `layout=browser` override
  to the URL. This affects Phase 5.
- 2026-07-16: Integrate TanStack Query with router SSR dehydration and hydration. Public comments
  use cache keys that never contain viewer state, while hearts and permissions use a separate
  viewer-scoped key. Route loaders prefetch critical public data and localized Suspense boundaries
  preserve the surrounding page while slower content arrives. This affects Phases 5, 7, and 9.
- 2026-07-17: Keep public pages from new accounts out of search until the account is verified and
  seven days old. Administrators bypass the probation period. Public content remains visible inside
  PistonPost, while metadata and sitemaps apply the search trust rule consistently. Add reporting for
  posts, comments, and profiles with a shared administrator queue and publishing rate controls. This
  affects Phases 5, 6, 7, and 9.
- 2026-07-17: Replace the single discovery document with a sitemap index and bounded post, profile,
  tag, and static child sitemaps. Post sitemaps include crawlable image and video records. Public
  cursor pages expose real links and use self-canonical URLs. This affects Phases 5 and 9.
- 2026-07-16: Standardize the icon system on Lucide and configure shadcn to generate Lucide
  components. Import icons directly from `lucide-react` so application code follows generated
  shadcn usage and does not depend on a local icon barrel. This affects the shared UI system across
  Phases 4 to 7.
- 2026-07-16: Add user and tag following as an explicit product expansion requested after the
  initial scope was implemented. A private `/following` navigation destination combines public posts
  from followed accounts and followed tags, while profile and tag pages own the follow controls.
  This affects Phases 3, 5, 7, and 9.
- 2026-07-17: Replace the global navbar and footer with the Base UI-backed shadcn Sidebar. The
  desktop shell uses a collapsible navigation rail, while narrow screens use the Sidebar's built-in
  off-canvas Sheet and a compact trigger bar. Brand, post creation, feed navigation, account access,
  legal links, and copyright now share one responsive shell. This affects Phase 5.
- 2026-07-16: Add EnderDash-style consent-gated PostHog browser analytics alongside Cloudflare
  Analytics Engine. PistonPost keeps post-view tracking in Analytics Engine and limits PostHog to
  anonymous route classes with memory-only persistence and sensitive capture features disabled.
  Production ingestion uses PostHog's managed EU Cloud proxy at `https://t.pistonmaster.net`, with
  the CSP permitting that proxy and the PostHog cloud resources required by the toolbar. This affects
  Phases 2, 5, 9, and 10.
- 2026-07-16: Show privacy-safe aggregate view totals on public post surfaces. D1 stores only each
  post's total count, while the existing hashed per-address rate-limit key reduces rapid repeat
  counting without retaining viewer identities. Analytics Engine remains the operational event
  stream. This affects Phases 5 and 9.
- 2026-07-16: Treat every text post body as GitHub-flavored Markdown without storing a format flag.
  Rendering uses the remark and rehype pipeline with an explicit sanitizer, provider embeds require
  a click before loading, and external links require confirmation. External Markdown images pass
  through a bounded Cloudflare Images proxy, while uploaded video remains on Cloudflare Stream. The
  text limit increases to 10,000 characters. This affects Phases 3, 5, and 9.
- 2026-07-22: Express custom post content through a small allowlisted remark directive vocabulary.
  Inline `spoiler` content stays hidden from rendered previews until a reader reveals it. Container
  `details` and `callout` directives support nested Markdown. The provider-neutral `embed` leaf
  accepts YouTube, Spotify, SoundCloud, Vimeo, Dailymotion, X or Twitter, and Tumblr URLs, while
  `card` accepts external HTTP and HTTPS URLs. Provider players and scripts require reader consent,
  and Tumblr oEmbed responses pass through a typed server boundary that keeps provider HTML out of
  the page. Ordinary links stay links, standard Markdown images keep their existing proxy flow, and
  unknown or invalid directives remain visible as source text. Post metadata and image
  authorization use the same Markdown syntax tree instead of separate regular expressions.
  Comments remain GitHub-flavored Markdown without directives. No compatibility parser is needed
  because the former implicit link behavior was not in use. This affects Phases 5, 6, and 9.
- 2026-07-21: Render comments and replies as GitHub-flavored Markdown without storing a format flag.
  Keep the 250-character limit and existing link confirmation. Use compact comment typography,
  leave standalone links as links instead of embeds or preview cards, and render Markdown images as
  links so comments never initiate remote image requests. This affects Phases 3, 5, and 9.
- 2026-07-16: Keep Masonry as the default gallery layout while making long posts easier to navigate.
  Post metadata and gallery options appear before media, the focused browser has direct image
  navigation, and a temporary action dock keeps engagement controls reachable until the canonical
  footer controls enter view. This affects Phases 5 and 7.
- 2026-07-16: Remove the 500-record account media quota because migrated accounts can legitimately
  contain many thousands of images and R2 does not impose an object-count limit. Cloudflare's
  user-keyed upload rate-limit binding, per-post limits, file-size validation, and provider errors
  remain the media capacity and abuse boundaries. This affects Phases 6 and 9.
- 2026-07-16: Remove the full-post preview from the composer. The preview repeated the form content
  and made longer image posts cumbersome to author. Keep upload thumbnails and Markdown formatting
  preview where they directly help edit the selected media or text. This affects Phase 6.
- 2026-07-17: Store comment, reply, and product email choices independently without a master email
  switch. Security and moderation notices are required service messages, so they are always sent,
  are not stored as user preferences, and appear as checked, disabled switches in account settings.
  This affects Phases 3, 4, 5, and 7.
- 2026-07-22: Save each optional notification switch immediately with a one-setting mutation. Keep
  the switch state responsive while saving, report progress accessibly, and restore its confirmed
  value when the request fails. Present notification topics in a compact channel matrix so email,
  push, required, and unavailable states are easy to compare. This avoids presenting switches as
  fields that require a separate save action. This affects Phase 7.
- 2026-07-22: Flatten authenticated product routes by moving post management to `/posts` and account
  settings to `/settings`. Redirect the former `/account/posts`, `/account/settings`, and singular
  `/account/post` paths permanently while preserving their remaining path and query parameters.
  This keeps user-facing URLs short without changing authentication or authorization boundaries.
  This affects Phases 4 through 7 and 9.
- 2026-07-17: Split email delivery by sensitivity. Better Auth token and code messages run through
  Cloudflare request background tasks with a small bounded transport retry and are never persisted.
  Product and account notifications use ID-only outbox jobs, delivery-time preference checks,
  expiring claims, and terminal dead-letter state. This affects Phases 3, 4, 5, 7, and 9.
- 2026-07-19: Use TanStack Router's native same-document View Transitions for route navigation.
  Transition types select forward, back, gallery, settings, and shared-element choreography, while
  an interaction marker limits shared snapshots to the post, profile, or tag that initiated the
  navigation. Keep Motion scoped to local interactions, preserve the sidebar as stationary chrome,
  and disable navigation motion for reduced-motion users and open mobile sidebar links. This
  affects Phases 5, 7, and 9.
- 2026-07-20: Replace the Cloudflare iframe player with Vidstack. Use native Cloudflare Stream HLS
  on compatible Apple browsers for AirPlay and local dash.js playback elsewhere for reliable Google
  Cast support. Leave Stream playback origins unrestricted because remote receivers fetch media
  independently from the PistonPost page. Keep the legacy Cloudflare embed route only for crawler
  video metadata. This affects Phases 5, 6, and 9.
- 2026-07-20: Clean image uploads in a lazy browser worker before any bytes reach R2. Use pure Rust
  codecs instead of local binary parsers: `libjpeg-turbo-rs` performs coefficient-domain JPEG
  orientation and optimization, `gif` rewrites animated frames, and `img-parts` filters PNG and
  WebP containers. Keep color profiles that affect rendering, remove private and descriptive
  metadata, transcode AVIF to WebP, and have the upload Worker run the same WASM sanitizer as an
  idempotence gate before storage. This affects Phases 2 and 6.
- 2026-07-21: Add Web Push on the existing outbox and `JOBS` Queue instead of another Worker or a
  Durable Object. Store browser capabilities in D1 against the Better Auth session, create one
  ID-only job per active subscription, and resolve content, ownership, preferences, and session
  state at delivery time. Offer comment and reply choices separately from email; send moderation
  and security alerts whenever a device has push enabled. This affects Phases 3, 4, 5, 9, and 10.
- 2026-07-21: Replace like, dislike, and heart choices with one heart toggle. The three choices
  added clutter without useful ranking semantics in a chronological friends-and-art feed. Existing
  reaction rows become hearts, and the `(post_id, user_id)` key allows at most one heart per person
  and post. This affects Phases 3, 5, 7, and 9.
