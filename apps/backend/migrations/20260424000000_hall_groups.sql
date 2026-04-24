-- BIN-665: HallGroup CRUD (admin-katalog av hall-grupper).
--
-- GroupHall = en navngitt gruppering av haller som Game 2 + Game 3 bruker
-- for cross-hall-spill (samme draw-stream mot flere fysiske haller). Legacy
-- Mongo-schemaet `GroupHall` hadde `halls: [{id, name, status}]` embedded
-- array — vi normaliserer det til en egen `app_hall_group_members`-tabell
-- slik at FK til `app_halls` kan håndheves.
--
-- Legacy-opphav:
--   legacy/unity-backend/App/Controllers/groupHallController.js
--     - groupHallView              → liste-side
--     - getGroupHall                → DataTable API
--     - addGroupHall / addGroupHallPostData → POST
--     - editGroupHall / editGroupHallPostData → PATCH
--     - getGroupHallDelete          → DELETE (sjekket aktive/upcoming games)
--     - getAvailableGroupHalls      → filtrert liste per gameType+tidsrom
--
-- Legacy-felt bevart: `legacy_group_hall_id` (GH_<timestamp>-formatet) og
-- `tv_id` (TV-skjerm-ID) — sistnevnte brukes av hall-TV-endpoint, se BIN-617.
--
-- Delete-policy (matches service-laget):
--   - Soft-delete default (sett deleted_at).
--   - Hard-delete blokkeres hvis gruppen er referert fra:
--       - `app_daily_schedules.groupHallIds` (JSON array)
--       - `app_game_management.config_json` (potensielt)
--   - Med soft-delete: medlemsskap bevares (arkiv-sporbarhet) men gruppen
--     er usynlig i default-list og får status 'inactive'.
--
-- Up

-- NB: `app_hall_groups` ble først opprettet av migrasjon
-- 20260416000001_multi_hall_linked_draws.sql (BIN-515) med et MINDRE skjema
-- (id, name, public_code, tv_broadcast_id, status, created_at, archived_at,
-- updated_at). BIN-665 utvider tabellen til full HallGroup-katalog. Siden
-- `CREATE TABLE IF NOT EXISTS` skip-er tabellen hvis den finnes, må vi gjøre
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for de nye kolonnene slik at
-- migrasjonen er idempotent uavhengig av kjøre-rekkefølge (fresh DB vs.
-- DB hvor BIN-515 har kjørt først). BIN-665's `deleted_at` er kanonisk
-- soft-delete-markør (service-laget leser kun denne — `archived_at` fra
-- BIN-515 beholdes som ubrukt kolonne for backward-compat).
CREATE TABLE IF NOT EXISTS app_hall_groups (
  id                  TEXT PRIMARY KEY,
  -- Legacy-format (f.eks. "GH_20220919_032458") — bevart for bakover-
  -- kompatibilitet med daily_schedules.groupHallIds som kan referere
  -- både ny UUID-id og gamle GH_ -id-strenger.
  legacy_group_hall_id TEXT NULL,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive')),
  -- TV-skjerm-ID (numerisk) — brukes av hall-TV-streaming, se BIN-617.
  tv_id               INTEGER NULL,
  -- Produkter knyttet til gruppen (legacy GroupHall.products-array av
  -- product-ids). Bevart som JSON inntil BIN-620 normaliserer produkter.
  products_json       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Fri-form fallback for legacy-felter som ikke har egen kolonne.
  extra_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ NULL
);

-- Idempotent kolonne-tillegg hvis tabellen allerede fantes fra BIN-515.
-- (Ingen DEFAULT-verdier som endrer eksisterende rader — BIN-515 la ikke
-- inn data, så dette er trygt.)
ALTER TABLE app_hall_groups
  ADD COLUMN IF NOT EXISTS legacy_group_hall_id TEXT NULL;
ALTER TABLE app_hall_groups
  ADD COLUMN IF NOT EXISTS tv_id INTEGER NULL;
