/**
 * PR-W5 wallet-split: ComplianceLossPort.
 *
 * Brukt av Game1TicketPurchaseService for å logge `type:"BUYIN"`-entries til
 * ComplianceManager ved ticket-purchase. Matcher kontrakten til
 * `ComplianceManager.recordLossEntry(walletId, hallId, entry)`, men er en
 * narrow port slik at service-laget ikke trenger avhengighet til hele
 * ComplianceManager-klassen (engine-core vs. service-core separasjon, jf.
 * LoyaltyPointsHookPort).
 *
 * Hvorfor port + adapter (ikke direkte import { ComplianceManager }):
 *   - ComplianceManager eies av BingoEngine (protected readonly) — det er ikke
 *     et singleton som index.ts instansierer direkte.
 *   - Game1TicketPurchaseService er service-laget; det skal ikke måtte
 *     konstruere eller direkte referere BingoEngine.compliance.
 *   - Default no-op-implementasjon tillater tests som ikke trenger å
 *     verifisere compliance-logging å slippe ComplianceManager-mock.
 *   - Soft-fail-semantikken (fire-and-forget + pino-warning) matcher
 *     BingoEngine.buyIn-patternet: en compliance-feil skal aldri rulle
 *     tilbake purchase-flyt.
 *
 * Regulatorisk:
 *   - amount = `fromDepositCents / 100` (kun deposit-delen av trekket).
 *   - type: "BUYIN" → brukes av `calculateNetLoss` som +amount mot daglig/
 *     månedlig tapsgrense per §11 pengespillforskriften.
 *   - 100% winnings-kjøp → `amount === 0` → port kalles IKKE (caller skip).
 *
 * Referanser:
 *   - docs/architecture/WALLET_SPLIT_DESIGN_2026-04-22.md §3.4
 *   - apps/backend/src/game/ComplianceManager.ts:554 (recordLossEntry)
 *   - apps/backend/src/game/BingoEngine.ts:693 (buyIn-kallstedet)
 */

export interface ComplianceLossEntry {
  type: "BUYIN" | "PAYOUT";
  /** Beløp i kroner (ikke øre). Samme kontrakt som ComplianceManager.LossLedgerEntry. */
  amount: number;
  createdAtMs: number;
}

/**
 * Fire-and-forget. Implementasjonen skal aldri kaste — Game1TicketPurchaseService
 * fanger opp uansett og logger pino-warning, men konvensjonen er at porten
 * returnerer stille.
 */
export interface ComplianceLossPort {
  /**
   * Logg et loss-ledger-entry for en spiller i en hall.
   *
   * @param walletId Spillerens wallet-id.
   * @param hallId Hallen entry-et tilhører. Tomme strenger no-op-es.
   * @param entry type + amount + createdAtMs.
   */
  recordLossEntry(
    walletId: string,
    hallId: string,
    entry: ComplianceLossEntry,
  ): Promise<void>;
}

/**
 * Default no-op. Brukes i unit-tester som ikke verifiserer compliance-logging
 * og i environment-er uten ComplianceManager wiret (bør være ingen i prod).
 */
export class NoopComplianceLossPort implements ComplianceLossPort {
  async recordLossEntry(
    _walletId: string,
    _hallId: string,
    _entry: ComplianceLossEntry,
  ): Promise<void> {
    /* no-op */
  }
}
