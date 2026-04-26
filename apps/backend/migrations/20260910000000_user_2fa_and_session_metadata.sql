-- REQ-129 + REQ-132: TOTP-basert 2FA og utvidet session-metadata.
--
-- Bakgrunn:
--   * REQ-129 (2FA / TOTP login) — TOTP-basert (Google Authenticator) two-
--     factor for spiller-login. Aktiveres via profile-side, kreves ved
--     hver login etter aktivering.
--   * REQ-132 (Session timeout + active sessions) — Spiller skal se
--     aktive sesjoner (device, login-tid, last-activity) og kunne logge
--     ut alle. 30-min inactivity-timeout.
--
-- Design-valg:
--   * Ny tabell `app_user_2fa` med PK = user_id (én 2FA-konfig per
--     bruker). secret_enc lagres som Base32-streng kryptert med
--     scrypt-envelope-format som matcher passwords (men separat hemmelig
--     pga ulik bruks-pattern). Backup-codes hashes i en JSONB-array
--     ([{ "h": "<sha256-hex>", "u": null|<iso-ts> }, ...]).
--   * `pending_secret` lagres når bruker initierer setup men ikke har
--     verifisert ennå. Settes til NULL når enabled_at er populert.
--   * `app_sessions` utvides med `device_user_agent`, `ip_address`,
--     `last_activity_at`. Vi setter NOT NULL DEFAULT now() på
--     last_activity_at (gjelder også eksisterende rader).

-- Up migration

-- ── REQ-129: 2FA-tabell ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_user_2fa (
  user_id          TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  pending_secret   TEXT NULL,
  enabled_secret   TEXT NULL,
  enabled_at       TIMESTAMPTZ NULL,
  backup_codes     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_user_2fa IS
  'TOTP-basert 2FA per bruker (REQ-129). Én rad per user_id.';
COMMENT ON COLUMN app_user_2fa.pending_secret IS
  'Base32-secret for setup-flyt. NULL når 2FA er enabled (verifyAndEnable konsumerer pending_secret og kopierer til enabled_secret).';
COMMENT ON COLUMN app_user_2fa.enabled_secret IS
  'Base32-secret som brukes ved login når 2FA er aktivert. NULL betyr ikke-aktivert.';
COMMENT ON COLUMN app_user_2fa.enabled_at IS
  'Tidspunkt 2FA ble aktivert. NULL = ikke aktivert. Settes når verifyAndEnable kalles.';
COMMENT ON COLUMN app_user_2fa.backup_codes IS
  'JSONB-array av backup-koder: [{ "h": "<sha256-hex>", "u": null | "<iso-ts>" }]. h = hash, u = used_at.';

CREATE OR REPLACE FUNCTION app_user_2fa_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_user_2fa_updated_at ON app_user_2fa;

CREATE TRIGGER trg_app_user_2fa_updated_at
  BEFORE UPDATE ON app_user_2fa
  FOR EACH ROW
  EXECUTE FUNCTION app_user_2fa_set_updated_at();

-- ── REQ-129: 2FA-challenge-tabell ──────────────────────────────────────
-- Mellomtilstand mellom email+password og TOTP-kode. Klient får
-- challenge_id ved login når 2FA er aktivert, og POSTer challenge_id +
-- TOTP-kode til /api/auth/2fa/login. Challenges lever maks 5 min.

CREATE TABLE IF NOT EXISTS app_user_2fa_challenges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_user_2fa_challenges IS
  '2FA-challenges: mellomtilstand mellom passord-validering og TOTP-kode. Lever 5 min.';

CREATE INDEX IF NOT EXISTS idx_app_user_2fa_challenges_user
  ON app_user_2fa_challenges (user_id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_app_user_2fa_challenges_expires
  ON app_user_2fa_challenges (expires_at) WHERE consumed_at IS NULL;

-- ── REQ-132: Session-utvidelse ─────────────────────────────────────────

ALTER TABLE app_sessions
  ADD COLUMN IF NOT EXISTS device_user_agent TEXT NULL,
  ADD COLUMN IF NOT EXISTS ip_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN app_sessions.device_user_agent IS
  'User-Agent fra klienten ved login. Trim til 500 tegn.';
COMMENT ON COLUMN app_sessions.ip_address IS
  'Klient-IP fra X-Forwarded-For eller req.ip ved login.';
COMMENT ON COLUMN app_sessions.last_activity_at IS
  'Tidspunkt sist autentisert request via dette tokenet. Brukes til 30-min inactivity-timeout.';

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_active
  ON app_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_app_sessions_last_activity
  ON app_sessions (last_activity_at) WHERE revoked_at IS NULL;
