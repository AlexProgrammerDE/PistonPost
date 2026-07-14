# PistonPost Rewrite Execution Plan

Status: prepared for execution

Last updated: 2026-07-15

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

The generated project is a Bun and Turborepo monorepo with apps/web and packages/ui. The shadcn preset supplied TanStack Start, Tailwind CSS v4, Base UI, Maia, Hugeicons, and Outfit. The initial Raleway, taupe, and amber brand layer was replaced by the PistonPost identity defined below.

## Product objective

Rebuild PistonPost as a fast, accessible social feed for sharing art, images, videos, jokes, and everyday posts with familiar people. Preserve the useful behavior and data of the old Next.js and Java/MongoDB system without recasting the product as a professional publishing platform.

## Product identity

PistonPost is a small shared corner of the internet. It should feel casual, expressive, and content-led. The interface speaks plainly and leaves the personality to the people and posts inside it.

The legacy archive makes that identity concrete: most posts are large image collections, especially recurring furry-art posts, mixed with memes, music links, videos, running jokes, short messages, and conversations between friends. The rewrite must feel natural around a post titled "hi" and around a gallery containing dozens of images.

Identity principles:

- Show posts before product explanation. The public feed has no marketing hero.
- Use direct social language: post, posted, latest, comments, reactions, and visibility.
- Keep technical terms such as published status inside code, schemas, administration, and operations where precision matters. Do not expose that vocabulary as a brand voice.
- Use a quiet warm canvas, coral as the main accent, and yellow sparingly. Artwork and video provide most of the color.
- Use friendly Outfit typography throughout instead of an editorial heading and body split.
- Present multi-image posts as art and meme dumps with useful previews and a browsable full collection.
- Keep the wordmark simple and lowercase in the interface.
- Do not use industrial press language, transmission metaphors, portfolio language, furry mascots, paw motifs, forced slang, or self-consciously cute microcopy.

The rewrite must support:

- Email-based accounts and modern account security.
- Public profiles with usernames, avatars, bio, website, and location.
- Text, image-gallery, and video posts.
- Public, unlisted, draft, moderated, and deleted lifecycle states.
- Up to five normalized tags per post, preserving the old tag contract.
- Comments with author and moderator deletion.
- Like, dislike, and heart reactions with one reaction state per user and post.
- A recent-post feed, tag feeds, profile feeds, and account-owned post management.
- Post creation, editing, deletion, upload progress, and media processing status.
- User settings, email preferences, theme preference, and account deletion.
- Administrator moderation and migration observability.
- A one-time, resumable migration from the old MongoDB and static-media backup.

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
| /account/post     | Create text, image, or video post     | /account/posts/new |
| /account/posts    | Current user post list                | /account/posts     |
| /account/settings | Profile, preferences, theme, deletion | /account/settings  |
| /privacy          | Privacy policy                        | /privacy           |
| /tos              | Terms                                 | /terms             |

Old data semantics that must survive migration:

- Post types: TEXT, IMAGES, VIDEO.
- Reaction types: LIKE, DISLIKE, HEART.
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
- Turborepo orchestrates workspace tasks.
- Oxc provides linting and formatting through Oxlint and Oxfmt.
- TypeScript remains strict. Use the native TypeScript preview only if it passes the complete workspace and editor support is acceptable.
- apps/web is the only deployable production Worker.
- apps/migrate is an operator-run Bun CLI, never deployed publicly.
- Shared packages expose narrow entrypoints and avoid dependency cycles.

### Web application

- TanStack Start owns routing, SSR, server functions, document metadata, and Cloudflare deployment.
- React 19 is the UI runtime.
- TanStack Query owns server state and hydration.
- TanStack Form owns complex forms with shared Zod validation.
- TanStack Table v9 owns account and administrator data grids.
- Tailwind CSS v4 and shadcn/ui provide the UI system.
- Base UI is the primitive layer. Do not mix Radix APIs into generated components.

TanStack Form currently uses its own 1.x release line. The v9 requirement applies to TanStack Table. Pin Table v9 exactly because it is beta, and use the current compatible TanStack Form release.

### Cloudflare

