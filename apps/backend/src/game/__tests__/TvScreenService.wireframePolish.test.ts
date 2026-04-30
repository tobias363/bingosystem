/**
 * Wireframe PDF 16 §16.5 polish — backend KPI + per-pattern hallNames.
 *
 * Spec: docs/architecture/WIREFRAME_CATALOG.md PDF 16 §16.5.
 *
 * Dekker:
 *   1. fullHouseWinners + patternsWon i live state (ikke bare i getWinners)
 *   2. Per-pattern hallNames-array bygges fra phase_winners.hall_id + app_halls
 *   3. Single-hall winner: hallNames = ["Hall A"]
 *   4. Multi-hall winners (group-of-halls): hallNames = ["Hall A", "Hall B"] sortert
 *   5. Empty fallback (ingen game): KPIs = 0, hallNames = []
 *   6. Fail-soft: hallNames-lookup feiler → patterns rendres uten hallNames, ingen 500
 *
 * Bruker stub-pool-mønsteret fra TvScreenService.participatingHalls.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { TvScreenService } from "../TvScreenService.js";

interface StubResponse {
  match: (sql: string) => boolean;
  rows: unknown[];
}

interface StubPool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
}

function createStubPool(responses: StubResponse[]): StubPool {
  const queue = responses.slice();
  return {
    query: async (sql: string) => {
      for (const r of queue) {
        if (r.match(sql)) return { rows: r.rows, rowCount: r.rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

function activeGameRow(): unknown {
  return {
    id: "sg-1",
    sub_game_index: 0,
    sub_game_name: "Spill 1",
    custom_game_name: null,
    scheduled_start_time: "2026-04-30T20:00:00.000Z",
    scheduled_end_time: "2026-04-30T20:30:00.000Z",
    status: "running",
    game_config_json: null,
  };
}

/**
 * Standard-stub-responser. Tester overskriver de delene de trenger via
 * `extra` som matches FØR base-rader (rekkefølgen er FIFO).
 */
function baseResponses(extra: StubResponse[] = []): StubResponse[] {
  return [
    ...extra,
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_scheduled_games\"") && s.includes("'running'"),
      rows: [activeGameRow()],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_scheduled_games\"") && s.includes("scheduled_start_time > now()"),
      rows: [],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_game_state\""),
      rows: [{ current_phase: 1, last_drawn_ball: null, draws_completed: 0 }],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_draws\""),
      rows: [],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_phase_winners\""),
      rows: [],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_halls\""),
      rows: [],
    },
  ];
}

test("KPI: fullHouseWinners + patternsWon = 0 når ingen game finnes", async () => {
  const pool = createStubPool([
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_scheduled_games\""),
      rows: [],
    },
  ]);
  const svc = new TvScreenService({
    pool: pool as unknown as import("pg").Pool,
  });
  const state = await svc.getState({ id: "hall-a", name: "Hall Alfa" });

  assert.equal(state.fullHouseWinners, 0);
  assert.equal(state.patternsWon, 0);
  assert.deepEqual(
    state.patterns.map((p) => p.hallNames),
    [[], [], [], [], []]
  );
});

test("KPI: fullHouseWinners + patternsWon når winners finnes", async () => {
  const pool = createStubPool(
    baseResponses([
      {
        match: (s) => s.includes("FROM \"public\".\"app_game1_phase_winners\""),
        // 3 vinnere på Row 1, 2 på Row 2, 1 på Full House = 6 totalt; 1 FH.
        rows: [
          { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 15000, hall_id: "hall-a" },
          { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 15000, hall_id: "hall-a" },
          { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 15000, hall_id: "hall-b" },
          { phase: 2, prize_amount_cents: 7500, total_phase_prize_cents: 15000, hall_id: "hall-a" },
          { phase: 2, prize_amount_cents: 7500, total_phase_prize_cents: 15000, hall_id: "hall-b" },
          { phase: 5, prize_amount_cents: 50000, total_phase_prize_cents: 50000, hall_id: "hall-c" },
        ],
      },
      {
        match: (s) => s.includes("FROM \"public\".\"app_halls\""),
        rows: [
          { id: "hall-a", name: "Hall Alfa" },
          { id: "hall-b", name: "Hall Bravo" },
          { id: "hall-c", name: "Hall Charlie" },
        ],
      },
    ])
  );
  const svc = new TvScreenService({
    pool: pool as unknown as import("pg").Pool,
  });
  const state = await svc.getState({ id: "hall-a", name: "Hall Alfa" });

  assert.equal(state.fullHouseWinners, 1);
  assert.equal(state.patternsWon, 6);
});

test("hallNames: single-hall winner → array med én oppføring", async () => {
  const pool = createStubPool(
    baseResponses([
      {
        match: (s) => s.includes("FROM \"public\".\"app_game1_phase_winners\""),
        rows: [
          { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 5000, hall_id: "hall-a" },
        ],
      },
      {
        match: (s) => s.includes("FROM \"public\".\"app_halls\""),
        rows: [{ id: "hall-a", name: "Notodden Bingo" }],
      },
    ])
  );
  const svc = new TvScreenService({
    pool: pool as unknown as import("pg").Pool,
  });
  const state = await svc.getState({ id: "hall-a", name: "Notodden Bingo" });

  const row1 = state.patterns.find((p) => p.phase === 1)!;
  assert.deepEqual(row1.hallNames, ["Notodden Bingo"]);
  assert.equal(row1.playersWon, 1);
});

