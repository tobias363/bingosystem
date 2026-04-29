# Schema CI Runbook

**Owner:** Technical lead (Tobias Haugen)
**Last updated:** 2026-04-29
**Linked:** `.github/workflows/schema-ci.yml`, `.github/workflows/schema-ghost-nightly.yml`, `scripts/schema-ci/`, `apps/backend/schema/baseline.sql`, `docs/audit/SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md`, `docs/operations/MIGRATION_DEPLOY_RUNBOOK.md`

This runbook covers the schema-CI gate that prevents ghost migrations and schema drift, plus the nightly ghost-detection job. Read this if a schema-CI build fails or a nightly drift issue is opened.

---

## 1. Why this exists

Yesterday's `SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md` found nine ghost migrations in prod (registered as run, schema effect missing) and one schema-ahead column that no migration declared. Two more ghosts were missed during yesterday's repair and applied by hand today.

Without an automated gate the next ghost is a question of when, not if. With 128+ migrations and growing the manual process of "remember to run the migration locally before deploy" is the wrong incentive — the CI must enforce it.

The gate has two parts:

1. **PR-time gate** (`schema-ci.yml`) — every PR/push runs all migrations on a fresh shadow Postgres and diffs the resulting schema against `apps/backend/schema/baseline.sql`. Any divergence fails the build. Catches the "I wrote a migration but forgot to commit the file" and "the migration order doesn't match what's in main" cases.
2. **Nightly ghost detection** (`schema-ghost-nightly.yml`) — every night runs the same shadow-replay and diffs against the live staging DB. Drift opens a GitHub issue. Catches the "someone applied SQL to staging by hand" case that the PR-time gate cannot see.

---

## 2. How the gate works (PR-time)

```
                               on every PR + push to main:
                               ┌──────────────────────────┐
                               │ start postgres:18-alpine │
                               │  service container       │
                               └──────────┬───────────────┘
                                          │
                                          ▼
                       ┌────────────────────────────────────┐
                       │ scripts/schema-ci/                  │
                       │  run-shadow-migrations.sh           │
                       │  → npm --prefix apps/backend run    │
                       │     migrate                         │
                       └────────────────┬───────────────────┘
                                        │
                                        ▼
                       ┌────────────────────────────────────┐
                       │ scripts/schema-ci/                  │
                       │  dump-schema.sh                     │
                       │  → pg_dump --schema-only normalized │
                       │  → /tmp/shadow-schema.sql           │
                       └────────────────┬───────────────────┘
                                        │
                                        ▼
                       ┌────────────────────────────────────┐
                       │ scripts/schema-ci/                  │
                       │  diff-schema.sh                     │
                       │  baseline.sql vs shadow-schema.sql  │
                       │  exit 0 = ok, exit 1 = drift        │
                       └────────────────┬───────────────────┘
                                        │
                                        ▼
                                  pass / fail
```

The job has a 5-minute timeout to keep developer feedback fast.

---

## 3. Refreshing the baseline (intentional schema changes)

When you add a new migration that legitimately changes the schema (new column, index, table) you must refresh the checked-in baseline. The gate fails until the baseline matches what `npm run migrate` produces.

### 3.1 Local workflow with Docker

```bash
# 1. Add your new migration file:
npm --prefix apps/backend run migrate:create describe_what_you_added
# edit migrations/<timestamp>_describe_what_you_added.sql

# 2. (Optional but recommended) test the migration locally first:
docker run --rm -d --name schema-ci-shadow-pg \
  -e POSTGRES_USER=shadow -e POSTGRES_PASSWORD=shadow -e POSTGRES_DB=shadow \
  -p 55432:5432 postgres:18-alpine
APP_PG_CONNECTION_STRING="postgresql://shadow:shadow@localhost:55432/shadow" \
  npm --prefix apps/backend run migrate
docker rm -f schema-ci-shadow-pg

# 3. Refresh the baseline:
npm run schema:snapshot

# 4. Review what changed:
git diff apps/backend/schema/baseline.sql

# 5. Commit both:
git add apps/backend/migrations/<timestamp>_*.sql
git add apps/backend/schema/baseline.sql
git commit -m "feat(backend): add <thing>"
```

`npm run schema:snapshot` calls `bash scripts/schema-ci/snapshot.sh` which boots a `postgres:18-alpine` container, runs all migrations, dumps the resulting schema, and writes it to `apps/backend/schema/baseline.sql`.

### 3.2 No Docker (CI runner / remote shadow DB)

```bash
# Provide your own shadow connection string.
SHADOW_PG_CONNECTION_STRING="postgresql://user:pw@some-shadow-host:5432/shadow" \
  npm run schema:snapshot
```

