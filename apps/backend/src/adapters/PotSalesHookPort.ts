/**
 * PR-T3 Spor 4: PotSalesHookPort — narrow port for pot-akkumulering fra salg.
 *
 * Brukt av Game1TicketPurchaseService etter vellykket wallet-debit + INSERT
 * for å triggere `Game1PotService.onSaleCompleted({ hallId, saleAmountCents })`.
 * Samme design som W5 ComplianceLossPort:
 *
 *   - Narrow port (kun `onSaleCompleted`) så service-laget ikke tar direkte
 *     avhengighet til Game1PotService-klassen (engine-core / pot-service-core
 *     separasjon, matcher LoyaltyPointsHookPort og ComplianceLossPort).
 *   - Default no-op-implementasjon tillater tester som ikke verifiserer pot-
 *     flyten å slippe mock av pot-service.
 *   - Soft-fail-semantikken (fire-and-forget + pino-warning) matcher W5-
 *     patternet: en pot-akkumuleringsfeil skal ALDRI rulle tilbake purchase-
 *     flyten. Wallet-debit + INSERT er allerede committed; pot-akkumulering
 *     er audit-logg-liknende akkumulering som kan re-kjøres manuelt ved behov.
 *
 * Regulatorisk:
 *   - Pot-akkumulering er ikke en utbetaling eller loss-ledger-entry — det er
 *     intern tilstand som tracker andel-av-salg. Derfor ingen separate
 *     regulatoriske krav utover at akkumuleringen er sporbart i
 *     `app_game1_pot_events` (T1-tabell).
 *
 * Wiring:
 *   - BingoEngine eksponerer `getPotSalesHookPort(potService)` som wrapper
 *     Game1PotService og dispatcher til alle aktive pot-er for hallen.
 *   - index.ts passerer porten inn i Game1TicketPurchaseService-konstruktøren.
 *   - Tester kan mocke porten eller bruke `NoopPotSalesHook`.
 *
 * Se docs/architecture/SPILL1_FULL_VARIANT_CATALOG_2026-04-21.md §Innsatsen.
 */

export interface PotSalesHookPort {
  /**
   * Signalér at et billett-kjøp er fullført for en hall. Implementasjonen
   * itererer aktive pot-er og akkumulerer sin andel basert på salg-bps.
   *
   * @param params.hallId Hall som kjøpet tilhører.
   * @param params.saleAmountCents Total-beløpet for kjøpet i øre (før rabatt).
   */
  onSaleCompleted(params: {
    hallId: string;
    saleAmountCents: number;
  }): Promise<void>;
}

/**
 * Default no-op-implementasjon. Brukt i miljøer uten pot-service wiret opp
 * (test-scenarier, legacy-miljøer) så Game1TicketPurchaseService fortsatt
 * fungerer uten pot-integrasjon.
 */
export class NoopPotSalesHook implements PotSalesHookPort {
  async onSaleCompleted(): Promise<void> {
    /* no-op */
  }
}
