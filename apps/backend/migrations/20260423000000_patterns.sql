-- BIN-627: Pattern CRUD (admin-katalog av bingo-mønstre).
--
-- Pattern = en 25-bit bitmask (5x5 grid) som Game 3 (Mønsterbingo) og Game
-- 1 (klassisk bingo) bruker til å avgjøre når en billett har «bingo». Samme
-- type (`PatternMask`) som PatternMatcher + PatternCycler i backend og
-- patternManagement-editor i admin-web benytter (packages/shared-types).
--
-- Legacy-opphav:
--   legacy/unity-backend/App/Models/pattern.js           (Mongo-schema)
--   legacy/unity-backend/App/Controllers/patternController.js
--     - viewPatternMenu                (ca. linje 6)   → dynamic-menu
--     - viewGamePatternList            (ca. linje 37)  → liste
--     - getPatternDetailList           (ca. linje 157) → DataTable
--     - addPattern / addPatternPostData                → POST
--     - editPattern / editPatternPostData              → PATCH
--     - deletePattern                                   → DELETE
--
-- Legacy-feltet `patternType` er en streng av 0/1-verdier adskilt med
-- `.` (rad) og `,` (celle). Vi normaliserer det til et 25-bit integer
-- (`mask` kolonnen) så backend-PatternMatcher slipper å parse strenger.
-- Legacy-strengen beholdes ikke lenger — admin-UI bruker maskToLegacyGrid()
-- til rendering og sender mask som integer på wire.
--
-- Felter:
--   - `game_type_id`: FK-tekst til GameType (BIN-620) — samme slug-format
--     som app_game_management.game_type_id (f.eks. "game_1", "game_3").
--   - `pattern_number`: legacy auto-increment nummer (vist i admin-UI-liste).
--     Auto-genereres basert på eksisterende rader for gameType.
--   - `name`: user-facing mønster-navn (unikt per gameType via partial index).
--   - `mask`: 25-bit bitmask, 0 ≤ mask < 2^25 (33554432).
--   - `claim_type`: 'LINE' eller 'BINGO' (se shared-types/game.ts).
--   - `prize_percent`: andel av prize-pool (0..100).
--   - `order_index`: sekvens-rekkefølge innen gameType.
--   - `design`: UI-design-id (1 = row, 2 = full-house, 0 = custom).
--   - Game-1-ekstra-flagg (legacy): is_wof, is_tchest, is_mys, is_row_pr,
--     row_percentage, is_jackpot, is_game_type_extra, is_lucky_bonus.
--   - `extra_json`: fri-form fallback for felter som ikke har egen kolonne.
--
-- Soft-delete: `deleted_at` + status = 'inactive'. Hard-delete blokkeres når
-- mønsteret er referert av app_game_management.config_json eller
-- app_daily_schedules.subgames_json (service-laget sjekker på load).
--
-- Up

CREATE TABLE IF NOT EXISTS app_patterns (
  id                  TEXT PRIMARY KEY,
  -- GameType er ikke egen tabell ennå (BIN-620). Vi lagrer FK som slug-
  -- string (samme format som app_game_management.game_type_id).
  game_type_id        TEXT NOT NULL,
  game_name           TEXT NOT NULL,
  pattern_number      TEXT NOT NULL,
  name                TEXT NOT NULL,
  -- 25-bit bitmask (5x5). CHECK sikrer at det ikke lagres ugyldige verdier.
  mask                INTEGER NOT NULL
                        CHECK (mask >= 0 AND mask < 33554432),
  claim_type          TEXT NOT NULL DEFAULT 'BINGO'
                        CHECK (claim_type IN ('LINE', 'BINGO')),
  prize_percent       NUMERIC(6,3) NOT NULL DEFAULT 0
                        CHECK (prize_percent >= 0 AND prize_percent <= 100),
  order_index         INTEGER NOT NULL DEFAULT 0
                        CHECK (order_index >= 0),
  -- UI-design: 1=row, 2=full-house, 0=custom (matches shared-types
  -- PatternDefinition.design i game.ts).
  design              INTEGER NOT NULL DEFAULT 0
                        CHECK (design >= 0),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive')),
  -- Legacy Game 1-ekstra-flagg. Valgfrie; default false.
  is_wof              BOOLEAN NOT NULL DEFAULT false,
  is_tchest           BOOLEAN NOT NULL DEFAULT false,
  is_mys              BOOLEAN NOT NULL DEFAULT false,
  is_row_pr           BOOLEAN NOT NULL DEFAULT false,
  row_percentage      NUMERIC(6,3) NOT NULL DEFAULT 0
                        CHECK (row_percentage >= 0),
  is_jackpot          BOOLEAN NOT NULL DEFAULT false,
  is_game_type_extra  BOOLEAN NOT NULL DEFAULT false,
  is_lucky_bonus      BOOLEAN NOT NULL DEFAULT false,
  -- Pattern-place (legacy "place"-felt for Game 3/4 — hvilken nummer-range
  -- mønsteret er gyldig for, f.eks. "1-15", "16-30"). Nullable.
  pattern_place       TEXT NULL,
  -- Fri-form fallback for felter som ikke har egen kolonne (legacy:
  -- gameOnePatternType-array, patType-slug, osv.). Normaliseres ikke —
  -- beholdes som JSON slik at admin-UI kan rundturere data uten tap.
  extra_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_app_patterns_game_type
  ON app_patterns(game_type_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_patterns_status
  ON app_patterns(status)
  WHERE deleted_at IS NULL;

-- Unikt navn per gameType — partial index slik at soft-slettede rader ikke
-- okkuperer navnet. Admin-UI bruker dette for å duplikat-sjekke.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_patterns_name_per_game_type
  ON app_patterns(game_type_id, name)
  WHERE deleted_at IS NULL;

-- Dynamic-menu-sortering: hent mønstre ordnet etter order_index innen gameType.
CREATE INDEX IF NOT EXISTS idx_app_patterns_order
  ON app_patterns(game_type_id, order_index)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE app_patterns IS
  'BIN-627: admin-konfigurerte bingo-mønstre (25-bit bitmask). Erstatter legacy Mongo-schema pattern. Brukes av Game 1 + Game 3 engine via mask-feltet.';

COMMENT ON COLUMN app_patterns.mask IS
  'BIN-627: 25-bit bitmask (5x5 grid, row*5+col). 0 ≤ mask < 2^25. Samme format som shared-types PatternMask.';

COMMENT ON COLUMN app_patterns.extra_json IS
  'BIN-627: fri-form fallback for legacy-felter (gameOnePatternType, patType, o.l.). Strammes inn når BIN-620/621 lander.';

COMMENT ON COLUMN app_patterns.design IS
  'BIN-627: UI-design-id. 1=row, 2=full-house, 0=custom. Matches shared-types PatternDefinition.design.';
