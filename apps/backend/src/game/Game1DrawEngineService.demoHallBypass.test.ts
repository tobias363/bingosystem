/**
 * Demo Hall bypass for scheduled Spill 1 — Tobias 2026-04-27.
 *
 * Når master-hallen er merket som test-hall (`app_halls.is_test_hall=TRUE`),
 * skal `Game1DrawEngineService.drawNext()` IKKE auto-pause på phase-won —
 * runden går helt gjennom alle 5 faser + MAX_DRAWS uten manuell Resume-trykk.
 *
 * Dekning:
 *   1) master_is_test_hall=TRUE + LINE-vinn (fase 1) → autoPauseTriggered=false,
 *      paused_at_phase=null. Runden fortsetter automatisk til neste fase.
 *   2) master_is_test_hall=FALSE (regresjon) → eksisterende auto-pause-flyt
 *      uendret (paused=true, paused_at_phase=current_phase).
 *
 * Testmønster gjenbruker stub-pool fra Game1DrawEngineService.autoPause.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  Game1DrawEngineService,
  type Game1GameStateView,
} from "./Game1DrawEngineService.js";
import type {
  Game1TicketPurchaseService,
  Game1TicketPurchaseRow,
} from "./Game1TicketPurchaseService.js";
import type {
  Game1PayoutService,
  Game1PhasePayoutInput,
  Game1PhasePayoutResult,
} from "./Game1PayoutService.js";
import type {
  AdminGame1Broadcaster,
  AdminGame1AutoPausedEvent,
  AdminGame1PhaseWonEvent,
} from "./AdminGame1Broadcaster.js";
import {
  AuditLogService,
  InMemoryAuditLogStore,
} from "../compliance/AuditLogService.js";

// ── Stub pool (gjenbrukt fra Game1DrawEngineService.autoPause.test.ts) ──────

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

interface StubResponse {
  match: (sql: string) => boolean;
  rows: unknown[] | (() => unknown[]);
  rowCount?: number;
  once?: boolean;
}

interface StubClient {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: unknown[]; rowCount: number }>;
  release: () => void;
}

function createStubPool(responses: StubResponse[] = []): {
  pool: {
    connect: () => Promise<StubClient>;
    query: (
      sql: string,
      params?: unknown[]
    ) => Promise<{ rows: unknown[]; rowCount: number }>;
  };
  queries: RecordedQuery[];
} {
  const queue = responses.slice();
  const queries: RecordedQuery[] = [];
  const runQuery = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    for (let i = 0; i < queue.length; i++) {
      const r = queue[i]!;
      if (r.match(sql)) {
        const rows = typeof r.rows === "function" ? r.rows() : r.rows;
        if (r.once !== false) queue.splice(i, 1);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    pool: {
      connect: async () => ({ query: runQuery, release: () => undefined }),
      query: runQuery,
    },
    queries,
  };
}

// ── Fixture helpers ─────────────────────────────────────────────────────────

function runningStateRow(overrides: Record<string, unknown> = {}) {
  return {
    scheduled_game_id: "g1",
    draw_bag_json: [10, 20, 30, 40, 50, 60],
    draws_completed: 0,
    current_phase: 1,
    last_drawn_ball: null,
    last_drawn_at: null,
    next_auto_draw_at: null,
    paused: false,
    paused_at_phase: null,
    engine_started_at: "2026-04-27T12:00:00.000Z",
    engine_ended_at: null,
    ...overrides,
  };
}

function scheduledGameRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "g1",
    status: "running",
    ticket_config_json: {},
    game_config_json: null,
    room_code: null,
    master_is_test_hall: null,
    ...overrides,
  };
}

function makeFakePayoutService(): Game1PayoutService {
  return {
    async payoutPhase(
      _client: unknown,
      input: Game1PhasePayoutInput
    ): Promise<Game1PhasePayoutResult> {
      return {
        phase: input.phase,
        totalWinners: input.winners.length,
        prizePerWinnerCents: 1000,
        houseRetainedCents: 0,
        winnerRecords: input.winners.map((w) => ({
          assignmentId: w.assignmentId,
          userId: "u-1",
          prizeCents: 1000,
          jackpotCents: 0,
          walletTransactionId: "wtx-1",
          phaseWinnerId: `pw-${w.assignmentId}`,
        })),
      };
    },
  } as unknown as Game1PayoutService;
}

function makeFakeTicketPurchase(): Game1TicketPurchaseService {
  return {
    async listPurchasesForGame() {
      return [] as Game1TicketPurchaseRow[];
    },
  } as unknown as Game1TicketPurchaseService;
}

function makeRecordingBroadcaster(): {
  broadcaster: AdminGame1Broadcaster;
  autoPaused: AdminGame1AutoPausedEvent[];
  phaseWon: AdminGame1PhaseWonEvent[];
} {
  const autoPaused: AdminGame1AutoPausedEvent[] = [];
  const phaseWon: AdminGame1PhaseWonEvent[] = [];
  const broadcaster: AdminGame1Broadcaster = {
    onStatusChange: () => undefined,
    onDrawProgressed: () => undefined,
    onPhaseWon: (e) => phaseWon.push(e),
    onPhysicalTicketWon: () => undefined,
    onAutoPaused: (e) => autoPaused.push(e),
    onResumed: () => undefined,
    onTransferRequest: () => undefined,
    onTransferApproved: () => undefined,
    onTransferRejected: () => undefined,
    onTransferExpired: () => undefined,
    onMasterChanged: () => undefined,
  };
  return { broadcaster, autoPaused, phaseWon };
}

function buildWinningGrid(): number[] {
  return [
    10, 20, 30, 40, 50,
    1, 16, 31, 46, 61,
    2, 17, 0, 47, 62,
    3, 18, 32, 48, 63,
    4, 19, 33, 49, 64,
  ];
}

function wrapMarkings(marked: boolean[]): { marked: boolean[] } {
  return { marked };
}

function makeService(opts: {
  poolResponses: StubResponse[];
  broadcaster?: AdminGame1Broadcaster;
}): {
  service: Game1DrawEngineService;
  audit: InMemoryAuditLogStore;
  queries: RecordedQuery[];
} {
  const { pool, queries } = createStubPool(opts.poolResponses);
  const auditStore = new InMemoryAuditLogStore();
  const auditLogService = new AuditLogService(auditStore);
  const service = new Game1DrawEngineService({
    pool: pool as never,
    ticketPurchaseService: makeFakeTicketPurchase(),
    auditLogService,
    payoutService: makeFakePayoutService(),
    adminBroadcaster: opts.broadcaster,
  });
  return { service, audit: auditStore, queries };
}

/**
 * Bygg pool-responses for et LINE-vinn-scenario (fase 1, ball 50 fullfører
 * rad 0). Tar `masterIsTestHall` som parameter for å variere bypassen.
 */
