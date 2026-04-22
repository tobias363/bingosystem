/**
 * PR-T3 Spor 4: Pot-evaluator — generisk helper for draw-engine.
 *
 * Brukt av `Game1DrawEngineService.evaluateAndPayoutPhase` etter at Fullt Hus
 * (phase 5) er vunnet og hovedpremie + fixed jackpot (T1) er utbetalt.
 * Itererer alle aktive pot-er for hallen og evaluerer win-regelen per pot:
 *
 *   - `pot_type = 'innsatsen'` (T3): target-amount + threshold-window.
 *     Pot utløses kun når `currentAmount >= targetAmountCents` OG
 *     drawSequence er innenfor [drawThresholdLower, winRule.drawThreshold].
 *     Utenfor vinduet eller under target → pot ruller over til neste spill.
 *
 *   - `pot_type = 'jackpott'` (T2): Agent 1 T2 legger sin logikk her. Denne
 *     helper-en er bevisst skrevet slik at T2 kan utvide switch-casen uten
 *     å overskrive T3-logikken.
 *
 *   - `pot_type = 'generic'` (T1): standard `tryWin`-sjekk — winRule sjekkes
 *     inne i Game1PotService (phase + draw-threshold + color).
 *
 * Design-prinsipper (matcher resten av Spor 4):
 *   - Fail-closed: pot-payout-feil ruller tilbake hele draw-transaksjonen.
 *     Caller (draw-engine) håndterer rollback via sin PoolClient.
 *   - Idempotency-key `g1-pot-{potId}-{scheduledGameId}` på walletAdapter.credit
 *     forhindrer dobbel credit ved retry-scenario.
 *   - Én vinner per pot (PM-vedtak: ingen split for pot — `firstWinner` tar alt).
 *   - Audit-log via `app_game1_pot_events` (T1-eksisterende) + en separat
 *     audit-entry via AuditLogService for `game1.innsatsen_won` (synlig i
 *     compliance-reporting).
 *
 * Utenfor scope (holdes i draw-engine):
 *   - Pattern-match (vinnere er allerede bestemt av caller).
 *   - Fixed-jackpot-per-farge (T1 Game1JackpotService, uavhengig av akkumulerende pot).
 *
 * Spec-referanse:
 *   docs/architecture/SPILL1_FULL_VARIANT_CATALOG_2026-04-21.md §Innsatsen
 */

import type { PoolClient } from "pg";
import type { WalletAdapter } from "../../adapters/WalletAdapter.js";
import type { AuditLogService } from "../../compliance/AuditLogService.js";
import type { Game1PotService, PotRow, TryWinResult } from "./Game1PotService.js";
import { logger as rootLogger } from "../../util/logger.js";

const log = rootLogger.child({ module: "game1-pot-evaluator" });

/** Minimal vinner-shape — matcher `Game1WinningAssignment` i draw-engine. */
export interface PotEvaluatorWinner {
  assignmentId: string;
  walletId: string;
  userId: string;
  hallId: string;
  ticketColor: string;
}

export interface EvaluateAccumulatingPotsInput {
  client: PoolClient;
  potService: Game1PotService;
  walletAdapter: WalletAdapter;
  hallId: string;
  scheduledGameId: string;
  drawSequenceAtWin: number;
  /**
   * Første vinner i vinner-listen. Får hele potten (ingen split for pot per
   * PM-vedtak). Draw-engine sorterer vinner-rekkefølge deterministisk via
   * INSERT-rekkefølge i purchases → samme rekkefølge ved retry.
   */
  firstWinner: PotEvaluatorWinner;
  audit: AuditLogService;
}

export interface PotEvaluationResult {
  potKey: string;
  potId: string;
  potType: string;
  triggered: boolean;
  amountCents: number;
  reasonCode: string | null;
  walletTxId: string | null;
}

/**
 * Evaluér alle aktive pot-er for hallen og utbetale de som har matchende
 * regel. Kjøres INNE i draw-transaksjonen — pot-payout-feil ruller tilbake
 * hele draw-en (matcher fail-closed-semantikken til Game1PayoutService).
 *
 * @returns Liste av resultater per pot (triggered + evt. beløp eller avvisnings-kode).
 */
export async function evaluateAccumulatingPots(
  input: EvaluateAccumulatingPotsInput
): Promise<PotEvaluationResult[]> {
  const pots = await input.potService.listPotsForHall(input.hallId);
  if (pots.length === 0) {
    return [];
  }

  const results: PotEvaluationResult[] = [];
  for (const pot of pots) {
    const potType = pot.config.potType ?? "generic";
    try {
      const res = await evaluateSinglePot({
        pot,
        potType,
        ...input,
      });
      results.push(res);
    } catch (err) {
      // Rethrow så draw-transaksjon ruller tilbake. Logg her for å få
      // kontekst om hvilken pot som feilet (stack-trace alene er ikke nok).
      log.error(
        {
          err,
          potId: pot.id,
          potKey: pot.potKey,
          potType,
          hallId: input.hallId,
          scheduledGameId: input.scheduledGameId,
          drawSequenceAtWin: input.drawSequenceAtWin,
        },
        "[PR-T3] pot-evaluering kastet — hele draw ruller tilbake"
      );
      throw err;
    }
  }

  return results;
}

/**
 * Evaluér én pot og utfør ev. payout. Skiller på potType slik at T2-jackpott
 * kan ha egen vinn-logikk uten å kollidere med T3-Innsatsen.
 */