- D1 is the relational source of truth.
- Drizzle ORM and generated Drizzle migrations manage D1.
- R2 stores original images, migration source artifacts, and non-video binary objects.
- Cloudflare Images transforms and delivers image variants from trusted originals.
- Cloudflare Stream ingests, transcodes, thumbnails, and plays video.
- Queues handle durable asynchronous email, cleanup, media finalization, and analytics projection jobs.
- Workflows handle long-running, resumable account deletion and migration reconciliation.
- Email Service sends Better Auth and product emails.
- Turnstile protects authentication and abuse-sensitive mutations.
- Rate Limiting bindings protect broad anonymous, authenticated, auth, comment, reaction, and upload classes.
- Analytics Engine records privacy-safe product and operational events.
- Workers Cache caches explicitly public document and feed responses only.
- Secrets Store provides production secrets.
- Cron triggers schedule orphan cleanup, reconciliation, retention, and delivery retries.
- Worker logs, traces, source maps, and deployment metadata provide operational visibility.

Do not add Durable Objects, KV, Vectorize, Browser Rendering, or Workers AI just to use more platform products. Add one only when a measured requirement fits its consistency and cost model. Durable Objects are a future option for live counters or collaboration, not a first-release dependency.

## Target repository layout

```text
PistonPost/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── lib/
│   │   │   ├── routes/
│   │   │   └── server/
│   │   ├── tests/
│   │   ├── components.json
│   │   ├── drizzle.config.ts
│   │   ├── vite.config.ts
│   │   └── wrangler.jsonc
│   └── migrate/
│       ├── src/
│       │   ├── commands/
│       │   ├── readers/
│       │   ├── transforms/
│       │   ├── writers/
│       │   └── verification/
│       └── package.json
├── packages/
│   ├── auth/
│   ├── config/
│   ├── db/
│   │   ├── src/schema/
│   │   └── drizzle/
│   ├── domain/
│   ├── email/
│   └── ui/
├── .github/workflows/
├── AGENTS.md
├── CLAUDE.md
├── PLAN.md
├── README.md
├── lefthook.yml
├── package.json
└── turbo.json
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
  -> media finalization and orphan cleanup
  -> analytics projection
  -> reconciliation and retry
```

## Cloudflare binding contract

Use descriptive binding names and keep actual IDs out of committed documentation.

| Binding             | Type                   | Responsibility                                 |
| ------------------- | ---------------------- | ---------------------------------------------- |
| DB                  | D1Database             | Better Auth and product data                   |
| MEDIA               | R2Bucket               | Original images and migration objects          |
| IMAGES              | ImagesBinding          | Image validation, transformation, and variants |
| STREAM_*            | secret/config          | Stream API access and webhook verification     |
| ASSETS              | Fetcher                | Built TanStack Start assets                    |
| EMAIL               | SendEmail              | Auth and product email delivery                |
| JOBS                | Queue                  | General durable background jobs                |
| ANALYTICS           | AnalyticsEngineDataset | Privacy-safe events and operational metrics    |
| AUTH_RATE_LIMITER   | RateLimit              | Better Auth requests                           |
| ANON_RATE_LIMITER   | RateLimit              | Anonymous reads and probes                     |
| USER_RATE_LIMITER   | RateLimit              | Authenticated mutations                        |
| UPLOAD_RATE_LIMITER | RateLimit              | Upload initialization and finalization         |
| TURNSTILE_SECRET    | Secret                 | Server-side captcha verification               |
| BETTER_AUTH_SECRET  | Secret                 | Better Auth signing and encryption             |

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

All primary keys use text IDs that are URL-safe and sortable for new records. Legacy Mongo ObjectId strings remain valid IDs where preserving them reduces mapping risk.

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
- legacyAvatarUrl, nullable during migration.
- createdAt and updatedAt.

#### userSettings

- userId, primary key.
- emailNotifications.
- theme, constrained to system, light, or dark.
- locale and timeZone only if the UI exposes them.

#### posts

- id, primary key.
- legacyId, unique and nullable after migration.
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

- id, legacyId, postId, authorId.
- content.
- status: published, moderated, or deleted.
- createdAt, updatedAt, and deletedAt.
- moderationReason, nullable.

#### reactions

- postId, userId, type.
- createdAt and updatedAt.
- primary key on postId and userId so one user has one current reaction per post.
- type constrained to like, dislike, or heart.