The script will skip the local-docker bootstrap and use your DB directly. The shadow DB MUST be empty (`pgmigrations` table absent or empty) — otherwise the migrations run will be incomplete and the baseline wrong.

---

## 4. Debugging a failing PR-time build

Symptom: the **Schema CI Gate** check is red on your PR.

### 4.1 Open the failed run

The job logs end with a "Diff against checked-in baseline" step that prints the full unified diff. Skim the diff first — usually you can identify what's different.

The job also uploads `shadow-schema-after-migrate` as a workflow artifact (retained 7 days). Download it if you want the raw output to compare locally.

### 4.2 Most common cases

| Diff shows | What happened | Fix |
|---|---|---|
| New CREATE TABLE / new column / new index | You added a migration but didn't refresh the baseline. | Run `npm run schema:snapshot` locally and commit the updated baseline. |
| Removed something (DROP TABLE, DROP COLUMN) | A migration dropped the object. Same as above. | Run `npm run schema:snapshot` locally and commit the updated baseline. |
| Missing object (in baseline but not in shadow) | Your branch deletes or renames a migration file relative to main, OR a migration that was on main is missing from your branch. | Re-add the migration file from main, or commit the corresponding new migration that supersedes it. Then refresh baseline. |
| Function definition differs (whitespace, body) | A migration uses `CREATE OR REPLACE FUNCTION` and the body changed. | Refresh baseline. |
| Trigger order differs | A migration drops + recreates a trigger. | Refresh baseline. |
| Comments / `COMMENT ON ...` differ | The dump-script intentionally strips `--no-comments`, so this should not happen. If it does, file a bug — fix the normalizer. | — |

### 4.3 If `git diff` on the baseline is huge

Sometimes a small migration produces a large diff because pg_dump groups objects by table-OID (which differs between fresh DB and prod for newly-added tables). Don't worry — the relevant changes are still all there. Skim for the actual new objects.

### 4.4 If the baseline diff doesn't match what your migration declares

That's a real bug. The migration is wrong (or another migration deleted what you expected). Look at the full diff, identify the unexpected change, and decide if it's correct.

---

## 5. Responding to a nightly ghost-detection issue

Symptom: a GitHub issue titled `Schema drift detected YYYY-MM-DD` is opened by `github-actions[bot]` with the `schema-drift` label.

### 5.1 First triage

Open the issue. The body contains the first 30 KB of the diff between shadow-after-migrate and the live staging DB. The full schemas + diff are attached as workflow artifacts (under `schemas-<run_id>`, retained 30 days).

