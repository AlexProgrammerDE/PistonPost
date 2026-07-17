# Security threat model

This threat model covers the initial Cloudflare deployment. It treats D1, private R2, Images, Stream, Queues, Workflows, Email Service, and Secrets Store as trusted platform boundaries. Browsers, uploaded files, webhook requests, queue bodies, and all user-controlled text are untrusted.

## Protected assets

- Account sessions, passkeys, two-factor secrets, email addresses, and account-linking state.
- Draft, deleted, moderated, and unlisted content.
- Private R2 originals, Stream video identifiers, and upload intents.
- Administrative actions and audit history.
- Email sending reputation and notification preferences.

## Trust boundaries and controls

| Boundary               | Primary threats                                                                       | Required controls                                                                                                                                                       | Verification                                                          |
| ---------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Authentication         | Credential stuffing, CAPTCHA bypass, bot traffic, suspicious sign-in, stale privilege | Turnstile, auth rate limit, Sentinel browser identification and security checks, explicit account-linking rules, fresh database role checks                             | Better Auth tests, request-security tests, admin role regression test |
| Browser mutations      | CSRF, cross-site fetch, content-type confusion, oversized parser input                | Exact Origin check, cross-site Fetch Metadata rejection, allowlisted content types, Content-Length limits before framework parsing                                      | `request-security.test.ts`                                            |
| Image upload           | IDOR, spoofed MIME, polyglot or oversized image, decompression bomb, quota abuse      | Owner-bound intent, short expiry, exact size, Images metadata sniffing, extension and MIME agreement, 80 MP limit, 15 MB limit, per-user rate limit                     | upload route checks and media state tests                             |
| Stream                 | Forged webhook, replay, oversized webhook, video ownership confusion                  | HMAC over the raw body, timestamp window, 64 KiB limit, creator ID, 2 GB and 10 minute intent limits, scheduled reconciliation                                          | `stream-webhook.test.ts` and reconciliation job                       |
| Comments and reactions | Spam, IDOR, stale optimistic state, unsafe text                                       | Authenticated user key, dedicated rate limits, bounded schemas, server ownership checks, text-only rendering, rollback                                                  | domain, social-state, and server tests                                |
| Administration         | Client-side role trust, stale role cache, stale moderation action                     | Every server function reloads current role and ban state from D1, validates expected entity state, writes an audit event                                                | session and moderation regression tests                               |
| Public cache           | Personalized response leakage, unlisted caching, cookie confusion                     | Anonymous-only cache, `Vary` on Cookie and Authorization, no cache on `Set-Cookie`, explicit private header for unlisted routes                                         | `cache-policy.test.ts`                                                |
| Queue and Workflow     | Duplicate work, poison messages, private data in logs                                 | ID-only payloads, expiring outbox claims, completion after provider acceptance, terminal dead-letter state, metadata-only dead-letter records, resumable Workflow steps | queue schema and deletion tests                                       |

## Browser policy

Every Worker response receives CSP, `nosniff`, frame denial, a strict referrer policy, a restrictive Permissions Policy, and cross-origin opener isolation. Production HTTPS responses receive HSTS.

The current TanStack Start renderer emits inline hydration scripts, so CSP temporarily permits inline scripts and styles. This is a documented medium-strength limitation, not an untracked exception. `object-src 'none'`, `base-uri 'self'`, strict frame and connection allowlists, safe text rendering, and the absence of user-authored HTML constrain its impact. Revisit a nonce-based Start integration when the framework exposes one across SSR and hydration.

## Residual risks

- Cloudflare Email Service and its delivery behavior are beta platform dependencies. Authentication remains usable through supported providers and passkeys if non-blocking notification delivery fails.
- Table v9 is beta but isolated to the shared table adapter and does not own authorization or persistence.
- D1 has one primary writer. Mutations stay short and indexed, but bursts can still increase latency.
- Cross-provider deletion can fail between D1, R2, and Stream. Outbox and Workflow state make those operations resumable.
- A production penetration review still requires provisioned infrastructure and operator credentials.

No known code-level critical or high finding remains after the controls above. Preview configuration, credential scope, DNS, and real delivery behavior must still pass the launch review.
