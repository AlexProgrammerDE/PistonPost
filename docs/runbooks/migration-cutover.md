# Legacy migration and cutover runbook

This runbook covers local rehearsal, Cloudflare preview rehearsal, production import, verification, and rollback. Do not run a remote apply from an uncommitted checkout.

## Safety rules

- Mount the source backup read-only.
- Never place API tokens, access keys, user emails, or source documents in command arguments, reports, or logs.
- Use a Cloudflare API token limited to the target D1 database, target R2 bucket, and Stream write access.
- Keep preview and production credentials separate.
- Apply every generated D1 migration before starting the importer.
- Stop if the source fingerprint differs from the reviewed dry-run.
- Review every legacy administrator ID and pass only the approved IDs through
  `PISTONPOST_MIGRATION_ADMIN_IDS`. Never commit the value.
- Treat every unexplained skip, checksum mismatch, or foreign-key violation as a no-go result.
- Apply the approved missing-media policy exactly: publish an incomplete public image gallery only when at least one image survives, omit incomplete unlisted posts and their exclusive media, and block public posts with no surviving media or incomplete non-gallery media.

## Required operator environment

Set `PISTONPOST_MIGRATION_ADMIN_IDS` to the comma-separated legacy MongoDB IDs of administrators whose role was explicitly reviewed. Leave it empty only when the source has no administrators. An unapproved legacy administrator or an allowlist entry that is not a legacy administrator blocks production before writes begin.

## Required remote environment

The importer reads these values from its process environment. Values must come from the operator secret manager or an ephemeral shell session that is not recorded.

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
PISTONPOST_PREVIEW_D1_DATABASE_ID
PISTONPOST_PREVIEW_R2_BUCKET
PISTONPOST_PREVIEW_R2_ACCESS_KEY_ID
PISTONPOST_PREVIEW_R2_SECRET_ACCESS_KEY
PISTONPOST_PRODUCTION_D1_DATABASE_ID
PISTONPOST_PRODUCTION_R2_BUCKET
PISTONPOST_PRODUCTION_R2_ACCESS_KEY_ID
PISTONPOST_PRODUCTION_R2_SECRET_ACCESS_KEY
```

The Stream writer uses the same account ID and narrowly scoped API token. The R2 writer verifies the stored SHA-256 object metadata before treating an existing immutable key as complete.

## Local rehearsal

1. Create a clean rehearsal directory.
2. Analyze the source and review collision, missing-reference, orphan, and unmatched-file entries.
3. Run a dry-run and save both report formats.
4. Apply to a fresh local SQLite database.
5. Repeat the apply with the same source and run ID.
6. Verify that every second-run result is `already-present` and counts stay unchanged.

```bash
rm -rf .migration/rehearsal reports/migration/rehearsal

bun run migrate analyze \
  --source "/mnt/PistonPostBackup" \
  --report reports/migration/rehearsal

bun run migrate dry-run \
  --source "/mnt/PistonPostBackup" \
  --report reports/migration/rehearsal

bun run migrate apply \
  --source "/mnt/PistonPostBackup" \
  --database .migration/rehearsal/pistonpost.sqlite \
  --report reports/migration/rehearsal

bun run migrate apply \
  --source "/mnt/PistonPostBackup" \
  --database .migration/rehearsal/pistonpost.sqlite \
  --resume "<run-id>" \
  --report reports/migration/rehearsal
```

Use `--phase users|images|videos|posts|comments|reactions|verify` to isolate a failed stage. Use `--user <legacy-id>` only for a reviewed account-level diagnostic. A phase run is resumable but is not a complete reconciliation by itself.

## Preview rehearsal

Apply current generated migrations to the disposable preview D1 database. Confirm the preview R2 bucket is private and Stream uploads use preview-prefixed creator IDs. Then run:

```bash
bun run migrate apply \
  --source "/mnt/PistonPostBackup" \
  --target preview \
  --remote \
  --report reports/migration/preview
```

After Stream processing settles, run the `videos` and `verify` phases again. Check sampled legacy slugs, media order, unlisted direct links, authorship, timestamps, tags, comment totals, and all three independent reaction totals in the preview application.

Delete the disposable resources only after reports and acceptance notes are archived.

## Production checkpoints

Record each checkpoint in the cutover log:

1. Announced legacy write freeze is active.
2. Final backup is complete, mounted read-only, and fingerprinted.
3. D1 Time Travel bookmark and current Worker deployment ID are recorded.
4. Generated migrations are listed, reviewed, and applied.
5. Final analyze and dry-run fingerprints match the mounted source.
6. The preview rehearsal for that fingerprint has an accepted go verdict.
7. Production bindings, email sending, Turnstile, queues, workflows, Images, Stream, R2, and secrets are verified.
8. An operator runs the production command with the explicit confirmation flag.
9. Counts, checksums, permissions, sampled accounts, and sampled URLs reconcile.
10. Claim emails are sent once, after reconciliation, through the production queue.

```bash
bun run migrate apply \
  --source "/mnt/PistonPostBackup" \
  --target production \
  --remote \
  --confirm-production \
  --report reports/migration/production
```

## Rollback

Do not delete the old deployment during the rollback window.

If the Worker deploy fails but data is compatible, redeploy the recorded prior Worker deployment. If a database migration or import makes the prior Worker incompatible, stop new writes, restore D1 to the recorded Time Travel bookmark, and point traffic back to the read-only legacy deployment. Do not delete newly uploaded R2 or Stream objects until the database decision is final. Immutable object keys make abandoned objects safe to reconcile later.

After rollback, preserve the failed run report, Worker deployment ID, D1 bookmark, queue state, and source fingerprint. Fix the cause and repeat preview rehearsal from a clean disposable environment before attempting production again.
