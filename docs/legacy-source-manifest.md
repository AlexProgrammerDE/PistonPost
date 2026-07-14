# Legacy source manifest

This document records the inventory observed during the original PistonPost backup inspection. The migration CLI produces a new fingerprinted JSON inventory for every mounted source. That generated report is the authority for rehearsal and cutover.

## Recorded inventory

| Source item          | Recorded count |
| -------------------- | -------------: |
| Users                |             24 |
| Posts                |            508 |
| Comments             |             26 |
| Image records        |         16,466 |
| Video records        |             29 |
| Archived image files |         16,325 |
| Archived video files |             29 |
| Static media size    |  About 6.25 GB |

## Recorded discrepancies

| Discrepancy                          | Recorded count | Import policy                                                                         |
| ------------------------------------ | -------------: | ------------------------------------------------------------------------------------- |
| Posts with missing media             |             14 | Keep the post in a visible failed migration state and report every missing reference. |
| Orphan image records                 |          2,829 | Quarantine the record. Do not publish it or attach it to a post.                      |
| Orphan video records                 |             12 | Archive and report it only when a source file exists. Do not publish it.              |
| Image files without database records |             42 | Store under a quarantine prefix with checksum and source path in the report.          |

These counts are historical observations, not a substitute for a fresh inventory. Before each rehearsal and the production cutover, run:

```bash
bun run migrate analyze \
  --source "/mnt/PistonPostBackup" \
  --report reports/migration
```

Keep the resulting JSON and Markdown files with the immutable source backup. A source fingerprint change invalidates any prior run ID.

## Deliberate discard policy

The importer does not migrate legacy sessions, verification tokens, password credentials, magic-link tokens, or other authentication secrets. Users claim their already-associated data by signing in with their normalized legacy email address. Duplicate normalized emails remain a blocking discrepancy until an operator records the accepted resolution.