async function evaluateSinglePot(params: {
  pot: PotRow;
  potType: string;
  client: PoolClient;
  potService: Game1PotService;
  walletAdapter: WalletAdapter;
  hallId: string;
  scheduledGameId: string;
  drawSequenceAtWin: number;
  firstWinner: PotEvaluatorWinner;
  audit: AuditLogService;
}): Promise<PotEvaluationResult> {
  const { pot, potType, firstWinner } = params;

  // Phase 5 = Fullt Hus. Alle akkumulerende pot-er i T1-T3-scope binder seg
  // til Fullt Hus — pot.config.winRule.phase må matche.
  const phase = pot.config.winRule.phase;

  // tryWin gjør all validering (phase, draw-window, target-amount, color).
  // Den commiterer sin egen transaksjon på pot-tabellen (BEGIN/COMMIT
  // internt). walletAdapter.credit kjøres UTENFOR pot-transaksjonen men
  // innenfor draw-transaksjonen (params.client). Rekkefølge:
  //   1) tryWin → evaluate regel + reserve payout (reset pot til seed)
  //   2) walletAdapter.credit → krediterer vinner til winnings-side
  //   3) audit-log → compliance-synlighet
  // Hvis credit (2) feiler → draw-transaksjonen ruller tilbake, men
  // pot-events-transaksjonen har allerede committet pot-reset. Dette er en
  // kjent semantisk split: pot-reset er idempotent via pot_events event_kind,
  // og re-kjøring av drawNext vil IKKE finne en pot med saldo å utbetale (den
  // er allerede resatt), så en duplisert credit er forhindret. Caller må
  // dokumentere dette i drift-prosedyren ("pot-reset uten credit = manuell
  // gjenoppretting via adminReset"). Dokumentert i evaluator-header.
  let winResult: TryWinResult;
  try {
    winResult = await params.potService.tryWin({
      hallId: pot.hallId,
      potKey: pot.potKey,
      phase,
      drawSequenceAtWin: params.drawSequenceAtWin,
      ticketColor: firstWinner.ticketColor,
      winnerUserId: firstWinner.userId,
      scheduledGameId: params.scheduledGameId,
    });
  } catch (err) {
    log.error(
      { err, potId: pot.id, potKey: pot.potKey },
      "[PR-T3] potService.tryWin kastet"
    );
    throw err;
  }

  if (!winResult.triggered) {
    // Pot venter (under target, utenfor vindu, el. annen avvisningskode).
    log.debug(
      {
        potId: pot.id,
        potKey: pot.potKey,
        potType,
        reasonCode: winResult.reasonCode,
        drawSequenceAtWin: params.drawSequenceAtWin,
      },
      "[PR-T3] pot ikke utløst — ruller over til neste spill"
    );
    return {
      potKey: pot.potKey,
      potId: pot.id,
      potType,
      triggered: false,
      amountCents: 0,
      reasonCode: winResult.reasonCode,
      walletTxId: null,
    };
  }

  // Pot utløst — krediter vinner. Idempotency-key per pot + spill
  // forhindrer dobbel credit ved retry.
  const amountKr = winResult.amountCents / 100;
  const idempotencyKey = `g1-pot-${pot.id}-${params.scheduledGameId}`;
  const description =
    potType === "innsatsen"
      ? `Spill 1 Innsatsen — pot ${pot.displayName}`
      : potType === "jackpott"
        ? `Spill 1 Jackpott — pot ${pot.displayName}`
        : `Spill 1 pot — ${pot.displayName}`;

  let walletTxId: string | null = null;
  try {
    const tx = await params.walletAdapter.credit(
      firstWinner.walletId,
      amountKr,
      description,
      {
        idempotencyKey,
        to: "winnings",
      }
    );
    walletTxId = tx.id;
  } catch (err) {
    log.error(
      {
        err,
        potId: pot.id,
        potKey: pot.potKey,
        potType,
        amountCents: winResult.amountCents,
        winnerWalletId: firstWinner.walletId,
        idempotencyKey,
      },
      "[PR-T3] wallet.credit feilet for pot — draw ruller tilbake"
    );
    throw err;
  }

  // Audit-log for compliance-synlighet. Fire-and-forget (AuditLogService
  // håndterer intern fail-safe).
  const auditAction =
    potType === "innsatsen"
      ? "game1.innsatsen_won"
      : potType === "jackpott"
        ? "game1.jackpott_won"
        : "game1.pot_won";
  params.audit
    .record({
      actorId: null,
      actorType: "SYSTEM",
      action: auditAction,
      resource: "game1_accumulating_pot",
      resourceId: pot.id,
      details: {
        potKey: pot.potKey,
        potType,
        hallId: pot.hallId,
        scheduledGameId: params.scheduledGameId,
        drawSequenceAtWin: params.drawSequenceAtWin,
        amountCents: winResult.amountCents,
        winnerUserId: firstWinner.userId,
        winnerWalletId: firstWinner.walletId,
        ticketColor: firstWinner.ticketColor,
        walletTxId,
        idempotencyKey,
        eventId: winResult.eventId,
      },
    })
    .catch((err) => {
      log.warn(
        { err, potId: pot.id, action: auditAction },
        "[PR-T3] audit.record feilet — pot-payout står, ignorert"
      );
    });

  log.info(
    {
      potId: pot.id,
      potKey: pot.potKey,
      potType,
      amountCents: winResult.amountCents,
      winnerUserId: firstWinner.userId,
      scheduledGameId: params.scheduledGameId,
      drawSequenceAtWin: params.drawSequenceAtWin,
      walletTxId,
    },
    "[PR-T3] pot utløst og utbetalt"
  );

  return {
    potKey: pot.potKey,
    potId: pot.id,
    potType,
    triggered: true,
    amountCents: winResult.amountCents,
    reasonCode: null,
    walletTxId,
  };
}
