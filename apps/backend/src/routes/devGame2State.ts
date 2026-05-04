/**
 * 2026-05-04 (Tobias-direktiv) — Spill 2 (rocket) debug-telemetry-route.
 *
 * Bakgrunn:
 *   "kan du lage debug kode som ser hva som skjer her så vi ikke
 *    fortsetter å gjette på feil?"
 *
 *   Spill 2 (ROCKET) hang i status=RUNNING med drawnNumbers=21/21 men
 *   `endedReason=null`, og PerpetualRoundService kunne ikke spawne ny
 *   runde fordi `bingoAdapter.onGameEnded` aldri ble fyrt for forrige.
 *   PR #882 (PR-fix i `Game2Engine.onDrawCompleted`) krevde at hooken
 *   faktisk kjørte på siste draw — men hvis hooken kastet en feil eller
 *   prosessen ble restartet midt i `onDrawCompleted`, mutete status
 *   aldri.
 *
 *   Denne routen lar oss se NÅVÆRENDE state av ROCKET-rommet via HTTP og
 *   force-end-e stuck-rom som workaround inntil rot-årsaken er fikset.
 *
 * Sikkerhet:
 *   Begge endepunkter krever ?token=<RESET_TEST_PLAYERS_TOKEN>-match.
 *   Samme token-konvensjon som `/api/_dev/reset-test-user` (linje 3293 i
 *   index.ts). Hvis env-varet ikke er satt → 503, så ingen utilsiktet
 *   eksponering på dev-instanser uten token.
 *
 * Endepunkter:
 *   - GET  /api/_dev/game2-state?token=...        — read-only diagnostic.
 *   - POST /api/_dev/game2-force-end?token=...    — workaround for stuck
 *                                                   ROCKET (force-ender +
 *                                                   spawner ny runde).
 *
 * NB: Routen er bevisst minimal og typer er løse (Record<string, unknown>)
 * for å maksimere debug-verdi — vi vil ALL state, ikke en kuratert subset.
 */

import express from "express";
import type { BingoEngine } from "../game/BingoEngine.js";
import type { Game2AutoDrawTickService } from "../game/Game2AutoDrawTickService.js";
import type { PerpetualRoundService } from "../game/PerpetualRoundService.js";
import { GAME2_SLUGS, GAME2_MAX_BALLS } from "../game/Game2AutoDrawTickService.js";

/** Default rom-koden for Spill 2 (single-instance på tvers av haller). */
const ROCKET_ROOM_CODE = "ROCKET";

export interface DevGame2StateRouterDeps {
  engine: BingoEngine;
  game2AutoDrawTickService: Game2AutoDrawTickService;
  perpetualRoundService: PerpetualRoundService;
  /**
   * Trigger en ny runde umiddelbart etter force-end. Wires til
   * `perpetualRoundService.spawnFirstRoundIfNeeded(roomCode)` i index.ts.
   * Optional fail-soft.
   */
  spawnFirstRoundIfNeeded?: (roomCode: string) => Promise<boolean>;
}

/**
 * Hent token fra query-string (`?token=...`) eller body (`{token: "..."}`).
 * GET-routen bruker query, POST-routen bruker body for konsistens med
 * `/api/_dev/reset-test-user`.
 */
function extractToken(req: express.Request): string {
  const queryToken =
    typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (queryToken) return queryToken;
  const bodyToken =
    typeof req.body?.token === "string" ? (req.body.token as string).trim() : "";
  return bodyToken;
}

/**
 * Felles token-sjekk. Returnerer true hvis videre prosessering kan skje;
 * returnerer false ETTER å ha skrevet 401/403/503 til responsen.
 */