Changing reaction type updates the row. Removing a reaction deletes it. Aggregate counts are queried or projected, never trusted from the client.

#### auditEvents

- id, actorId, action, entityType, entityId.
- metadata with a strict allowlist.
- createdAt.

#### outbox

- id, kind, payload, attempts, availableAt, processedAt, and lastError.
- Used only where a D1 transaction must reliably schedule queue work.

#### migrationRuns and migrationMappings

- Source fingerprint, startedAt, finishedAt, state, and counters.
- Source collection, legacy ID, target table, target ID, checksum, and state.
- Unique source collection and legacy ID.
- Enough information to resume, reconcile, and explain every skipped record.

### Required indexes

At minimum:

- posts by status, visibility, publishedAt, and id.
- posts by authorId, status, and createdAt.
- postTags by tagId and postId.
- comments by postId, status, and createdAt.
- reactions by postId and type.
- profiles by normalizedUsername.
- mediaAssets by ownerId, status, and createdAt.
- outbox by processedAt and availableAt.
- auditEvents by entityType, entityId, and createdAt.

Use cursor pagination based on publishedAt plus id or createdAt plus id. Do not use large offsets for feeds.

## Better Auth design

Use Better Auth minimal with the Drizzle adapter and a request-scoped D1 database. Mirror EnderDash's proven separation:

- Server factory in packages/auth.
- Runtime binding resolution in apps/web.
- Client configuration in packages/auth/client.
- Better Auth UI provider and route views in apps/web.
- React Email templates in packages/email.
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

## Route plan

### Public

- /: recent public feed with cursor pagination.
- /post/$postId: post detail with metadata, media, reaction counts, and comments.
- /tag/$tag: public tag feed.
- /user/$username: profile and public posts.
- /privacy: privacy policy.
- /terms: terms.
- /auth/$view: Better Auth UI routes.
- /api/auth/$: Better Auth handler.
- /health: shallow Worker health without secret or database details.

### Authenticated

- /account/posts/new: post composer.
- /account/posts: owner table with drafts, processing, published, unlisted, failed, moderated, and deleted filters.
- /post/$postId/edit: owner or admin editor.
- /account/settings/profile.
- /account/settings/security.
- /account/settings/sessions.
- /account/settings/preferences.
- /account/settings/danger.

### Administrator

- /admin: moderation overview.
- /admin/posts: searchable and filterable table.
- /admin/comments: moderation queue and history.
- /admin/users: role and account status management.
- /admin/media: failed, orphaned, and reported media.
- /admin/migrations: migration run and reconciliation reports.
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
- setReaction
- clearReaction
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

1. Authenticated user requests an upload slot.
2. Server validates quota, rate limit, intended count, and declared metadata.
3. Browser uploads original bytes through a narrowly scoped Worker endpoint or signed mechanism.
4. Worker validates actual content type, size, dimensions, and checksum.
5. Original is stored in private R2.
6. mediaAssets records the finalized object.
7. Image delivery runs through the Images binding with named variant policies.
8. Post publication verifies ownership and finalized state for every attached image.

Named variants should cover thumbnail, feed, detail, avatar, and Open Graph use. Preserve aspect ratio by default and avoid destructive cropping unless the UI explicitly requests it.

### Video

1. Server creates a direct Stream upload for an authenticated user.
2. Browser uploads directly to Stream.
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
- Multi-image feed previews that reveal several images and detail views that expose the full collection.
- Detail pages that prioritize the post, then reactions and discussion.
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
- Use optimistic updates for reactions and comments with rollback.
- Separate viewer-dependent query keys from public query keys.
- Never cache unlisted or personalized results under a public key.

### Form

- Use TanStack Form for composer, profile, preferences, and admin mutation forms.
- Share Zod schemas with server boundaries.
- Validate files separately because browser File objects and server streams differ.
- Use field metadata for accessible errors.
- Preserve drafts locally only after privacy and stale-data behavior are defined.
- Prevent duplicate submissions and expose useful progress.

### Table v9

