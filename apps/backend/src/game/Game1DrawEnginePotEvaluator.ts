/**
 * Game1DrawEnginePotEvaluator — C2 pot-evaluator-wiring.
 *
 * Ekstrahert fra `Game1DrawEngineService.ts` i refactor/s4-draw-engine-split
 * (Forslag A).
 *
 * **Scope:**
 *   - `runAccumulatingPotEvaluation` (multi-hall-iterasjon + per-hall
 *     kall til konsolidert `evaluateAccumulatingPots`-helper)
 *
 * **Kontrakt:**
 *   - Ren pure-funksjon-modul. Mottar alt den trenger via parametere.
 *   - Byte-identisk flytting — fail-closed-kontrakt og
 *     firstWinnerPerHall-beregning bevart.
 *
 * **Regulatorisk:** pot-evaluering kjøres INNE i draw-transaksjonen
 * (samme `PoolClient` som er sendt inn). `innsatsen`/`generic`-feil
 * kaster ut slik at draw-en ruller tilbake (fail-closed). `jackpott`-
 * feil har egen swallow-policy inne i `evaluateAccumulatingPots` og
 * når ikke opp hit.
 */

import type { PoolClient } from "pg";
import type { AuditLogService } from "../compliance/AuditLogService.js";
import type { WalletAdapter } from "../adapters/WalletAdapter.js";
import type { Game1WinningAssignment } from "./Game1PayoutService.js";
import type { Game1PotService } from "./pot/Game1PotService.js";
import type { PotDailyAccumulationTickService } from "./pot/PotDailyAccumulationTickService.js";
import { evaluateAccumulatingPots } from "./pot/PotEvaluator.js";
import { logger as rootLogger } from "../util/logger.js";

const log = rootLogger.child({ module: "game1-draw-engine-pot-evaluator" });

// ── Public API ───────────────────────────────────────────────────────────────

export interface RunAccumulatingPotEvaluationParams {
  client: PoolClient;
  potService: Game1PotService;
  walletAdapter: WalletAdapter;
  audit: AuditLogService;
  potDailyTickService: PotDailyAccumulationTickService | null;
  scheduledGameId: string;
  drawSequenceAtWin: number;
  winners: ReadonlyArray<Game1WinningAssignment & { userId: string }>;
}

/**
 * PR-C2 Spor 4: evaluér akkumulerende pot-er (Innsatsen + Jackpott) via
 * konsolidert PotEvaluator. Kjøres kun når Fullt Hus er vunnet —
 * callern må gjøre `currentPhase === TOTAL_PHASES`-sjekken før denne
 * funksjonen kalles.
 *
 * PotEvaluator itererer pot-er per hall og switcher på `config.potType`:
 *   - innsatsen → fail-closed (credit-feil ruller tilbake draw)
 *   - jackpott  → fail-open (credit-feil loggres, draw fortsetter —
 *     bevart T2-semantikk; fase-payout for andre vinnere skal ikke
 *     annulleres pga pot-feil)
 *   - generic   → fail-closed (samme som innsatsen)
 *
 * Multi-hall-støtte (arvet fra T2): iterer unike halls blant vinnere og
 * kall evaluator én gang per hall med firstWinner fra den hall-en.
 * BINGO-claim-orden = array-orden fra assignments-SELECT.
 */
export async function runAccumulatingPotEvaluation(
  params: RunAccumulatingPotEvaluationParams
): Promise<void> {
  const {
    client,
    potService,
    walletAdapter,
    audit,
    potDailyTickService,
    scheduledGameId,
    drawSequenceAtWin,
    winners,
  } = params;

  if (winners.length === 0) return;

  const firstWinnerPerHall = new Map<
    string,
    Game1WinningAssignment & { userId: string }
  >();
  for (const w of winners) {
    if (!firstWinnerPerHall.has(w.hallId)) {
      firstWinnerPerHall.set(w.hallId, w);
    }
  }

  for (const [hallId, firstWinner] of firstWinnerPerHall) {
    try {
      await evaluateAccumulatingPots({
        client,
        potService,
        walletAdapter,
        hallId,
        scheduledGameId,
        drawSequenceAtWin,
        firstWinner,
        audit,
        potDailyTickService: potDailyTickService ?? undefined,
      });
    } catch (err) {
      // Pot-evaluerings-feil for innsatsen/generic er regulatorisk
      // kritisk — rull hele draw-en tilbake slik at en half-credit-
      // tilstand aldri blir persistert. Jackpott-feil har egen swallow-
      // policy inne i evaluator og kaster IKKE hit.
      log.error(
        { err, scheduledGameId, drawSequenceAtWin, hallId },
        "[PR-C2] evaluateAccumulatingPots kastet — draw-transaksjon ruller tilbake"
      );
      throw err;
    }
  }
}
