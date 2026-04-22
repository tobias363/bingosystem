-- PT5: Utvidelser av `app_agent_ticket_ranges` for vakt-skift (handover) +
-- range-påfylling (extend).
--
-- Spec: docs/architecture/PHYSICAL_TICKETS_FINAL_SPEC_2026-04-22.md
--       (§ "Fase 7: Handover (vakt-skift)", linje 157-191)
--       (§ "Fase 8: Range-påfylling",       linje 193-216)
--
-- Bakgrunn:
--   PT2 (migrasjon 20260607000000) la til `handover_from_range_id` som peker
--   fra NY range → avtroppende range ved handover. PT5 legger til speiling på
--   avtroppende side (`handed_off_to_range_id`) slik at audit-trailen er
--   bi-direksjonell: gitt en gammel range kan vi finne hvem som tok over,
--   uten å scanne hele tabellen.
--
-- Designvalg:
--   * NULLABLE (ikke NOT NULL): første gang en range lukkes uten handover
--     (vakt-slutt uten overlevering) er denne kolonnen fortsatt NULL. Bare
--     satt hvis bingovertens range ble overført til ny vakt.
--   * `ON DELETE SET NULL`: hvis den nye rangen slettes (skulle ikke skje,
--     men defensivt), beholder vi lukket-rad uten å miste rad.
--   * Ingen CHECK-constraint mellom `closed_at` og `handed_off_to_range_id`:
--     `closed_at` settes uansett ved handover ELLER vakt-slutt. Å koble dem
--     ville gjort CHECK for restriktiv — audit-trailen er presis nok via
--     `physical_ticket.range_handover`-eventen.
--
-- Forward-only (BIN-661): ingen Down-seksjon.

ALTER TABLE app_agent_ticket_ranges
  ADD COLUMN IF NOT EXISTS handed_off_to_range_id TEXT NULL
    REFERENCES app_agent_ticket_ranges(id) ON DELETE SET NULL;

COMMENT ON COLUMN app_agent_ticket_ranges.handed_off_to_range_id IS
  'PT5: peker på ny range som overtok ved vakt-skift (handover). Speiler handover_from_range_id bi-direksjonelt. NULL = rangen ble lukket uten handover (vakt-slutt).';

-- PT5 handover hot-path: "gitt avtroppende range, finn etterfølgeren".
-- Partial-indeks siden feltet er NULL for de fleste lukkede ranges.
CREATE INDEX IF NOT EXISTS idx_app_agent_ticket_ranges_handed_off_to
  ON app_agent_ticket_ranges (handed_off_to_range_id)
  WHERE handed_off_to_range_id IS NOT NULL;
