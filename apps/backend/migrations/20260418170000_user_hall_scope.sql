-- BIN-591: per-user hall scope for HALL_OPERATOR.
--
-- HALL_OPERATOR is a role tied to a single hall (eller null for
-- «uassigned»). ADMIN/SUPPORT/PLAYER har alltid NULL — de er ikke
-- hall-begrenset. En HALL_OPERATOR med NULL hall_id har ingen
-- write-tilgang til hall-scoped ressurser (fail closed).
--
-- Up
ALTER TABLE app_users
  ADD COLUMN hall_id TEXT NULL REFERENCES app_halls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_users_hall_id
  ON app_users(hall_id) WHERE hall_id IS NOT NULL;

COMMENT ON COLUMN app_users.hall_id IS
  'BIN-591: HALL_OPERATOR scope — null for ADMIN/SUPPORT/PLAYER og unassigned operators.';
