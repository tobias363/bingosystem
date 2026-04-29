# apps/backend/schema/

This directory holds the **canonical, declarative schema baseline** for the backend Postgres database. Used by the schema-CI gate to verify that running every migration in `apps/backend/migrations/` against a fresh DB produces this exact schema.

## Files

- `baseline.sql` — output of `pg_dump --schema-only --no-owner --no-acl --no-comments --schema=public`, normalized by `scripts/schema-ci/dump-schema.sh`. Refresh with `npm run schema:snapshot` (requires Docker locally) after intentional schema changes.

## Why is this OUTSIDE `apps/backend/migrations/`?

`node-pg-migrate` scans every file matching `*.{sql,js,mjs,ts}` in the `-m` directory and tries to run it as a migration. If we kept `baseline.sql` next to migrations, node-pg-migrate would try to execute it as a migration — disaster. Putting it in a sibling directory keeps the migrate tool oblivious to its existence.

## How is it used?

1. **PR/push CI gate** (`.github/workflows/schema-ci.yml`): runs all migrations on a fresh shadow Postgres, dumps the resulting schema, diffs against `baseline.sql`. Any drift fails the build.
2. **Nightly ghost-detection** (`.github/workflows/schema-ghost-nightly.yml`): runs all migrations on shadow, dumps the LIVE staging DB, diffs the two. Drift = a manual SQL change to staging that wasn't codified in a migration. Opens a GitHub issue.

## How do I refresh it?

```bash
# Local Docker workflow:
npm run schema:snapshot

# Review the diff:
git diff apps/backend/schema/baseline.sql

# Commit:
git add apps/backend/schema/baseline.sql
```

See `docs/operations/SCHEMA_CI_RUNBOOK.md` for the full workflow including no-Docker alternatives and debugging.

## Related

- `docs/operations/SCHEMA_CI_RUNBOOK.md` — debugging / intentional drift / on-call.
- `docs/audit/SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md` — historical context: why the gate exists.
- `apps/backend/migrations/README.md` — forward-only migration policy.
- `scripts/schema-ci/` — the shell scripts the CI invokes.