- Pin the exact beta version.
- Create a shared DataTable shell in apps/web or packages/ui only after separating domain-free table UI from product-specific columns.
- Build sorting, filtering, column visibility, row selection, pagination, expansion, and URL-state features as reusable v9 features.
- Use stable row IDs.
- Keep v9 state in its store or atom model.
- Use tables for account posts, users, moderation, media, audit, and migration reports.
- Do not force the public media feed into a table.

## Caching policy

Workers Cache is enabled, but code decides what is safe:

- Public home, tag, profile, and published-post documents may use short edge TTL plus stale-while-revalidate.
- Static assets use content hashes and immutable caching.
- Public image variants can use long cache lifetimes.
- Better Auth, account, admin, mutation, preview, draft, unlisted, and viewer-personalized responses use private or no-store.
- Reaction state for the current viewer must not leak into a public cached response. Return aggregate public counts separately from viewer state or keep the response private.
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

## One-time migration

The migration CLI is a first-class deliverable, not a temporary script pasted into a shell.

### Inputs

- MongoDB backup or export for users, posts, comments, images, videos, NextAuth collections, and verification metadata.
- Static image, video, and thumbnail files.
- Optional source manifest from OneDrive backup.
- Production Cloudflare resource identifiers and credentials supplied through environment variables.

The OneDrive URI is not a filesystem path. Before execution, the operator must make the backup available as a local mounted path or export and pass that path explicitly.

### Migration principles

- Dry-run by default.
- Idempotent and resumable.
- Preserve old user, post, comment, image, and video IDs where valid.
- Record every mapping and skip reason.
- Never migrate active sessions, JWTs, verification tokens, or old email magic links.
- Never overwrite a non-migration production record.
- Compute checksums before upload.
- Reconcile counts and relationships after every stage.
- Produce machine-readable JSON and human-readable Markdown reports.
- Support local D1 and remote production targets with explicit flags.

### Stages

1. Analyze source.
2. Validate expected collections, fields, files, and referential integrity.
3. Fingerprint source and create migration run.
4. Import Better Auth users with verified email state matching reliable source data.
5. Import profiles, roles, settings, and usernames.
6. Import tags.
7. Import image metadata and upload original files to R2.
8. Import videos to Stream and wait or poll for ready state.
9. Import posts and post-media ordering.
10. Import comments.
11. Import reactions, resolving duplicate or conflicting legacy states deterministically.
12. Reconcile counts, missing authors, missing media, duplicate usernames, and visibility.
13. Generate redirect and compatibility report.
14. Mark run complete only when required thresholds pass.

### User migration

- Prefer legacy Mongo user ObjectId string as Better Auth user.id.
- Preserve email, email verification only when source evidence is trustworthy, creation time where available, name, roles, and profile settings.
- Normalize username separately and resolve case-insensitive collisions with an explicit report.
- Do not invent passwords.
- Users authenticate after cutover by magic link, OTP, or password setup.
- Administrators receive roles only from an allowlisted source mapping reviewed before production.

### Content migration

- Preserve postId for old URLs.
- Preserve original timestamp, title, type, text, tag order, unlisted state, and author.
- Preserve gallery order.
- Preserve comment ObjectId and derive timestamp only when the old data lacks an explicit timestamp.
- Convert legacy reaction sets into one reaction row per user and post.
- If one legacy user appears in more than one reaction set for one post, apply a documented precedence and report it. Proposed precedence: HEART, LIKE, DISLIKE.
- Missing authors become a controlled legacy-user tombstone only after the operator approves the policy.
- Public image galleries with at least one surviving image import as partial galleries and appear in the report. Incomplete unlisted posts are omitted with their exclusive media. Public media posts with no surviving media, and incomplete non-gallery media posts, remain failed and block cutover.

### Required CLI shape

```bash
bun run migrate analyze --source /path/to/backup
bun run migrate dry-run --source /path/to/backup --report ./reports
bun run migrate apply --source /path/to/backup --target local
bun run migrate apply --source /path/to/backup --target production --resume <run-id>
bun run migrate verify --run <run-id>
```

Production apply must require an explicit confirmation flag and print the account and database names without printing secrets.

### Verification report

Report:

- Source and target counts per entity.
- Imported, skipped, failed, and already-present counts.
- Duplicate emails and usernames.
- Missing authors and media.
- Media checksum and provider readiness failures.
- Reaction conflicts.
- Public, unlisted, and failed post counts.
- Sampled old-to-new URL checks.
- D1 foreign-key check output.
- Final go or no-go verdict.