function checkToken(req: express.Request, res: express.Response): boolean {
  const expected = (process.env.RESET_TEST_PLAYERS_TOKEN ?? "").trim();
  if (!expected) {
    res.status(503).json({
      ok: false,
      error: {
        code: "DEV_TOKEN_NOT_CONFIGURED",
        message: "RESET_TEST_PLAYERS_TOKEN er ikke satt i env — diagnose-route disabled.",
      },
    });
    return false;
  }
  const provided = extractToken(req);
  if (!provided) {
    res.status(401).json({
      ok: false,
      error: { code: "TOKEN_REQUIRED", message: "Mangler ?token-query eller body.token." },
    });
    return false;
  }
  if (provided !== expected) {
    res.status(403).json({
      ok: false,
      error: { code: "FORBIDDEN", message: "Invalid token" },
    });
    return false;
  }
  return true;
}

/**
 * Konverter en error til en JSON-trygg payload (uten å miste stack-trace).
 */
function errorToPayload(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      code: (err as Error & { code?: string }).code,
      stack: err.stack?.split("\n").slice(0, 12),
    };
  }
  return { value: String(err) };
}

/**
 * Bygg full diagnose-payload for ROCKET (eller annen Spill 2-rom-kode).
 *
 * Returnerer ALL state vi kan komme til via public engine-API +
 * service-introspection. Tap av snapshot fanges per-felt slik at en
 * partial-error i ett område ikke blokkerer rapporten for resten.
 */