function buildLineWinResponses(masterIsTestHall: boolean): StubResponse[] {
  const winningMarkings = new Array(25).fill(false);
  winningMarkings[0] = true;
  winningMarkings[1] = true;
  winningMarkings[2] = true;
  winningMarkings[3] = true;
  winningMarkings[12] = true;

  return [
    { match: (s) => s.startsWith("BEGIN"), rows: [] },
    {
      match: (s) =>
        s.includes("app_game1_game_state") && s.includes("FOR UPDATE"),
      rows: [
        runningStateRow({
          draws_completed: 4,
          last_drawn_ball: 40,
        }),
      ],
    },
    {
      match: (s) =>
        s.includes("FOR UPDATE OF sg") && s.includes("scheduled_games"),
      rows: [
        scheduledGameRow({ master_is_test_hall: masterIsTestHall }),
      ],
    },
    {
      match: (s) =>
        s.includes("INSERT INTO") && s.includes("app_game1_draws"),
      rows: [],
    },
    {
      match: (s) =>
        s.includes("FROM") && s.includes("app_game1_ticket_assignments"),
      rows: [
        {
          id: "a-1",
          grid_numbers_json: buildWinningGrid(),
          markings_json: wrapMarkings(winningMarkings),
          buyer_user_id: "u-1",
          hall_id: "hall-a",
          ticket_color: "yellow",
        },
      ],
    },
    {
      match: (s) =>
        s.includes("UPDATE") && s.includes("app_game1_ticket_assignments"),
      rows: [],
    },
    {
      match: (s) =>
        s.includes("FROM") && s.includes("app_game1_ticket_assignments"),
      rows: [
        {
          id: "a-1",
          grid_numbers_json: buildWinningGrid(),
          markings_json: wrapMarkings(
            (() => {
              const m = [...winningMarkings];
              m[4] = true; // siste ball 50 → LINE komplett
              return m;
            })()
          ),
          buyer_user_id: "u-1",
          hall_id: "hall-a",
          ticket_color: "yellow",
        },
      ],
    },
    {
      match: (s) =>
        s.includes("static_tickets") || s.includes("physical_ticket"),
      rows: [],
      once: false,
    },
    {
      match: (s) => s.includes("app_users") && s.includes("wallet_id"),
      rows: [{ wallet_id: "wlt-1" }],
    },
    {
      match: (s) =>
        s.includes("UPDATE") &&
        s.includes("app_game1_game_state") &&
        s.includes("paused_at_phase"),
      rows: [],
    },
    {
      match: (s) =>
        s.includes("app_game1_game_state") &&
        s.includes("SELECT") &&
        !s.includes("FOR UPDATE"),
      rows: [
        runningStateRow({
          draws_completed: 5,
          last_drawn_ball: 50,
          last_drawn_at: "2026-04-27T12:01:00.000Z",
          current_phase: 2,
          // For test-hall: paused forblir false. For prod: skulle vært
          // true men det avgjøres av UPDATE-params, ikke load-respons-mocken.
          paused: !masterIsTestHall,
          paused_at_phase: masterIsTestHall ? null : 1,
        }),
      ],
    },
    {
      match: (s) => s.includes("FROM") && s.includes("app_game1_draws"),
      rows: [
        { draw_sequence: 5, ball_value: 50, drawn_at: "..." },
      ],
    },
    { match: (s) => s.startsWith("COMMIT"), rows: [] },
  ];
}

