# Backup, restore, and D1 Time Travel runbook

Use this runbook before schema changes, production migration, or an incident that may require data restoration.

## Capture recovery points

1. Record the deployed Worker version and commit SHA.
2. Record a D1 Time Travel bookmark immediately before applying migrations.
3. Export D1 to an encrypted operator-controlled location for long retention.
4. Inventory private R2 objects and preserve the immutable legacy backup separately.
5. Export Stream video metadata and UIDs. The original legacy video archive remains the recovery source for migrated videos.
6. Record queue backlog and active Workflow instance IDs.

Never store exports in the public media bucket. Never write secret values into the recovery log.

## Restore rehearsal

Rehearse against disposable preview resources, not production:

1. Create a clean preview D1 database.
2. Apply the schema version that matches the selected Worker deployment.
3. Restore the D1 export or Time Travel point.
4. Bind the restored database to a disposable Worker route.
5. Verify foreign keys, user and content counts, public feed order, unlisted access, and sampled ownership.
6. Verify referenced R2 checksums and Stream readiness without mutating originals.
7. Run smoke tests, then destroy the disposable route and resources after evidence is archived.

## Incident restore

Freeze writes first. Capture the current broken state before changing it. Restore D1 to the recorded bookmark that matches the selected Worker version, then deploy that compatible Worker. Keep Queues paused until operators determine whether pending messages were created before or after the restore point. Idempotency keys allow reviewed messages to be replayed.

R2 and Stream are not rolled back by D1 Time Travel. Do not bulk-delete provider objects during database recovery. Reconcile them against restored media rows after the application is stable. Immutable object keys and the legacy archive allow safe deferred cleanup.

## Exit checks

- D1 foreign-key check returns no rows.
- Authentication and fresh administrator checks work.
- Public, unlisted, draft, moderated, deleted, and failed visibility is correct.
- Sampled posts retain author, timestamps, tags, comments, reactions, and media order.
- Queue consumers and Workflows resume without duplicate effects.
- The incident log contains the restore point, Worker version, verification report, and operator decision.
