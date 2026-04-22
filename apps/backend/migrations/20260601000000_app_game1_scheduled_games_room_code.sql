-- GAME1_SCHEDULE PR 4d.1: room_code-mapping for app_game1_scheduled_games.
--
-- Spec: docs/architecture/GAME1_PR4D_SOCKET_REALTIME_DESIGN_2026-04-21.md §3.2
--
-- Formål: persistent 1:1-mapping mellom scheduled_game_id og BingoEngine
-- room_code. Nødvendig for at `game1:join-scheduled`-handler (kommer i
-- 4d.2) skal kunne slå opp riktig bingo-rom for en spiller som joiner en
-- schedulert økt via scheduledGameId — og for crash recovery der engine
-- må rebinde state etter restart.
--
-- Designvalg:
--   * NULL tillatt: historiske rader (completed/cancelled) får aldri
--     room_code bakoverkompatibelt. Nye rader er NULL frem til første
--     spiller joiner, da setter 4d.2-handler kolonnen atomisk.
--   * UNIQUE via partial index WHERE room_code IS NOT NULL: hindrer
--     dobbel-binding uten å regne NULL som duplikat.
--
-- Forward-only (BIN-661): ingen Down-seksjon.
--
-- Up

ALTER TABLE app_game1_scheduled_games
  ADD COLUMN IF NOT EXISTS room_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_game1_scheduled_games_room_code
  ON app_game1_scheduled_games (room_code)
  WHERE room_code IS NOT NULL;