function buildDiagnostic(
  deps: DevGame2StateRouterDeps,
  roomCode: string
): Record<string, unknown> {
  const code = roomCode.trim().toUpperCase();
  const out: Record<string, unknown> = {
    requestedRoomCode: code,
    serverTimeMs: Date.now(),
    serverTimeIso: new Date().toISOString(),
  };

  // ── Engine-state: alle Spill 2-rom som finnes ────────────────────────────
  try {
    const summaries = deps.engine.listRoomSummaries();
    const game2Summaries = summaries.filter((s) => {
      const slug = (s.gameSlug ?? "").toLowerCase();
      return GAME2_SLUGS.has(slug);
    });
    out.game2RoomCount = game2Summaries.length;
    out.game2RoomSummaries = game2Summaries;
  } catch (err) {
    out.game2RoomSummariesError = errorToPayload(err);
  }

  // ── Snapshot for det spesifikke rommet ───────────────────────────────────
  let snapshot: ReturnType<BingoEngine["getRoomSnapshot"]> | null = null;
  try {
    snapshot = deps.engine.getRoomSnapshot(code);
  } catch (err) {
    out.roomSnapshotError = errorToPayload(err);
  }

  if (snapshot) {
    const game = snapshot.currentGame;
    const drawnCount = game?.drawnNumbers.length ?? 0;
    const isStuck =
      !!game &&
      game.status === "RUNNING" &&
      drawnCount >= GAME2_MAX_BALLS &&
      !game.endedReason;

    // Per-player: selektivt repack så vi ikke leaker socket-id eller
    // navnedata vi ikke trenger.
    const players = snapshot.players.map((p) => ({
      id: p.id,
      walletId: p.walletId,
      hallId: p.hallId,
      balance: p.balance,
      hasSocket: !!p.socketId,
      ticketCount: game?.tickets[p.id]?.length ?? 0,
    }));

    out.room = {
      code: snapshot.code,
      hostPlayerId: snapshot.hostPlayerId,
      hallId: snapshot.hallId,
      gameSlug: snapshot.gameSlug,
      createdAt: snapshot.createdAt,
      playerCount: snapshot.players.length,
      players,
      historyCount: snapshot.gameHistory.length,
      currentGame: game
        ? {
            id: game.id,
            status: game.status,
            entryFee: game.entryFee,
            ticketsPerPlayer: game.ticketsPerPlayer,
            prizePool: game.prizePool,
            remainingPrizePool: game.remainingPrizePool,
            payoutPercent: game.payoutPercent,
            maxPayoutBudget: game.maxPayoutBudget,
            remainingPayoutBudget: game.remainingPayoutBudget,
            drawnCount,
            drawnNumbers: game.drawnNumbers,
            drawBagRemaining: game.drawBag.length,
            startedAt: game.startedAt,
            endedAt: game.endedAt,
            endedReason: game.endedReason,
            isPaused: !!game.isPaused,
            pauseReason: game.pauseReason,
            pauseUntil: game.pauseUntil,
            isTestGame: !!game.isTestGame,
            bingoWinnerId: game.bingoWinnerId,
            lineWinnerId: game.lineWinnerId,
            participatingPlayerIds: game.participatingPlayerIds,
            claimsCount: game.claims.length,
            ticketsByPlayer: Object.fromEntries(
              Object.entries(game.tickets).map(([pid, tickets]) => [
                pid,
                tickets.map((t) => ({
                  id: t.id,
                  type: t.type,
                  color: t.color,
                  // Grid utelates i full payload (3x3 = 9 verdier per ticket × N
                  // tickets blir mye støy). Behold grid kun hvis ticketCount er
                  // lavt så enkel inspeksjon fortsatt fungerer.
                  grid: tickets.length <= 5 ? t.grid : undefined,
                })),
              ])
            ),
            marksCountByPlayer: Object.fromEntries(
              Object.entries(game.marks).map(([pid, marks]) => [
                pid,
                marks.map((m) => m.length),
              ])
            ),
          }
        : null,
    };

    out.diagnosis = {
      isStuck,
      stuckReason: isStuck
        ? "drawn=21 + status=RUNNING + endedReason=null — Game2Engine.onDrawCompleted ble ikke fullført på siste draw"
        : null,
      // Tobias 2026-05-04: Når isStuck=true er en av disse rotårsakene mest
      // sannsynlig:
      //   1. onDrawCompleted kastet en feil på siste draw (wallet-shortage,
      //      compliance-ledger transient, etc.) → handleHookError fanget
      //      uten å sette endedReason.
      //   2. Process-restart etter draw-bag-tømming men før status-mutasjon.
      //   3. PR #882 fix-en (`drawnNumbers.length >= 21`-sjekken) ble
      //      bypasset fordi candidates-listen returnerte vinnere fra
      //      tidligere draw — usannsynlig hvis findG2Winners er korrekt.
      possibleRootCauses: isStuck
        ? [
            "onDrawCompleted threw on last draw (wallet/compliance error)",
            "Process restart between draw-bag-empty and status-mutation",
            "Hook caught by handleHookError but state not persisted",
          ]
        : [],
    };
  }

  // ── Game2AutoDrawTickService siste-tick-rapport ──────────────────────────
  try {
    const tickResult = deps.game2AutoDrawTickService.getLastTickResult();
    out.game2AutoDrawTickService = {
      lastTickResult: tickResult,
      lastTickAgoMs:
        tickResult?.completedAtMs != null
          ? Date.now() - tickResult.completedAtMs
          : null,
    };
  } catch (err) {
    out.game2AutoDrawTickServiceError = errorToPayload(err);
  }

  // ── PerpetualRoundService pending-state for rommet ───────────────────────
  try {
    out.perpetualRoundService = {
      hasPendingRestart: deps.perpetualRoundService.hasPendingRestart(code),
      pendingRestartGameId: deps.perpetualRoundService.pendingRestartGameId(code),
      totalPendingCount: deps.perpetualRoundService.pendingCountForTesting(),
    };
  } catch (err) {
    out.perpetualRoundServiceError = errorToPayload(err);
  }

  // ── Relevante env-vars (kun navn + parsed verdi, aldri secrets) ──────────
  out.env = {
    AUTO_DRAW_INTERVAL_MS: process.env.AUTO_DRAW_INTERVAL_MS ?? null,
    AUTO_DRAW_ENABLED: process.env.AUTO_DRAW_ENABLED ?? null,
    AUTO_ROUND_START_ENABLED: process.env.AUTO_ROUND_START_ENABLED ?? null,
    BINGO_ALLOW_AUTOPLAY_IN_PRODUCTION:
      process.env.BINGO_ALLOW_AUTOPLAY_IN_PRODUCTION ?? null,
    GAME1_AUTO_DRAW_ENABLED: process.env.GAME1_AUTO_DRAW_ENABLED ?? null,
    GAME1_AUTO_DRAW_INTERVAL_MS: process.env.GAME1_AUTO_DRAW_INTERVAL_MS ?? null,
    PERPETUAL_LOOP_ENABLED: process.env.PERPETUAL_LOOP_ENABLED ?? null,
    PERPETUAL_LOOP_DELAY_MS: process.env.PERPETUAL_LOOP_DELAY_MS ?? null,
    PERPETUAL_LOOP_DISABLED_SLUGS:
      process.env.PERPETUAL_LOOP_DISABLED_SLUGS ?? null,
    NODE_ENV: process.env.NODE_ENV ?? null,
  };

  return out;
}