The diff direction is:
- **Expected** = shadow-after-migrate (what `apps/backend/migrations/` files produce on a fresh DB)
- **Actual** = staging-live (what's actually deployed)

### 5.2 Common causes

| Diff shows in "actual" but not in "expected" | Likely cause |
|---|---|
| New column on a table | Someone applied `ALTER TABLE ADD COLUMN` to staging by hand without writing a migration. |
| Function with edited body | Someone ran `CREATE OR REPLACE FUNCTION` on staging directly. |
| Index that's not in any migration | Same as above — manual `CREATE INDEX` on staging. |

| Diff shows in "expected" but not in "actual" | Likely cause |
|---|---|
| New column / index / table | A migration ran on the `main` branch but staging hasn't been redeployed yet. Wait for the next staging deploy and re-run the workflow manually (`workflow_dispatch`). |
| Whole tables missing | A migration is ghost-applied — registered in `pgmigrations` but the SQL never ran. Apply the migration manually with `IF NOT EXISTS` guards, or write a new compensating migration. |

### 5.3 Resolution

1. **Identify the source.** Read the diff. Was the change intentional?
2. **If intentional:** add a migration file under `apps/backend/migrations/` that produces the same effect. Use `IF NOT EXISTS` / `DO $$` guards because the change is already in staging — the migration must be idempotent on a partially-applied DB.
3. **Refresh the baseline:** `npm run schema:snapshot`
4. **Open a PR** with the new migration + updated baseline. The PR-time gate will verify the migration produces what's needed.
5. **Once merged + deployed,** the next nightly run will pass.
6. **Close the GitHub issue** with a comment linking to the PR.

If the diff is small and clearly accidental (e.g. someone forgot to commit the migration file from a previous PR) the same fix works — codify the change as a migration.

---

## 6. Architecture details

### 6.1 Why a baseline file vs runtime checks

The repo could theoretically run "compare shadow-after-migrate to itself" without a baseline. We chose to commit the baseline because:

- **PR review surface.** Reviewers can see the schema delta in `git diff` for the migration PR. Without a baseline you'd have to re-run CI to learn what changed.
- **Audit trail.** The baseline file is part of git history — you can `git log -p apps/backend/schema/baseline.sql` to see when each schema effect was introduced.
- **Bootstrap.** A new dev cloning the repo can `pg_dump` the baseline and diff against their local DB to know if their dev DB is stale.

### 6.2 Why pg_dump is normalized

`pg_dump` from PostgreSQL 17+ emits a session-token line `\restrict <random>` that varies per run. PostgreSQL 18 also emits "Dumped from database version X.Y" comments. Both vary between local runs and CI. The `dump-schema.sh` normalizer strips these so the baseline is byte-stable and diffs are meaningful.

### 6.3 Why postgresql-client-18 is pinned in CI

CI runs the `postgres:18-alpine` service container (matches prod's PostgreSQL 18.3 on Render), but the Ubuntu runner ships pg_dump v14 or v16 by default. `pg_dump` from older majors talking to a PostgreSQL 18 server emits subtly different output (e.g. some defaults are formatted differently, role grants change syntax). Pinning client v18 — installed from the official PostgreSQL APT repo — makes the dump byte-stable against the prod-derived baseline.

### 6.4 Why we don't auto-fix

We considered an auto-baseline-refresh that would suggest a commit on every failing PR. Decided against:

- The point of the gate is to make the developer think about what changed. Auto-baseline removes that signal.
- Auto-fixing a ghost detection issue would let a developer accept a manual SQL-on-staging change without writing a migration. That's the bug we're trying to prevent.

The gate is designed to be friction with a clear escape hatch (`npm run schema:snapshot`).

---

## 7. Maintenance

### 7.1 Updating the postgres image version

When prod upgrades to a new major Postgres version (e.g. 18 → 19):

1. Update `services.postgres.image` in both `.github/workflows/schema-ci.yml` and `.github/workflows/schema-ghost-nightly.yml`.
2. Update `postgresql-client-18` to `postgresql-client-19` (or current) in both files, and the corresponding `/usr/lib/postgresql/<N>/bin` PATH export.
3. Refresh the baseline with the new pg_dump version: `npm run schema:snapshot`.
4. Verify locally that the diff is just version-noise from the dumper (no real schema changes), then commit.

### 7.2 Removing migration files

Don't. The repo policy is forward-only migrations (see `apps/backend/migrations/README.md`). If you need to undo a migration write a new forward-migration that reverses it.

### 7.3 Renaming a migration file

If you rename `20260101000000_old.sql` to `20260101000000_new.sql`:

- node-pg-migrate keys on filename. The `pgmigrations.name` column in prod still has `20260101000000_old`.
- A fresh shadow DB (CI) registers the new name. Diff between prod (`old`) and shadow (`new`) might pass for schema effects but not for the `pgmigrations` table content — but `pg_dump --schema-only` doesn't dump table content, so this isn't caught directly.
- Bottom line: don't rename. The filename is a stable identifier.

---

## 8. Configuration reference

| File | Purpose |
|---|---|
| `.github/workflows/schema-ci.yml` | PR-time gate. Runs migrations on shadow Postgres, diffs vs baseline. |
| `.github/workflows/schema-ghost-nightly.yml` | Nightly ghost-detection. Runs migrations on shadow, diffs vs staging. |
| `scripts/schema-ci/run-shadow-migrations.sh` | Boots a shadow Postgres (or uses caller-provided) and runs migrations. |
| `scripts/schema-ci/dump-schema.sh` | Normalized `pg_dump --schema-only`. |
| `scripts/schema-ci/diff-schema.sh` | Compares two schema files; CI-friendly output. |
| `scripts/schema-ci/snapshot.sh` | Local-dev wrapper. Boots Docker, runs migrations, dumps to baseline. |
| `apps/backend/schema/baseline.sql` | Checked-in canonical schema. Refreshed via `npm run schema:snapshot`. |

| GitHub repo secret | Purpose | Optional? |
|---|---|---|
| `STAGING_PG_READONLY_URL` | Read-only connection string for nightly ghost-detection. Format: `postgresql://readonly_user:pw@host:port/db`. | YES — without it the nightly job is a no-op. |

---

## 9. Related runbooks

- `docs/operations/MIGRATION_DEPLOY_RUNBOOK.md` — how migrations run on Render deploy.
- `docs/operations/SCHEMA_ARCHAEOLOGY_2026-04-29.md` — yesterday's ghost-migration repair history.
- `docs/audit/SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md` — full audit of yesterday's drift.
- `docs/operations/ROLLBACK_RUNBOOK.md` — what to do if a migration breaks prod.