test("hallNames: multi-hall winners → sortert array med flere navn", async () => {
  const pool = createStubPool(
    baseResponses([
      {
        match: (s) => s.includes("FROM \"public\".\"app_game1_phase_winners\""),
        rows: [
          // Multi-hall vinnere (group-of-halls scenario).
          { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 15000, hall_id: "hall-c" },
          { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 15000, hall_id: "hall-a" },
          { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 15000, hall_id: "hall-b" },
        ],
      },
      {
        match: (s) => s.includes("FROM \"public\".\"app_halls\""),
        rows: [
          { id: "hall-a", name: "Hamar Bingo" },
          { id: "hall-b", name: "Lillehammer Bingo" },
          { id: "hall-c", name: "Notodden Bingo" },
        ],
      },
    ])
  );
  const svc = new TvScreenService({
    pool: pool as unknown as import("pg").Pool,
  });
  const state = await svc.getState({ id: "hall-a", name: "Hamar Bingo" });

  const row1 = state.patterns.find((p) => p.phase === 1)!;
  // Sortert alfabetisk på norsk locale (a-å).
  assert.deepEqual(row1.hallNames, [
    "Hamar Bingo",
    "Lillehammer Bingo",
    "Notodden Bingo",
  ]);
});

test("hallNames: tom liste når ingen vinner ennå (uvunnet fase)", async () => {
  const pool = createStubPool(
    baseResponses([
      {
        match: (s) => s.includes("FROM \"public\".\"app_game1_phase_winners\""),
        rows: [
          { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 5000, hall_id: "hall-a" },
        ],
      },
      {
        match: (s) => s.includes("FROM \"public\".\"app_halls\""),
        rows: [{ id: "hall-a", name: "Hall Alfa" }],
      },
    ])
  );
  const svc = new TvScreenService({
    pool: pool as unknown as import("pg").Pool,
  });
  const state = await svc.getState({ id: "hall-a", name: "Hall Alfa" });

  // Row 1 har vinner.
  assert.deepEqual(state.patterns.find((p) => p.phase === 1)!.hallNames, ["Hall Alfa"]);
  // Row 2-5 ikke vunnet → tom array.
  assert.deepEqual(state.patterns.find((p) => p.phase === 2)!.hallNames, []);
  assert.deepEqual(state.patterns.find((p) => p.phase === 3)!.hallNames, []);
  assert.deepEqual(state.patterns.find((p) => p.phase === 4)!.hallNames, []);
  assert.deepEqual(state.patterns.find((p) => p.phase === 5)!.hallNames, []);
});

test("fail-soft: app_halls-tabell mangler → patterns har tom hallNames, ingen 500", async () => {
  // Stub-pool: phase_winners returnerer rad, men app_halls-query kaster.
  const responses: StubResponse[] = [
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_scheduled_games\"") && s.includes("'running'"),
      rows: [activeGameRow()],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_scheduled_games\"") && s.includes("scheduled_start_time > now()"),
      rows: [],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_game_state\""),
      rows: [{ current_phase: 1, last_drawn_ball: null, draws_completed: 0 }],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_draws\""),
      rows: [],
    },
    {
      match: (s) => s.includes("FROM \"public\".\"app_game1_phase_winners\""),
      rows: [
        { phase: 1, prize_amount_cents: 5000, total_phase_prize_cents: 5000, hall_id: "hall-a" },
      ],
    },
  ];
  const pool: StubPool = {
    query: async (sql: string) => {
      for (const r of responses) {
        if (r.match(sql)) return { rows: r.rows, rowCount: r.rows.length };
      }
      // Først app_halls-query treffer hit og kaster.
      if (sql.includes("FROM \"public\".\"app_halls\"")) {
        const err = new Error("app_halls-tabell mangler");
        // 42P01 = undefined_table.
        (err as Error & { code: string }).code = "42P01";
        throw err;
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const svc = new TvScreenService({
    pool: pool as unknown as import("pg").Pool,
  });
  // Skal IKKE kaste — kritisk for live TV som ellers 500'er.
  const state = await svc.getState({ id: "hall-a", name: "Hall Alfa" });

  // KPI fortsatt riktig (kommer fra winners-rad, ikke app_halls).
  assert.equal(state.fullHouseWinners, 0);
  assert.equal(state.patternsWon, 1);
  // hallNames tom — fail-soft branch.
  assert.deepEqual(state.patterns.find((p) => p.phase === 1)!.hallNames, []);
});

test("getStateInternal — empty fallback (ingen aktiv/ferdig spill) har KPI=0 + hallNames=[]", async () => {
  const pool = createStubPool([
    {
      match: () => true, // ingen treff på noen query → tom respons
      rows: [],
    },
  ]);
  const svc = new TvScreenService({
    pool: pool as unknown as import("pg").Pool,
  });
  const state = await svc.getState({ id: "hall-a", name: "Hall Alfa" });

  assert.equal(state.fullHouseWinners, 0);
  assert.equal(state.patternsWon, 0);
  assert.equal(state.patterns.length, 5);
  for (const p of state.patterns) {
    assert.deepEqual(p.hallNames, []);
  }
});
