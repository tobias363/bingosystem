-- Game1 mini-game round-robin: persist last triggered type per scheduled-game.
--
-- Bakgrunn: Game1MiniGameOrchestrator.maybeTriggerFor valgte tidligere alltid
-- activeTypes[0] (M1-stub), slik at samme mini-game (første i config-listen)
-- ble trigget hver eneste BINGO-win i samme spill. Canonical spec
-- (docs/engineering/game1-canonical-spec.md §miniGameRotation) sier at
-- mini-games skal rotere round-robin: wheel → chest → oddsen → colordraft → wheel.
--
-- For å implementere round-robin må orchestrator kunne huske hvilken type som
-- ble brukt sist for et gitt scheduled-game, slik at neste vinner får neste
-- type i rotasjonen. Vi persisterer dette på selve scheduled-game-raden så
-- state overlever server-restart.
--
-- Designvalg:
--   * Lagrer som NULLable TEXT med samme CHECK-liste som
--     app_game1_mini_game_results.mini_game_type. NULL = ingen mini-game
--     trigget enda (start på rotasjonen → velg activeTypes[0]).
--   * Kunne vært beregnet fra app_game1_mini_game_results MAX(triggered_at),
--     men eksplisitt kolonne er enklere å lese, krever ingen extra index,
--     og lar oss reset-e rotasjonen ved behov uten å slette historikk.
--
-- Forward-only (BIN-661): ingen Down-seksjon.
--
-- Up migration

ALTER TABLE app_game1_scheduled_games
  ADD COLUMN IF NOT EXISTS last_minigame_type TEXT NULL
    CHECK (last_minigame_type IS NULL OR last_minigame_type IN (
      'wheel',
      'chest',
      'colordraft',
      'oddsen'
    ));

COMMENT ON COLUMN app_game1_scheduled_games.last_minigame_type IS
  'Round-robin-state for mini-game-rotasjon: typen som ble trigget sist for dette spillet. NULL = ingen mini-game trigget enda. Orchestrator velger activeTypes[(idx_of(last)+1) % N], faller tilbake til activeTypes[0] hvis last ikke lenger er aktiv.';
