# Operational observability

PistonPost uses Workers Observability for logs and traces, Analytics Engine for aggregate events, D1 outbox rows for durable job state, and the administration tables for job inspection.

## Signals

| Concern               | Signal                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Worker errors         | Error log count by deployment, route class, and exception name                                   |
| Latency               | `request.completed` Analytics Engine doubles for status and duration                             |
| Auth abuse            | 429 responses and `request.rejected` events on the auth route class                              |
| Queue lag             | Queue backlog age and outbox rows with null `processed_at`                                       |
| Dead letters          | `dead-letter.received` events, `queue.dead-letter` error logs, and `outbox.kind = 'dead-letter'` |
| Media failures        | `media_assets.status = 'failed'` by provider and age                                             |
| Stream reconciliation | Pending or processing video rows older than the scheduled reconciliation window                  |
| Workflows             | Account-deletion instance failures and step retry count                                          |

Logs contain request classes, status, duration, opaque IDs where needed, and error names. They must not contain request bodies, raw headers, cookies, authorization values, OTPs, email addresses, comment text, or upload bytes.

## Useful D1 checks

```sql
select kind, count(*) as pending, min(created_at) as oldest
from outbox
where processed_at is null
group by kind;

select provider, status, count(*) as assets
from media_assets
group by provider, status;

```

`migration_runs` and `migration_mappings` remain in D1 as retained historical state. The application no longer exposes migration tooling or an administration view for those tables.

## Alerts

Configure Cloudflare alerts against persisted error logs for `queue.dead-letter`, Stream webhook rejection spikes, Workflow failures, and elevated 5xx responses. Add queue backlog and oldest-message alerts for both the primary and dead-letter queues. Alert destinations are production operator configuration and must not be committed.

Preview traces sample every request. Production traces use the committed 5 percent baseline. Raise sampling temporarily for a scoped incident, then return it to the baseline. Do not use Analytics Engine as application state or long-term audit storage.

## Local baseline

The 2026-07-14 warm development baseline used 50 requests per scenario at concurrency 10 against a populated local D1. Feed, post-detail, and sign-in scenarios ran concurrently with no failures. They each sustained about 12.7 requests per second; p95 was 857.1 ms for the feed, 857.8 ms for post detail, and 914.7 ms for sign-in. A cold 100-request pass also completed without failures but included 15 to 21 second Vite compilation outliers. These are development diagnostics, not production service-level objectives.

The production client build contains 68 JavaScript chunks totaling 1,850,606 bytes. The largest raw chunk is 452,887 bytes. CI rejects any chunk above 600 KiB, total JavaScript above 2.5 MB, server-only package markers, or a local secret value in client output.

Run the same public baseline with:

```bash
bun run load:test --base-url http://localhost:3000 --requests 100 --concurrency 10
```

Authenticated reaction and comment scenarios require a disposable preview account. Supply a short-lived session cookie and reviewed server-function paths and bodies through the `LOAD_TEST_SESSION_COOKIE`, `LOAD_TEST_REACTION_PATH`, `LOAD_TEST_REACTION_BODY`, `LOAD_TEST_COMMENT_PATH`, and `LOAD_TEST_COMMENT_BODY` environment variables. Never run mutation load tests against production user content.
