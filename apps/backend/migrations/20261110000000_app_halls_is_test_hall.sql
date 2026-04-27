-- Demo Hall test-hall bypass: legg til `is_test_hall` BOOLEAN på app_halls.
--
-- Bakgrunn (Tobias 2026-04-27):
-- Demo Hall (lokal testing) blir blokkert i begge Spill 1-engines når første
-- pattern (Rad 1) treffes:
--   * Game1DrawEngineService (scheduled-flow) auto-pauser engine på phase-won.
--     Master må trykke "Resume" eksplisitt for hver fase. Brukbart i prod, men
--     ineffektivt for runtime-testing der vi vil se rundt-end-to-end.
--   * BingoEngine (legacy/ad-hoc-flow) avslutter spillet på Fullt Hus-fasen.
--     For testing vil vi heller ha at runden går videre til MAX_DRAWS slik at
--     vi får verifisert mini-game-rotasjon, jackpot-oppførsel, og bong-evaluering
--     gjennom hele draw-bag-en.
--
-- Strategi:
-- En per-hall `is_test_hall` BOOLEAN flagg er enklere enn env-var-driftet
-- hardkoding (bedre revisjonsspor + admin kan toggle senere). Default FALSE
-- så ingen produksjons-haller berøres. Migrasjonen merker eksisterende
-- "Demo Hall*"-rader som test-haller (case-insensitive prefix-match), slik
-- at lokal/test-bruk virker umiddelbart etter deploy uten manuell SQL.
--
-- Engine-bruk:
--   * `Game1DrawEngineService.drawNext` slår av auto-pause-trigger når master-
--     hallen er test-hall (engine fortsetter draws gjennom alle faser).
--   * `BingoEnginePatternEval.evaluateActivePhase/evaluateConcurrentPatterns`
--     skipper `game.status = "ENDED"`-overgangen når room.isTestHall === true.
--     MAX_DRAWS_REACHED + DRAW_BAG_EMPTY-stier i drawNextNumber er uberørt —
--     runden ender uansett når draw-bag er tom (regulatorisk forsvarlig:
--     test-flagg påvirker kun pause/end-på-pattern, ikke ball-uttrekk).
--
-- Forward-only (BIN-661): ingen Down-seksjon.
--
-- Up migration

ALTER TABLE app_halls
  ADD COLUMN IF NOT EXISTS is_test_hall BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN app_halls.is_test_hall IS
  'Hvis TRUE bypasser Spill 1-engines (BingoEngine + Game1DrawEngineService) "stop on first pattern" og lar runden fortsette til MAX_DRAWS_REACHED. Kun for lokal testing og demo-haller. MAX_DRAWS-grensen håndheves uansett — flagget påvirker ikke ball-uttrekk eller wallet-payout, kun pause/end-on-pattern-flyt.';

-- Merk eksisterende Demo Hall-rader som test-haller (case-insensitive
-- prefix-match). Idempotent: nye Demo Hall-rader må enten merkes manuelt
-- eller via admin-UI (kommer i senere PR).
UPDATE app_halls
   SET is_test_hall = TRUE
 WHERE LOWER(name) LIKE 'demo hall%'
   AND is_test_hall = FALSE;
