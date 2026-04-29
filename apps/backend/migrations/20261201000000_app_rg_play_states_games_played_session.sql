-- Codifies a column that exists in prod but was never declared in any
-- migration file. Discovered by SCHEMA_DIVERGENCE_AUDIT_2026-04-29 §5.1.
--
-- The column `app_rg_play_states.games_played_in_session` is actively used
-- by ComplianceManager / ResponsibleGamingPersistence to count games
-- played in the current session for §66 mandatory-pause logic. It was
-- added to prod via direct DDL in an earlier era (before migrations were
-- the authoritative source of schema). This migration captures it so:
--
--   1. Future fresh deploys (e.g. for a new test env) get the same schema
--      from a clean migration run.
--   2. The schema-CI gate in .github/workflows/schema-ci.yml succeeds:
--      shadow DB after `npm run migrate` will now have this column,
--      matching the committed schema-baseline.sql.
--   3. The migration record is auditable.
--
-- Idempotent: column already present in prod. Fresh shadow DBs will
-- create it new.

-- Up migration

ALTER TABLE app_rg_play_states
  ADD COLUMN IF NOT EXISTS games_played_in_session INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN app_rg_play_states.games_played_in_session IS
  'Counter of games played in the current session. Used by ComplianceManager (audit-tracked) for §66 mandatory-pause logic. Codified by 20261201000000 after schema-archaeology found the column existed in prod without a migration.';
