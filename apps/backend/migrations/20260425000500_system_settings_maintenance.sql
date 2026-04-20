-- BIN-677: System settings + maintenance-vinduer.
--
-- To separate tabeller:
--   app_system_settings     — key-value store for system-wide config (feks
--                             timezone, locale, version-refs, compliance-tak).
--   app_maintenance_windows — planlagte maintenance-vinduer (start/slutt/
--                             status/message). Ett vindu kan være aktivt av
--                             gangen; toggling gjøres via PUT.
--
-- Design-valg — system settings:
--   Key-value med JSONB value i stedet for strukturert tabell fordi legacy
--   `setting`-modell (Mongo) har ~25 fri-form felter (ios_version,
--   daily_spending, android_store_link, systemInformationData, ...) som
--   vokser over tid. Å normalisere hvert felt som kolonne ville kreve en
--   ny migration per nytt felt. JSONB-value lar service-laget typesjekke
--   per definert key (via registry) og admin-UI round-trippe uten data-tap.
--
--   Hver nøkkel har:
--     - `key` : stabil slug (TEXT PRIMARY KEY, feks "system.timezone")
--     - `value_json` : faktisk verdi (string/number/boolean/object) lagret
--                       som JSONB slik at vi bevarer typen.
--     - `category` : gruppering for admin-UI (f.eks. "general", "compliance",
--                    "app_versions", "branding"). Valgfritt.
--     - `description` : menneskelig beskrivelse (tom streng hvis ukjent).
--     - `updated_by_user_id` : hvem som sist rørte nøkkelen.
--     - `updated_at` : når.
--
--   Service-laget validerer type mot et seed/registry — ukjente nøkler
--   lagres ikke (fail-closed). Liste av kjente nøkler dokumenteres i
--   SettingsService.ts.
--
-- Design-valg — maintenance:
--   En rad per vindu (historikk beholdes). `status='active'` = vinduet er i
--   kraft NÅ; aktiv-invariant (kun ett samtidig aktivt vindu) håndheves i
--   service-laget fordi vi ikke kan lage en partial unique index på
--   `WHERE status='active'` uten at deaktivering blir klønete. Legacy hadde
--   det samme mønsteret (settings.maintenance overskrev seg selv); vi
--   moderniserer til separat tabell for audit/historikk.
--
--   `show_before_minutes` = minutter før start hvor UI skal vise banner.
--   `message` = fri-form tekst (vises til spillere). Default på norsk.
--
-- Forward-only (BIN-661): ingen Down-seksjon.
--
-- Legacy-opphav:
--   legacy/unity-backend/App/Models/setting.js
--   legacy/unity-backend/App/Controllers/SettingsController.js
--     - settings / settingsUpdate / settingsAdd  -> app_system_settings
--     - maintenance / editMaintenance / updateMaintenance -> app_maintenance_windows

-- ── System settings (key-value) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_system_settings (
  key                 TEXT PRIMARY KEY,
  -- Faktisk verdi — JSONB for å bevare type. Eksempler:
  --   "Europe/Oslo"     (string)
  --   42                 (number)
  --   true              (boolean)
  --   {"enabled":true}  (object — brukes av feature-flags/branding-refs)
  value_json          JSONB NOT NULL DEFAULT 'null'::jsonb,
  -- Logisk gruppering for admin-UI. Fri-form slug, ikke foreign key.
  category            TEXT NOT NULL DEFAULT 'general',
  -- Menneskelig beskrivelse (vises i admin-UI).
  description         TEXT NOT NULL DEFAULT '',
  updated_by_user_id  TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_system_settings_category
  ON app_system_settings(category);

COMMENT ON TABLE app_system_settings IS
  'BIN-677: key-value store for system-wide config. Nøkler validerer mot service-registry (SettingsService.SYSTEM_SETTING_REGISTRY). JSONB value bevarer type.';

COMMENT ON COLUMN app_system_settings.key IS
  'BIN-677: stabil slug (feks "system.timezone", "app.android_version"). Mønster: <category>.<name>.';

COMMENT ON COLUMN app_system_settings.value_json IS
  'BIN-677: verdi som JSONB. Type valideres av service-laget mot registry-definisjon.';

COMMENT ON COLUMN app_system_settings.category IS
  'BIN-677: admin-UI gruppering. Ingen FK — fri-form slug som speiler SYSTEM_SETTING_REGISTRY-kategoriene.';

-- ── Maintenance windows ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_maintenance_windows (
  id                  TEXT PRIMARY KEY,
  -- Planlagt start + slutt (TIMESTAMPTZ for TZ-korrekt UI-formatering).
  -- `status='active'` => vinduet regnes som i kraft nå (matcher legacy
  -- `Sys.Setting.maintenance.status = 'active'` runtime-toggle).
  maintenance_start   TIMESTAMPTZ NOT NULL,
  maintenance_end     TIMESTAMPTZ NOT NULL,
  message             TEXT NOT NULL DEFAULT 'Systemet er under vedlikehold.',
  -- Minutter før start hvor banner skal vises. Matcher legacy
  -- showBeforeMinutes.
  show_before_minutes INTEGER NOT NULL DEFAULT 60 CHECK (show_before_minutes >= 0),
  status              TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active', 'inactive')),
  created_by_user_id  TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at        TIMESTAMPTZ NULL,
  deactivated_at      TIMESTAMPTZ NULL,
  CHECK (maintenance_end >= maintenance_start)
);

CREATE INDEX IF NOT EXISTS idx_app_maintenance_windows_status
  ON app_maintenance_windows(status);

CREATE INDEX IF NOT EXISTS idx_app_maintenance_windows_start
  ON app_maintenance_windows(maintenance_start DESC);

COMMENT ON TABLE app_maintenance_windows IS
  'BIN-677: planlagte maintenance-vinduer. En rad per vindu; historikk beholdes. Kun ett samtidig aktivt vindu (håndheves i MaintenanceService).';

COMMENT ON COLUMN app_maintenance_windows.status IS
  'BIN-677: ''active'' = vinduet er i kraft NÅ; ''inactive'' = planlagt/avsluttet. Toggles via PUT /api/admin/maintenance/:id.';

COMMENT ON COLUMN app_maintenance_windows.show_before_minutes IS
  'BIN-677: minutter før maintenance_start hvor UI skal vise banner. Matches legacy showBeforeMinutes.';
