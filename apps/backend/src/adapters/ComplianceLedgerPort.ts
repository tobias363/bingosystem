/**
 * K1 compliance-fix: ComplianceLedgerPort.
 *
 * Narrow port for å skrive STAKE/PRIZE-entries til ComplianceLedger fra
 * Game1-servicene (Game1TicketPurchaseService og Game1PayoutService) uten at
 * service-laget tar direkte avhengighet til ComplianceLedger-klassen som
 * eies av BingoEngine. Samme port-pattern som `ComplianceLossPort` og
 * `PotSalesHookPort`.
 *
 * Regulatorisk (pengespillforskriften §71):
 *   - Hver STAKE-entry MÅ bindes til hallen der kjøpet faktisk skjedde
 *     (NB: IKKE master-hallens house-account for multi-hall-runder).
 *   - Hver PRIZE-entry MÅ bindes til hallen der vinnerens bong ble solgt.
 *   - hallId brukes som `house-<hallId>-<gameType>-<channel>`-kjennetegn
 *     i compliance-rapporteringen.
 *
 * Bakgrunn — multi-hall-bug:
 *   Før K1 ble Game1 compliance-entries (ved fremtidig integrasjon) bundet
 *   til master-hallen uavhengig av hvor billetten ble solgt. Dette ga feil
 *   §71-rapport per hall for multi-hall-runder. K1-fix: bruk alltid
 *   kjøpe-hallen (som allerede lagres på `app_game1_ticket_purchases.hall_id`).
 *   Eksisterende entries før denne PR er lukket-bundet; ingen retro-
 *   rebalansering — se commit-message for audit-konsekvens.
 *
 * Default no-op-implementasjonen brukes i unit-tester som ikke verifiserer
 * compliance-skrivning (unngår å kreve ComplianceLedger-mock i alle tester).
 */

import type {
  LedgerChannel,
  LedgerEventType,
  LedgerGameType,
} from "../game/ComplianceLedgerTypes.js";

export interface ComplianceLedgerEventInput {
  hallId: string;
  gameType: LedgerGameType;
  channel: LedgerChannel;
  eventType: LedgerEventType;
  /** Beløp i kroner (ikke øre). */
  amount: number;
  roomCode?: string;
  gameId?: string;
  claimId?: string;
  playerId?: string;
  walletId?: string;
  sourceAccountId?: string;
  targetAccountId?: string;
  policyVersion?: string;
  batchId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget kontrakt. Implementasjonen skal aldri kaste — caller
 * fanger opp uansett og logger pino-warning (matcher BingoEngine.buyIn-
 * patternet hvor en compliance-feil ALDRI ruller tilbake purchase/payout).
 */
export interface ComplianceLedgerPort {
  recordComplianceLedgerEvent(input: ComplianceLedgerEventInput): Promise<void>;
}

/**
 * Default no-op. Brukes i unit-tester som ikke verifiserer compliance-
 * skrivning og i environment-er uten ComplianceLedger wiret (bør være
 * ingen i prod — index.ts wires til BingoEngine.getComplianceLedgerPort()).
 */
export class NoopComplianceLedgerPort implements ComplianceLedgerPort {
  async recordComplianceLedgerEvent(
    _input: ComplianceLedgerEventInput,
  ): Promise<void> {
    /* no-op */
  }
}
