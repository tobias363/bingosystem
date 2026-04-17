-- BIN-503: DB-backed TV-display tokens per hall.
--
-- Supersedes the env-var-only `HALL_DISPLAY_TOKEN_<SLUG>` scheme shipped
-- with BIN-498. Tokens are now rotated per-hall via the admin UI without
-- redeploying the backend. Storage is hash-only (sha256) — the plaintext
-- is shown once at creation and never read back.
--
-- Each hall can have multiple active tokens (e.g. one per TV-kiosk) so
-- the ops team can rotate one kiosk's token without kicking the others.
--
-- Up
CREATE TABLE IF NOT EXISTS app_hall_display_tokens (
  id            UUID PRIMARY KEY,
  hall_id       UUID NOT NULL REFERENCES app_halls(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT '',
  token_hash    TEXT NOT NULL UNIQUE,
  created_by    UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_hall_display_tokens_hall
  ON app_hall_display_tokens (hall_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_hall_display_tokens_hash_active
  ON app_hall_display_tokens (token_hash)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE  app_hall_display_tokens IS
  'BIN-503: rotated display tokens for hall TV-kiosks. Plaintext never stored.';
COMMENT ON COLUMN app_hall_display_tokens.token_hash IS
  'sha256 hex of the raw token. Raw token is shown once at creation.';
COMMENT ON COLUMN app_hall_display_tokens.last_used_at IS
  'Updated on successful admin-display:login — diagnostic only, no security semantics.';