ALTER TABLE app_hall_groups
  ADD COLUMN IF NOT EXISTS products_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE app_hall_groups
  ADD COLUMN IF NOT EXISTS extra_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app_hall_groups
  ADD COLUMN IF NOT EXISTS created_by TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE app_hall_groups
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE app_hall_groups
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Harmoniser status CHECK + default hvis BIN-515 ran først. BIN-515 brukte
-- store bokstaver ('ACTIVE'/'ARCHIVED') mens HallGroupService.ts (BIN-665)
-- bruker 'active'/'inactive'. Lower-case er kanonisk — drop gammel CHECK
-- og sett riktig default. Eventuelle rader med 'ACTIVE' konverteres til
-- 'active' før vi legger tilbake CHECK-constraint.
ALTER TABLE app_hall_groups
  DROP CONSTRAINT IF EXISTS app_hall_groups_status_check;
UPDATE app_hall_groups SET status = 'active'   WHERE status = 'ACTIVE';
UPDATE app_hall_groups SET status = 'inactive' WHERE status = 'ARCHIVED';
ALTER TABLE app_hall_groups
  ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE app_hall_groups
  ADD CONSTRAINT app_hall_groups_status_check
  CHECK (status IN ('active', 'inactive'));

-- BIN-515 la til `public_code TEXT UNIQUE NOT NULL` som HallGroupService
-- (BIN-665) ikke skriver til. Drop NOT NULL slik at INSERT via service-laget
-- ikke feiler. Kolonnen beholdes for backward-compat (ingen kode leser
-- den i dag). Samme for tv_broadcast_id som har UNIQUE constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_hall_groups' AND column_name = 'public_code'
  ) THEN
    EXECUTE 'ALTER TABLE app_hall_groups ALTER COLUMN public_code DROP NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_hall_groups_status
  ON app_hall_groups(status)
  WHERE deleted_at IS NULL;

-- Unikt navn — partial index slik at soft-slettede grupper ikke okkuperer
-- navnet. Legacy-koden sjekket duplikat-navn før insert, så dette er trygt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_hall_groups_name
  ON app_hall_groups(name)
  WHERE deleted_at IS NULL;

-- Unikt legacy-id hvis satt — for re-importerte rader.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_hall_groups_legacy_id
  ON app_hall_groups(legacy_group_hall_id)
  WHERE legacy_group_hall_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE app_hall_groups IS
  'BIN-665: admin-konfigurerte hall-grupper (cross-hall spill). Erstatter legacy Mongo-schema GroupHall.';

COMMENT ON COLUMN app_hall_groups.legacy_group_hall_id IS
  'BIN-665: legacy-format (GH_<timestamp>). Bevart for daily_schedules.groupHallIds bakover-kompatibilitet.';

COMMENT ON COLUMN app_hall_groups.tv_id IS
  'BIN-665: TV-skjerm-ID (numerisk) — brukes av hall-TV-streaming. Legacy goh.tvId.';

-- Member-tabell: many-to-many mellom hall_groups og halls. FK til app_halls
-- håndheves — sletting av en hall setter ON DELETE CASCADE for å rydde opp
-- gruppe-medlemskapet automatisk. (Hall-delete er sjelden og blokkeres når
-- det er aktive shifts/tickets — se BIN-663 hall-service.)

CREATE TABLE IF NOT EXISTS app_hall_group_members (
  group_id            TEXT NOT NULL REFERENCES app_hall_groups(id) ON DELETE CASCADE,
  hall_id             TEXT NOT NULL REFERENCES app_halls(id) ON DELETE CASCADE,
  added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, hall_id)
);

CREATE INDEX IF NOT EXISTS idx_app_hall_group_members_hall
  ON app_hall_group_members(hall_id);

CREATE INDEX IF NOT EXISTS idx_app_hall_group_members_group
  ON app_hall_group_members(group_id);

COMMENT ON TABLE app_hall_group_members IS
  'BIN-665: many-to-many mellom hall_groups og halls. FK til app_halls. Legacy GroupHall.halls array normalisert.';