// ── Tester ──────────────────────────────────────────────────────────────────

test("demo-hall-bypass — master_is_test_hall=true + LINE-vinn → INGEN auto-pause", async () => {
  const { broadcaster, autoPaused } = makeRecordingBroadcaster();
  const { service, queries } = makeService({
    broadcaster,
    poolResponses: buildLineWinResponses(true),
  });

  const view: Game1GameStateView = await service.drawNext("g1");
  assert.equal(view.drawsCompleted, 5);
  assert.equal(view.lastDrawnBall, 50);

  // UPDATE-params: autoPauseTriggered (param idx 5) skal være FALSE for
  // test-hall, paused_at_phase (idx 6) skal være null.
  const updateQuery = queries.find(
    (q) =>
      q.sql.includes("UPDATE") &&
      q.sql.includes("app_game1_game_state") &&
      q.sql.includes("paused_at_phase")
  );
  assert.ok(updateQuery, "UPDATE med paused_at_phase skal skje");
  assert.equal(
    updateQuery!.params[5],
    false,
    "autoPauseTriggered skal være FALSE når master_is_test_hall=true",
  );
  assert.equal(
    updateQuery!.params[6],
    null,
    "paused_at_phase skal være null når bypass er aktiv",
  );
  assert.equal(
    updateQuery!.params[4],
    false,
    "isFinished=false (LINE, ikke Fullt Hus)",
  );

  // Ingen onAutoPaused-event skal emittes.
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(
    autoPaused.length,
    0,
    "INGEN onAutoPaused-event når test-hall bypass aktiv",
  );
});

test("demo-hall-bypass — master_is_test_hall=false (regresjon) → auto-pause uendret", async () => {
  // Verifiser at flagget kun aktiveres når TRUE — eksisterende prod-haller
  // (master_is_test_hall=null/false) skal beholde dagens auto-pause-oppførsel.
  const { broadcaster, autoPaused } = makeRecordingBroadcaster();
  const { service, queries } = makeService({
    broadcaster,
    poolResponses: buildLineWinResponses(false),
  });

  await service.drawNext("g1");

  const updateQuery = queries.find(
    (q) =>
      q.sql.includes("UPDATE") &&
      q.sql.includes("app_game1_game_state") &&
      q.sql.includes("paused_at_phase")
  );
  assert.ok(updateQuery);
  assert.equal(
    updateQuery!.params[5],
    true,
    "prod-hall: autoPauseTriggered=true ved LINE-vinn (eksisterende oppførsel)",
  );
  assert.equal(
    updateQuery!.params[6],
    1,
    "prod-hall: paused_at_phase=current_phase (1)",
  );

  await new Promise((r) => setTimeout(r, 5));
  assert.equal(
    autoPaused.length,
    1,
    "prod-hall: onAutoPaused-event skal fortsatt emittes",
  );
});