export function createDevGame2StateRouter(
  deps: DevGame2StateRouterDeps
): express.Router {
  const router = express.Router();

  /**
   * GET /api/_dev/game2-state — full diagnose for ROCKET-rommet (eller
   * spesifisert rom via ?roomCode=). Always returns 200 med ok:true
   * + data: full diagnose-payload, så lenge token er gyldig.
   */
  router.get("/api/_dev/game2-state", (req, res) => {
    if (!checkToken(req, res)) return;
    const roomCode =
      (typeof req.query.roomCode === "string" && req.query.roomCode.trim()) ||
      ROCKET_ROOM_CODE;
    try {
      const data = buildDiagnostic(deps, roomCode);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: {
          code: "DIAGNOSTIC_BUILD_FAILED",
          message: err instanceof Error ? err.message : String(err),
          details: errorToPayload(err),
        },
      });
    }
  });

  /**
   * POST /api/_dev/game2-force-end — workaround for stuck ROCKET. Kaller
   * `engine.forceEndStaleRound(code, "DEV_FORCE_END")` og prøver å spawne
   * ny runde via PerpetualRoundService. Idempotent — hvis rommet allerede
   * har endedReason satt blir forceEndStaleRound en no-op.
   */
  router.post("/api/_dev/game2-force-end", async (req, res) => {
    if (!checkToken(req, res)) return;
    const roomCode =
      (typeof req.body?.roomCode === "string" && (req.body.roomCode as string).trim()) ||
      ROCKET_ROOM_CODE;
    const code = roomCode.trim().toUpperCase();
    const result: Record<string, unknown> = {
      requestedRoomCode: code,
      serverTimeMs: Date.now(),
    };

    // Pre-state: snapshot before force-end så vi ser hva vi rør ved.
    try {
      const before = deps.engine.getRoomSnapshot(code);
      result.beforeStatus = before.currentGame?.status ?? null;
      result.beforeEndedReason = before.currentGame?.endedReason ?? null;
      result.beforeDrawnCount = before.currentGame?.drawnNumbers.length ?? 0;
    } catch (err) {
      result.beforeError = errorToPayload(err);
    }

    // Force-end. fail-soft per error-code.
    try {
      const ended = await deps.engine.forceEndStaleRound(code, "DEV_FORCE_END");
      result.forceEndStaleRoundResult = ended;
    } catch (err) {
      result.forceEndStaleRoundError = errorToPayload(err);
    }

    // Spawn ny runde — fail-soft.
    if (deps.spawnFirstRoundIfNeeded) {
      try {
        const spawned = await deps.spawnFirstRoundIfNeeded(code);
        result.spawnFirstRoundIfNeededResult = spawned;
      } catch (err) {
        result.spawnFirstRoundIfNeededError = errorToPayload(err);
      }
    } else {
      result.spawnFirstRoundIfNeededResult = null;
      result.spawnFirstRoundIfNeededNote = "callback not wired";
    }

    // Post-state: snapshot etter for å verifisere.
    try {
      const after = deps.engine.getRoomSnapshot(code);
      result.afterStatus = after.currentGame?.status ?? null;
      result.afterEndedReason = after.currentGame?.endedReason ?? null;
      result.afterCurrentGameId = after.currentGame?.id ?? null;
      result.afterDrawnCount = after.currentGame?.drawnNumbers.length ?? 0;
    } catch (err) {
      result.afterError = errorToPayload(err);
    }

    res.json({ ok: true, data: result });
  });

  return router;
}