## Delivery phases

### Phase 0: Baseline and repository hygiene

- [x] Create the repository with the requested shadcn TanStack Start monorepo command.
- [x] Verify Base UI, Maia, Hugeicons, fonts, colors, and aliases through shadcn info.
- [x] Add PLAN.md, AGENTS.md, CLAUDE.md, and a project README.
- [x] Rename package names to a consistent @pistonpost/* convention.
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

### Phase 1: Modern workspace tooling

- [x] Replace ESLint and Prettier with Oxlint and Oxfmt.
- [x] Add shared Oxc configuration and editor recommendations.
- [x] Add root check, fix, test, ci, and package-filtered scripts.
- [x] Configure Turborepo inputs, outputs, global dependencies, environment inputs, and persistent tasks.
- [x] Add Bun test setup with Happy DOM and Testing Library.
- [x] Add Playwright for end-to-end tests.
- [x] Add Knip for unused exports and dependencies.
- [x] Add Lefthook with staged Oxc checks and appropriate type/tests.
- [x] Add Renovate configuration with grouped TanStack and Cloudflare updates.
- [x] Add GitHub Actions for install, generated-file verification, check, typecheck, test, build, and Wrangler dry run.
- [x] Cache Bun and Turborepo artifacts in CI.
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

- [x] Create packages/db and packages/domain.
- [x] Define schema for profiles, settings, posts, tags, media, comments, reactions, audit, outbox, and migration tracking.
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
- Invalid reactions, duplicate usernames, orphan relationships, and illegal post states are rejected.

### Phase 4: Better Auth, Better Auth UI, captcha, and email

- [x] Create packages/auth and packages/email.
- [x] Install compatible Better Auth, passkey, Better Auth UI, Harmony, React Email, and Turnstile packages.
- [x] Generate Better Auth schema for the selected plugins.
- [x] Integrate generated auth schema into packages/db and generate Drizzle migration.
- [x] Build request-scoped auth factory with D1 Drizzle adapter.
- [x] Add auth client and typed session helpers.
- [x] Add email/password, verification, magic link, email OTP, username, passkey, 2FA, admin, HIBP, Harmony, captcha, and optional multi-session plugins.
- [x] Add Turnstile widget and server verification.
- [x] Add Better Auth UI routes and account settings views.
- [x] Port the relevant EnderDash auth UI patterns without organization or billing code.
- [x] Add React Email templates and Cloudflare Email transport.
- [x] Add queue-backed email delivery with idempotency.
- [x] Add auth rate limits, no-store policy, trusted origins, and audit hooks.
- [x] Test session revocation before enabling cookie cache.
- [x] Add end-to-end sign-up, verification, sign-in, recovery, passkey, 2FA, and sign-out coverage.

Exit criteria:

- A new user can register, verify, sign in, secure the account, manage sessions, and delete the account in local Cloudflare development.
- Captcha and rate-limit failures are clear and safe.
- No auth response is publicly cached.
- Email templates render and transport tests pass.

### Phase 5: Public reading experience

- [x] Establish final PistonPost visual system and page shell.
- [x] Build accessible navigation, account menu, footer, error boundaries, not-found view, and metadata defaults.
- [x] Implement public feed query and cursor pagination.
- [x] Implement text, image-gallery, and video post renderers.
- [x] Implement public post detail.
- [x] Implement tag feed and profile feed.
- [x] Add public profile header.
- [x] Add public aggregate reaction counts without viewer leakage.
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
- [x] Add media quotas and rate limits.
- [x] Add local end-to-end coverage for text publishing, multi-image publishing, invalid-image recovery, and interrupted resumable video upload.
- [ ] Verify successful Stream direct upload, encoding readiness, and TUS resume end to end against disposable Cloudflare preview resources.

Exit criteria:

- Users can create, preview, publish, edit, and delete each post type.
- Interrupted and failed uploads recover or clean up.
- Unauthorized media cannot be attached or read.
- Video webhooks are signature verified and idempotent.

### Phase 7: Social actions, profiles, settings, and tables

- [x] Implement optimistic like, dislike, heart, and clear reaction mutations.
- [x] Implement comment creation and deletion.
- [x] Add comment and reaction rate limits.
- [x] Implement profile and preference forms.
- [x] Implement account deletion Workflow.
- [x] Install and pin TanStack Table v9.
- [x] Build shared table features and tests.
- [x] Build account post management table.
- [x] Build admin posts, comments, users, media, audit, and migration tables.
- [x] Add moderation actions with confirmations and audit events.
- [x] Add URL-synchronized filters, sorting, pagination, and column visibility.
- [x] Add permission and stale-state regression tests.

Exit criteria:

- Social mutations remain correct under optimistic failure and retry.
- Owners and administrators see only allowed actions.
- Tables update immediately and correctly after mutations.
- Account deletion completes or resumes without leaving live credentials or orphaned private media.

### Phase 8: Migration tooling

- [x] Create apps/migrate with analyze, dry-run, apply, resume, and verify commands.
- [x] Support Mongo exports and the actual mounted backup format.
- [x] Build deterministic transforms for every legacy entity.
- [x] Add Cloudflare D1, R2, and Stream writers behind interfaces.
- [x] Add migration run and mapping persistence.
- [x] Add checksums, batching, retry with backoff, and structured logs.
- [x] Add collision and missing-reference reports.
- [x] Add fixture backup covering edge cases.
- [x] Prove rerun idempotency and partial-failure resume.
- [x] Run a full local migration rehearsal.
- [ ] Run a disposable Cloudflare preview migration rehearsal.
- [x] Produce final production runbook and rollback checkpoints.

Exit criteria:

- Rehearsal counts reconcile.
- Every skip and failure is explained.
- Old public URLs resolve against migrated preview data.
- Rerunning a completed or interrupted stage does not duplicate data or media.

### Phase 9: Security, performance, and operational hardening

- [x] Threat-model auth, uploads, Stream webhooks, comments, reactions, admin actions, and migration credentials.
- [x] Add security headers and a tested Content Security Policy.
- [x] Add CSRF, origin, and content-type checks where the framework or Better Auth does not already cover them.
- [x] Add body and field size limits before parsing.
- [x] Add abuse tests for spoofed MIME types, oversized input, IDOR, role changes, and cache confusion.
- [x] Add D1 query plans for hot queries.
- [x] Add bundle analysis and remove server/client boundary leaks.
- [x] Tune cache TTL, query stale times, image variants, and trace sampling from measurements.
- [x] Add Queue dead-letter handling and operator alerts.
- [x] Add backup, restore, and D1 time-travel runbook.
- [x] Add dashboards or queries for Worker errors, queue lag, media failures, auth failures, and migration state.
- [x] Run warm local load tests for feed, populated post detail, and auth initiation.
- [ ] Run authenticated preview load tests for reactions and comments.

Exit criteria:

- No critical or high threat-model finding remains.
- Hot queries use expected indexes.
- Error, latency, and queue signals are visible.
- Restore procedure is rehearsed.

### Phase 10: Cutover

- [ ] Freeze legacy writes at an announced time.
- [ ] Take a final backup and fingerprint it.
- [ ] Run final migration analyze and dry-run.
- [ ] Run production migration with operator confirmation.
- [ ] Verify counts, checksums, permissions, sampled accounts, and sampled URLs.
- [ ] Configure production routes, domain, email, Turnstile, R2, Images, Stream, Queues, Workflows, D1, cache, and secrets.
- [ ] Deploy the Worker with generated migrations applied by the defined CI flow.
- [ ] Run production smoke tests.
- [ ] Keep the legacy system read-only for the rollback window.
- [ ] Monitor auth, 404, media, queue, D1, and Worker metrics.
- [ ] Publish user guidance explaining the required fresh sign-in.
- [ ] Close cutover only after the rollback window and reconciliation pass.

Go-live checks:

- Public feed and sampled old post URLs.
- Text, image, and video rendering.
- New sign-in and migrated-user magic link.
- Profile, tag, and unlisted behavior.
- Reaction and comment mutation.
- New upload and media processing.
- Admin moderation.
- Email delivery.
- Account deletion initiation.
- Cache privacy.
- Error and trace visibility.

## CI and deployment plan

Pull request CI:

1. bun ci install.
2. Verify generated route, Worker, Better Auth, and migration files.
3. Oxc check.
4. Typecheck.
5. Unit and integration tests.
6. Production build.
7. Wrangler deploy dry run.
8. Migration fixture rehearsal for migration changes.
9. Playwright smoke suite for affected critical routes.

Production deployment:

- Apply generated D1 migrations through one controlled CI job.
- Deploy Worker after migration success.
- Upload source maps.
- Attach commit SHA and deployment metadata.
- Run smoke tests.
- Do not deploy from uncommitted local state.

Use path filters only after proving they do not skip required shared-package checks. Shared configuration, lockfile, schema, or runtime changes should invalidate every relevant task.

## Definition of done

The rewrite is complete when:

- Every required legacy feature has a tested new equivalent or an approved documented replacement.
- The production application runs on the intended Cloudflare services.
- All data and media reconcile within approved thresholds.
- Migrated users can regain access without migrating unsafe sessions or tokens.
- Public, unlisted, draft, deleted, and moderated states behave correctly.
- Authentication, authorization, captcha, rate limits, caching, and uploads pass security tests.
- The application is usable with keyboard and assistive technology.
- Mobile and desktop layouts are deliberate and stable.
- CI is green and generated artifacts are reproducible.
- Deployment, migration, restore, rollback, and incident runbooks exist.
- There are no unexplained migration skips or orphaned production objects.

## Decisions and deviations

Record future changes here with date, decision, reason, and affected phases.

- 2026-07-14: Use a single TanStack Start Worker for the initial product. This keeps SSR, auth, API, and Cloudflare bindings in one request boundary while shared packages preserve modularity.
- 2026-07-14: Use Base UI because the requested shadcn preset generated Base UI and the user explicitly requested it.
- 2026-07-14: Treat TanStack Table v9 as an exact-pinned beta and TanStack Form as the current compatible 1.x line.
- 2026-07-14: Do not migrate legacy sessions or verification tokens. Require fresh authentication at cutover.
- 2026-07-14: Do not add Better Auth organizations. PistonPost authorization is user, ownership, and role based.
- 2026-07-14: Use Cloudflare products where they solve a concrete requirement. Do not add platform services without a matching domain or operational need.
- 2026-07-15: Replace the industrial independent-publishing identity with a plain, content-first social identity grounded in the legacy archive. User-facing copy says post rather than transmission or publish, the feed starts with content, image collections receive first-class presentation, and the visual system uses Outfit with a warm neutral, coral, and yellow palette.
- 2026-07-15: Import incomplete public image posts as partial galleries when at least one image survives. Omit incomplete unlisted posts and media used only by those posts. Keep empty public media posts and incomplete non-gallery media posts as cutover-blocking failures.
- 2026-07-14: Use Effect for domain services, repository and provider adapters, queues, Workflows, migration stages, retries, configuration, and typed operational errors. Keep TanStack, React, Better Auth, and Drizzle composition native at their public boundaries.
- 2026-07-14: Use shadcn Typeset for long-form post rendering and use Base UI-backed shadcn components whenever they own a real product interaction. Do not add components without a concrete use.
- 2026-07-14: Generate Better Auth-owned tables before adding product-to-user foreign keys. Phase 3 enforces every product-only relationship immediately; Phase 4 adds the user relationships from the generated auth schema so the auth tables are never hand-authored from memory.
- 2026-07-14: New posts may contain up to 20 images at 15 MB each, or one video up to 2 GB and 10 minutes. Existing migrated galleries remain viewable even when they exceed the new-authoring limits.
- 2026-07-14: Account deletion starts a durable Workflow before Better Auth removes the user. Media ownership becomes nullable only during that handoff, provider objects are deleted idempotently, and the final media records are removed after R2 and Stream succeed.
- 2026-07-14: Administration tables use server-side `(created_at, id)` cursors. Cursor history, sort direction, filters, and column visibility live in URL search parameters so large datasets never rely on offset pagination.
- 2026-07-14: Keep the full Better Auth UI provider scoped to authentication, settings, and other account routes. Public navigation uses a small session-aware account menu so passkey, two-factor, CAPTCHA, and account-management code do not enter the public root bundle.
