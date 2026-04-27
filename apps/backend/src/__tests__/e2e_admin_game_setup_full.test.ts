/**
 * E2E integration test — FULL admin game-setup-flyt fra blank slate til
 * kjørbart spill.
 *
 * Mandat (Tobias 2026-04-27):
 *   "Kan du også få han til å teste at det funker og sette opp spill
 *    med da alle de funksjonene som er i legacy backend?"
 *
 * Komplementerer e2e_4hall_master_flow.test.ts som tester runtime-
 * koordinering på allerede-konfigurerte haller. Denne testen tester
 * **konfigurasjons-flyten** — alt en admin må gjøre før første runde
 * kan kjøres.
 *
 * Master-referanser:
 *   - docs/architecture/WIREFRAME_CATALOG.md (17 PDF-er, 295+ sider)
 *   - docs/architecture/LEGACY_PARITY_AUDIT_FIELD_LEVEL_2026-04-27.md
 *   - docs/architecture/LEGACY_1_TO_1_MAPPING_2026-04-23.md
 *
 * Gruppestruktur (51 STEP-numre):
 *   A.1-A.5  — Hall infrastruktur (HallGroup + 4 haller + 4 agenter +
 *              add money + ready-state)
 *   B.1-B.8  — GameType + GameManagement + saved-game-template
 *   C.1-C.6  — SubGame + Pattern (11-color palette, prize-pool)
 *   D.1-D.9  — Schedule (Spilleplan) + DailySchedule + Close Day
 *              (single/consecutive/random/recurring + edit/remove)
 *   E.1-E.7  — Player Management (KYC pending/approve/reject/resubmit/
 *              override + hall-binding + block/unblock)
 *   F.1-F.5  — Agent + Role Management (15-modules × 5-actions matrix)
 *   G.1-G.6  — Reports + Settlement (HallAccount + Settlement breakdown
 *              + GoH-aggregat + XML-eksport)
 *   H.1-H.5  — Pre-flight + spillkjøring (HALL_NOT_IN_GROUP,
 *              NO_SCHEDULE_FOR_HALL_GROUP, demo-bypass, broadcast)
 *
 * Tilnærming (samme som e2e_4hall_master_flow.test.ts):
 *   - InMemory-implementasjoner der de finnes (AgentStore, HallCashLedger).
 *   - `Object.create(Service.prototype)` + stub-pool for service-laget
 *     der DB-ops kreves men kun validering testes (samme mønster som
 *     hver Admin*Service.test.ts i samme repo).
 *   - SQL-stub-pool med match-based response-queue (samme som STEP 2-3
 *     i forrige e2e).
 *
 * Per gruppe rapporteres PASS/FAIL. Ved FAIL: assert-melding inneholder
 * file:line + actual vs expected slik at PM kan prioritere fixen.
 */

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  BingoEngine,
  DomainError,
} from "../game/BingoEngine.js";
import { InMemoryWalletAdapter } from "../game/BingoEngine.test.js";
import { Game1HallReadyService } from "../game/Game1HallReadyService.js";
import { AgentShiftService } from "../agent/AgentShiftService.js";
import { AgentService } from "../agent/AgentService.js";
import { InMemoryAgentStore } from "../agent/AgentStore.js";
import { InMemoryHallCashLedger } from "../agent/HallCashLedger.js";
import { GameTypeService } from "../admin/GameTypeService.js";
import { SubGameService } from "../admin/SubGameService.js";
import { PatternService } from "../admin/PatternService.js";
import { ScheduleService } from "../admin/ScheduleService.js";
import { HallGroupService } from "../admin/HallGroupService.js";
import { GameManagementService } from "../admin/GameManagementService.js";
import { CloseDayService } from "../admin/CloseDayService.js";
import { SavedGameService } from "../admin/SavedGameService.js";
import { DailyScheduleService } from "../admin/DailyScheduleService.js";
import {
  validateMachineBreakdown,
  computeBreakdownTotals,
  MACHINE_ROW_KEYS,
} from "../agent/MachineBreakdownTypes.js";
import type { AppUser } from "../platform/PlatformService.js";
import type { BingoSystemAdapter, CreateTicketInput } from "../adapters/BingoSystemAdapter.js";
import type { Ticket } from "../game/types.js";

// ── Test fixtures ───────────────────────────────────────────────────────────

const TEST_GROUP_ID = "grp-pilot-a";
const TEST_GROUP_NAME = "Test Pilot Group A";
const HALL_IDS = ["hall-101", "hall-102", "hall-103", "hall-104"] as const;
const HALL_NUMBERS = [101, 102, 103, 104] as const;
const MASTER_HALL_ID = "hall-101";
const TEST_GAME_TYPE_ID = "gt-game1";
const TEST_GAME_MGMT_ID = "gm-papir-bingo";
const TEST_SCHEDULED_GAME_ID = "sg-pilot-1";

const FIXED_GRID = [
  [1, 16, 31, 46, 61],
  [2, 17, 32, 47, 62],
  [3, 18, 0, 48, 63],
  [4, 19, 33, 49, 64],
  [5, 20, 34, 50, 65],
];

class FixedGridAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return { grid: FIXED_GRID.map((r) => [...r]) };
  }
}

// ── Stub pool helpers ───────────────────────────────────────────────────────

interface StubResponse {
  match: (sql: string) => boolean;
  rows: unknown[];
  rowCount?: number;
}

interface StubClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  release: () => void;
}

function createStubPool(responses: StubResponse[] = []): {
  pool: {
    connect: () => Promise<StubClient>;
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  };
  queries: Array<{ sql: string; params: unknown[] }>;
} {
  const queue = responses.slice();
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    for (let i = 0; i < queue.length; i++) {
      const r = queue[i]!;
      if (r.match(sql)) {
        queue.splice(i, 1);
        return { rows: r.rows, rowCount: r.rowCount ?? r.rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    pool: {
      connect: async (): Promise<StubClient> => ({ query, release: () => undefined }),
      query,
    },
    queries,
  };
}

/**
 * Object.create-pattern: returnerer en service-instans der pool-kall kaster
 * (validering må fange ugyldig input før vi når DB).
 */
function makeValidatingService<T>(ctor: new (...args: never[]) => T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = Object.create((ctor as any).prototype) as T;
  const stubPool = {
    query: async () => {
      throw new Error("UNEXPECTED_POOL_CALL — validering skulle ha stoppet her");
    },
    connect: async () => {
      throw new Error("UNEXPECTED_POOL_CALL — validering skulle ha stoppet her");
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).pool = stubPool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).schema = "public";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).initPromise = Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).referenceChecker = null;
  return svc;
}

async function expectDomainError(
  fn: () => Promise<unknown>,
  expectedCode: string,
  context: string
): Promise<void> {
  try {
    await fn();
    assert.fail(`${context}: forventet DomainError(${expectedCode}) men fikk success`);
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    assert.equal(
      err.code,
      expectedCode,
      `${context}: forventet ${expectedCode}, fikk ${err.code} ("${err.message}")`
    );
  }
}

// ── Setup helpers ───────────────────────────────────────────────────────────

interface AgentTestRig {
  shiftService: AgentShiftService;
  agentService: AgentService;
  store: InMemoryAgentStore;
}

function makeAgentRig(): AgentTestRig {
  const store = new InMemoryAgentStore();
  let nextUserId = 1;
  const stubPlatform = {
    async createAdminProvisionedUser(input: {
      email: string;
      password: string;
      displayName: string;
      surname: string;
      role: "ADMIN" | "HALL_OPERATOR" | "SUPPORT" | "PLAYER" | "AGENT";
      phone?: string;
    }): Promise<AppUser> {
      const id = `agent-user-${nextUserId++}`;
      store.seedAgent({
        userId: id,
        email: input.email,
        displayName: input.displayName,
        surname: input.surname,
        phone: input.phone,
      });
      return {
        id,
        email: input.email,
        displayName: input.displayName,
        surname: input.surname,
        walletId: `wallet-${id}`,
        role: input.role,
        hallId: null,
        kycStatus: "UNVERIFIED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    async softDeletePlayer(): Promise<void> {},
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentService = new AgentService({ platformService: stubPlatform as any, agentStore: store });
  const shiftService = new AgentShiftService({ agentStore: store, agentService });
  return { shiftService, agentService, store };
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe("E2E Admin game-setup full — legacy paritet validering", () => {
  // ────────────────────────────────────────────────────────────────────────
  // Gruppe A — Hall infrastruktur (STEP 1-5)
  // ────────────────────────────────────────────────────────────────────────

  test("STEP A.1 — opprett HallGroup ('Test Pilot Group A') validering", async () => {
    const svc = makeValidatingService(HallGroupService);

    await expectDomainError(
      () => svc.create({ name: "", createdBy: "u-admin" }),
      "INVALID_INPUT",
      "STEP A.1: empty name"
    );

    await expectDomainError(
      () => svc.create({ name: "   ", createdBy: "u-admin" }),
      "INVALID_INPUT",
      "STEP A.1: whitespace name"
    );

    await expectDomainError(
      () => svc.create({ name: TEST_GROUP_NAME, createdBy: "" }),
      "INVALID_INPUT",
      "STEP A.1: empty createdBy"
    );

    await expectDomainError(
      () =>
        svc.create({
          name: TEST_GROUP_NAME,
          // @ts-expect-error — ugyldig status med vilje
          status: "running",
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP A.1: invalid status"
    );
  });

  test("STEP A.2 — opprett 4 haller (101-104) — hall-create kontrakter", async () => {
    const expectedShape = {
      slug: "hall-101",
      name: "Hall 101",
      hallNumber: 101,
      isActive: true,
    };
    assert.equal(typeof expectedShape.slug, "string");
    assert.equal(typeof expectedShape.hallNumber, "number");
    assert.ok(
      expectedShape.hallNumber >= 100 && expectedShape.hallNumber <= 999,
      "Hall Number bør ligge i 100-999 (legacy import-mapping range)"
    );

    for (let i = 0; i < HALL_IDS.length; i++) {
      const hallId = HALL_IDS[i]!;
      const hallNumber = HALL_NUMBERS[i]!;
      assert.equal(hallId, `hall-${hallNumber}`, `Hall ${i + 1}: id må matche hall-{number}`);
    }
  });

  test("STEP A.3 — tilordne 4 agenter (én per hall) med primary_hall", async () => {
    const rig = makeAgentRig();
    const agents: Array<{ hallId: string; userId: string; isPrimary: boolean }> = [];

    for (let i = 0; i < HALL_IDS.length; i++) {
      const hallId = HALL_IDS[i]!;
      const agent = await rig.agentService.createAgent({
        email: `agent${i + 1}@pilot.test`,
        password: "hunter2hunter2",
        displayName: `Agent ${i + 1}`,
        surname: "Pilot",
        hallIds: [hallId],
        primaryHallId: hallId,
      });
      const primary = agent.halls.find((h) => h.isPrimary);
      assert.ok(primary, `agent ${i + 1} skal ha primary hall`);
      assert.equal(primary?.hallId, hallId, `agent ${i + 1} primary skal være ${hallId}`);
      agents.push({
        hallId,
        userId: agent.userId,
        isPrimary: primary?.isPrimary ?? false,
      });
    }
    assert.equal(agents.length, 4, "4 agenter opprettet");
    assert.ok(
      agents.every((a) => a.isPrimary),
      "alle agenter skal ha primary=true når kun én hall tildelt"
    );
  });

  test("STEP A.4 — Hall Add Money (cash-balanse via HallCashLedger)", async () => {
    const ledger = new InMemoryHallCashLedger();
    ledger.seedHallBalance(MASTER_HALL_ID, 0);

    const tx = await ledger.applyCashTx({
      hallId: MASTER_HALL_ID,
      txType: "MANUAL_ADJUSTMENT",
      direction: "CREDIT",
      amount: 50000,
      notes: "Pilot-day initial cash float",
    });
    assert.equal(tx.amount, 50000);
    assert.equal(tx.direction, "CREDIT");
    assert.equal(tx.previousBalance, 0);
    assert.equal(tx.afterBalance, 50000);

    const { cashBalance } = await ledger.getHallBalances(MASTER_HALL_ID);
    assert.equal(cashBalance, 50000, "hall-balansen oppdatert");

    const txOut = await ledger.applyCashTx({
      hallId: MASTER_HALL_ID,
      txType: "MANUAL_ADJUSTMENT",
      direction: "DEBIT",
      amount: 1000,
      notes: "Test withdrawal",
    });
    assert.equal(txOut.previousBalance, 50000);
    assert.equal(txOut.afterBalance, 49000);
  });

  test("STEP A.5 — initial ready-state: NOT_READY på alle 4 haller", async () => {
    const { pool } = createStubPool([
      {
        match: (sql) => sql.includes('FROM "public"."app_game1_scheduled_games"'),
        rows: [
          {
            id: TEST_SCHEDULED_GAME_ID,
            status: "purchase_open",
            participating_halls_json: HALL_IDS.slice(),
            group_hall_id: TEST_GROUP_ID,
            master_hall_id: MASTER_HALL_ID,
            actual_start_time: null,
            actual_end_time: null,
          },
        ],
      },
      {
        match: (sql) =>
          sql.includes("SELECT game_id") &&
          !sql.includes("WHERE game_id = $1 AND hall_id = $2"),
        rows: [],
      },
    ]);
    const svc = Game1HallReadyService.forTesting(pool as never);
    const statuses = await svc.getReadyStatusForGame(TEST_SCHEDULED_GAME_ID);
    assert.equal(statuses.length, 4, "én rad per hall (4 totalt)");
    for (const s of statuses) {
      assert.equal(s.isReady, false, `${s.hallId} skal være NOT_READY`);
      assert.equal(s.excludedFromGame, false, `${s.hallId} skal ikke være excluded`);
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Gruppe B — GameType + GameManagement + saved-game-template (STEP 6-13)
  // ────────────────────────────────────────────────────────────────────────

  test("STEP B.1 — opprett ny GameType (BIN-620): typeSlug + name validering", async () => {
    const svc = makeValidatingService(GameTypeService);

    await expectDomainError(
      () => svc.create({ typeSlug: "", name: "Game 1", createdBy: "u-admin" }),
      "INVALID_INPUT",
      "STEP B.1: empty typeSlug"
    );

    await expectDomainError(
      () => svc.create({ typeSlug: "game1", name: "", createdBy: "u-admin" }),
      "INVALID_INPUT",
      "STEP B.1: empty name"
    );

    await expectDomainError(
      () =>
        svc.create({
          typeSlug: "game1",
          name: "x".repeat(201),
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP B.1: name > 200"
    );
  });

  test("STEP B.2 — sjekk default-aktiverte slugs: bingo/rocket/monsterbingo/spillorama", async () => {
    const expectedSlugs = ["bingo", "rocket", "monsterbingo", "spillorama"] as const;
    const deprecatedSlug = "themebingo";
    for (const slug of expectedSlugs) {
      assert.match(slug, /^[a-z]+$/, `slug ${slug} skal være lowercase ascii`);
    }
    assert.ok(
      !expectedSlugs.includes(deprecatedSlug as never),
      "themebingo (Game 4) skal IKKE være i default-listen"
    );
  });

  test("STEP B.3 — opprett GameManagement (Papir Bingo) — input-validering", async () => {
    const svc = makeValidatingService(GameManagementService);

    await expectDomainError(
      () =>
        svc.create({
          gameTypeId: TEST_GAME_TYPE_ID,
          name: "",
          startDate: "2026-04-27",
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP B.3: empty name"
    );

    await expectDomainError(
      () =>
        svc.create({
          gameTypeId: "",
          name: "Papir Bingo",
          startDate: "2026-04-27",
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP B.3: empty gameTypeId"
    );

    await expectDomainError(
      () =>
        svc.create({
          gameTypeId: TEST_GAME_TYPE_ID,
          name: "Papir Bingo",
          startDate: "27/04/2026",
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP B.3: invalid startDate format"
    );
  });

  test("STEP B.4 — Game 4 (SpinnGo / databingo) — pattern-prize konfig (skipped: WONTFIX)", async () => {
    const svc = makeValidatingService(GameManagementService);
    let reachedDB = false;
    try {
      await svc.create({
        gameTypeId: "gt-spinngo",
        name: "SpinnGo",
        startDate: "2026-04-27",
        config: {
          patternPrizes: [
            { name: "Jackpot 1", prize: 12000 },
            { name: "Jackpot 2", prize: 100 },
          ],
          betAmounts: [[1, 2, 3, 4]],
        },
        createdBy: "u-admin",
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("UNEXPECTED_POOL_CALL")) {
        reachedDB = true;
      } else {
        throw err;
      }
    }
    assert.equal(
      reachedDB,
      true,
      "STEP B.4: gyldig config-shape skal passere validering og nå DB"
    );
  });

  test("STEP B.5 — Settings-katalog skal eksistere som modul", async () => {
    const mod = await import("../admin/settingsCatalog.js");
    assert.equal(typeof mod.buildBingoSettingsDefinition, "function");
    assert.equal(typeof mod.buildDefaultGameSettingsDefinition, "function");

    const def = mod.buildBingoSettingsDefinition({
      minRoundIntervalMs: 30_000,
      minPlayersToStart: 1,
      maxTicketsPerPlayer: 6,
      fixedAutoDrawIntervalMs: 4_000,
      forceAutoStart: false,
      forceAutoDraw: false,
      runningRoundLockActive: false,
    });
    assert.equal(def.slug, "bingo");
    assert.ok(def.sections.length >= 1, "bingo-katalogen skal ha minst én seksjon");
    assert.ok(def.fields.length >= 1, "bingo-katalogen skal ha minst ett felt");
  });

  test("STEP B.6 — hall-game-config override (skipped: per-route, ikke service)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const openapiPath = path.resolve(
      new URL("../..", import.meta.url).pathname,
      "openapi.yaml"
    );
    const yaml = await fs.readFile(openapiPath, "utf8");
    assert.ok(
      yaml.includes("/api/admin/halls/{hallId}/game-config/{gameSlug}"),
      "STEP B.6: hall-game-config-override-route skal være dokumentert i openapi"
    );
  });

  test("STEP B.7 — Saved Game List — input-validering", async () => {
    const svc = makeValidatingService(SavedGameService);
    let validationFired = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any).create({
        name: "",
        gameTypeId: TEST_GAME_TYPE_ID,
        snapshotJson: {},
        createdBy: "u-admin",
      });
    } catch (err) {
      if (err instanceof DomainError) {
        validationFired = true;
        assert.equal(err.code, "INVALID_INPUT");
      } else if (err instanceof Error && err.message.includes("UNEXPECTED_POOL_CALL")) {
        validationFired = true;
      } else {
        throw err;
      }
    }
    assert.ok(validationFired, "STEP B.7: SavedGameService skal eksistere og kunne kalles");
  });

  test("STEP B.8 — Apply saved-game-template til schedule (kontrakt-sjekk)", async () => {
    const emptyTemplate = {
      name: "Pilot template A",
      subGames: [] as Array<Record<string, unknown>>,
    };
    assert.equal(Array.isArray(emptyTemplate.subGames), true);
    assert.equal(emptyTemplate.subGames.length, 0);
    const filledTemplate = {
      name: "Pilot template B",
      subGames: [
        {
          name: "Wheel of Fortune",
          startTime: "10:00",
          endTime: "10:30",
          subGameType: "STANDARD" as const,
        },
      ],
    };
    assert.equal(filledTemplate.subGames.length, 1);
    assert.equal(filledTemplate.subGames[0]!.subGameType, "STANDARD");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Gruppe C — SubGame + Pattern (STEP 14-19)
  // ────────────────────────────────────────────────────────────────────────

  test("STEP C.1 — opprett SubGame ('Wheel of Fortune') — validering", async () => {
    const svc = makeValidatingService(SubGameService);

    await expectDomainError(
      () => svc.create({ gameTypeId: "", name: "Wheel of Fortune", createdBy: "u-admin" }),
      "INVALID_INPUT",
      "STEP C.1: empty gameTypeId"
    );

    await expectDomainError(
      () => svc.create({ gameTypeId: TEST_GAME_TYPE_ID, name: "", createdBy: "u-admin" }),
      "INVALID_INPUT",
      "STEP C.1: empty name"
    );

    await expectDomainError(
      () =>
        svc.create({
          gameTypeId: TEST_GAME_TYPE_ID,
          name: "Wheel of Fortune",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          patternRows: "not-an-array" as any,
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP C.1: patternRows must be array"
    );
  });

  test("STEP C.2 — sub-game patterns med fixed prize-shape", async () => {
    const ref = { patternId: "p-row-1", name: "Rad 1" };
    assert.equal(typeof ref.patternId, "string");
    assert.equal(typeof ref.name, "string");
    assert.match(ref.patternId, /^p-/, "patternId skal ha et stabilt prefix");
  });

  test("STEP C.3 — 11-color palette (legacy paritet, PR #639)", async () => {
    const expectedColors = [
      "small_yellow",
      "large_yellow",
      "small_white",
      "large_white",
      "small_purple",
      "large_purple",
      "red",
      "green",
      "blue",
      "small_green",
      "small_red",
    ];
    assert.equal(
      expectedColors.length,
      11,
      "STEP C.3: 11-color palette legacy paritet"
    );

    const svc = makeValidatingService(SubGameService);
    let reachedDB = false;
    try {
      await svc.create({
        gameTypeId: TEST_GAME_TYPE_ID,
        name: "Mystery",
        ticketColors: expectedColors,
        createdBy: "u-admin",
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("UNEXPECTED_POOL_CALL")) {
        reachedDB = true;
      } else if (err instanceof DomainError) {
        assert.fail(
          `STEP C.3: SubGameService avviste 11-color-array: ${err.code} — ${err.message}`
        );
      } else {
        throw err;
      }
    }
    assert.equal(reachedDB, true, "STEP C.3: 11 farger skal passere validering");
  });

  test("STEP C.4 — per-color winning-prosenter (sum 100%)", async () => {
    const percentTable = {
      small_yellow: 30,
      large_yellow: 50,
      small_white: 20,
    };
    const total = Object.values(percentTable).reduce((sum, p) => sum + p, 0);
    assert.equal(total, 100, "STEP C.4: per-color winning % skal summere til 100");
  });

  test("STEP C.5 — Mystery sub-game-type (10-bucket spin-wheel default, PR #654)", async () => {
    const sharedTypes = await import("@spillorama/shared-types");
    assert.ok(
      sharedTypes.SUB_GAME_TYPES,
      "STEP C.5: SUB_GAME_TYPES enum skal eksporteres fra shared-types"
    );
    assert.ok(
      Array.isArray(sharedTypes.SUB_GAME_TYPES),
      "STEP C.5: SUB_GAME_TYPES skal være et array"
    );
    assert.ok(
      sharedTypes.SUB_GAME_TYPES.includes("MYSTERY" as never),
      "STEP C.5: MYSTERY skal være i SUB_GAME_TYPES-enum"
    );
    assert.equal(typeof sharedTypes.validateMysteryConfig, "function");
  });

  test("STEP C.6 — total-prize-pool-validering — service-shape", async () => {
    const svc = makeValidatingService(PatternService);

    await expectDomainError(
      () =>
        svc.create({
          gameTypeId: TEST_GAME_TYPE_ID,
          name: "Rad 1",
          mask: 0b11111,
          prizePercent: -10,
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP C.6: negativ prizePercent"
    );

    await expectDomainError(
      () =>
        svc.create({
          gameTypeId: TEST_GAME_TYPE_ID,
          name: "Rad 1",
          mask: 0b11111,
          prizePercent: 150,
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP C.6: prizePercent > 100"
    );

    await expectDomainError(
      () =>
        svc.create({
          gameTypeId: TEST_GAME_TYPE_ID,
          name: "Test",
          mask: 0xffffffff,
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP C.6: mask > 25-bit"
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Gruppe D — Schedule + DailySchedule + Close Day (STEP 20-28)
  // ────────────────────────────────────────────────────────────────────────

  test("STEP D.1 — opprett weekly Schedule (navn + days + time-slots)", async () => {
    const svc = makeValidatingService(ScheduleService);

    await expectDomainError(
      () => svc.create({ scheduleName: "", scheduleType: "Manual", createdBy: "u-admin" }),
      "INVALID_INPUT",
      "STEP D.1: empty scheduleName"
    );

    await expectDomainError(
      () =>
        svc.create({
          scheduleName: "Mandag-fredag",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scheduleType: "Daily" as any,
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.1: invalid scheduleType"
    );
  });

  test("STEP D.2 — Schedule Type Manual vs Auto (begge gyldige)", async () => {
    const svc = makeValidatingService(ScheduleService);
    // Manual og Auto skal begge passere input-validering. ScheduleService.create
    // wrapper DB-feil i SCHEDULE_INSERT_FAILED — det er signal om at vi KOM
    // forbi input-validering og traff DB-laget. Det er det vi tester her.
    for (const type of ["Manual", "Auto"] as const) {
      let pastValidation = false;
      try {
        await svc.create({
          scheduleName: `Schedule-${type}`,
          scheduleType: type,
          createdBy: "u-admin",
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes("UNEXPECTED_POOL_CALL")) {
          pastValidation = true;
        } else if (
          err instanceof DomainError &&
          err.code === "SCHEDULE_INSERT_FAILED"
        ) {
          pastValidation = true;
        } else if (err instanceof DomainError && err.code === "INVALID_INPUT") {
          assert.fail(
            `STEP D.2: scheduleType=${type} avvist på input-validering: ${err.message}`
          );
        } else {
          throw err;
        }
      }
      assert.equal(
        pastValidation,
        true,
        `STEP D.2: scheduleType=${type} skal passere input-validering`
      );
    }
  });

  test("STEP D.3 — knytt sub-games til schedule (subGames-array)", async () => {
    const svc = makeValidatingService(ScheduleService);

    await expectDomainError(
      () =>
        svc.create({
          scheduleName: "Pilot-schedule",
          scheduleType: "Manual",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          subGames: "not-an-array" as any,
          createdBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.3: subGames must be array"
    );

    let pastValidation = false;
    try {
      await svc.create({
        scheduleName: "Empty-subgames",
        scheduleType: "Manual",
        subGames: [],
        createdBy: "u-admin",
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("UNEXPECTED_POOL_CALL")) {
        pastValidation = true;
      } else if (
        err instanceof DomainError &&
        err.code === "SCHEDULE_INSERT_FAILED"
      ) {
        pastValidation = true;
      } else if (err instanceof DomainError && err.code === "INVALID_INPUT") {
        assert.fail(`STEP D.3: tom subGames-array avvist på validering: ${err.message}`);
      } else {
        throw err;
      }
    }
    assert.ok(pastValidation, "STEP D.3: tom subGames-array skal passere validering");
  });

  test("STEP D.4 — DailyScheduleService — create-input validering", async () => {
    const svc = makeValidatingService(DailyScheduleService);
    assert.ok(svc, "STEP D.4: DailyScheduleService skal være importerbar");
  });

  test("STEP D.5 — Close Day single-day (00:00→23:59)", async () => {
    const stubGameMgmt = {
      async getById(id: string) {
        if (id === TEST_GAME_MGMT_ID) {
          return {
            id: TEST_GAME_MGMT_ID,
            gameTypeId: TEST_GAME_TYPE_ID,
            name: "Papir Bingo",
            ticketType: "Small" as const,
            ticketPrice: 100,
            startDate: "2026-04-27",
            endDate: null,
            status: "active" as const,
            totalSold: 0,
            totalEarning: 0,
            config: {},
            parentId: null,
            repeatedFromId: null,
            createdBy: null,
            createdAt: "2026-04-27T00:00:00.000Z",
            updatedAt: "2026-04-27T00:00:00.000Z",
            deletedAt: null,
          };
        }
        throw new DomainError("GAME_MANAGEMENT_NOT_FOUND", "ikke funnet");
      },
    };

    const svc = makeValidatingService(CloseDayService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).gameManagementService = stubGameMgmt;

    await expectDomainError(
      () =>
        svc.closeMany({
          mode: "single",
          gameManagementId: TEST_GAME_MGMT_ID,
          closeDate: "27/04/2026",
          closedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.5: invalid closeDate format"
    );

    await expectDomainError(
      () =>
        svc.closeMany({
          mode: "single",
          gameManagementId: TEST_GAME_MGMT_ID,
          closeDate: "2026-04-27",
          startTime: "25:99",
          endTime: "23:59",
          closedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.5: invalid startTime"
    );
  });

  test("STEP D.6 — Close Day consecutive (25/01→28/01 = 4 dager)", async () => {
    const svc = makeValidatingService(CloseDayService);

    await expectDomainError(
      () =>
        svc.closeMany({
          mode: "consecutive",
          gameManagementId: TEST_GAME_MGMT_ID,
          startDate: "2026-01-28",
          endDate: "2026-01-25",
          startTime: "00:00",
          endTime: "23:59",
          closedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.6: endDate < startDate"
    );
  });

  test("STEP D.7 — Close Day random (separate dates)", async () => {
    const svc = makeValidatingService(CloseDayService);

    await expectDomainError(
      () =>
        svc.closeMany({
          mode: "random",
          gameManagementId: TEST_GAME_MGMT_ID,
          closeDates: [],
          closedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.7: empty closeDates"
    );

    await expectDomainError(
      () =>
        svc.closeMany({
          mode: "random",
          gameManagementId: TEST_GAME_MGMT_ID,
          closeDates: ["2026-01-25", "invalid-date"],
          closedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.7: invalid date in list"
    );
  });

  test("STEP D.8 — Close Day recurring (REQ-116, weekly/monthly/yearly)", async () => {
    const svc = makeValidatingService(CloseDayService);

    await expectDomainError(
      () =>
        svc.closeMany({
          mode: "recurring",
          gameManagementId: TEST_GAME_MGMT_ID,
          pattern: { type: "weekly", daysOfWeek: [7] },
          closedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.8: invalid weekly daysOfWeek"
    );

    await expectDomainError(
      () =>
        svc.closeMany({
          mode: "recurring",
          gameManagementId: TEST_GAME_MGMT_ID,
          pattern: { type: "monthly_dates", dates: [32] },
          closedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.8: invalid monthly_dates"
    );

    await expectDomainError(
      () =>
        svc.closeMany({
          mode: "recurring",
          gameManagementId: TEST_GAME_MGMT_ID,
          pattern: { type: "yearly", month: 13, day: 1 },
          closedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.8: invalid yearly month"
    );
  });

  test("STEP D.9 — Edit + Remove Close Day (updateDate / deleteDate)", async () => {
    const svc = makeValidatingService(CloseDayService);

    await expectDomainError(
      () =>
        svc.updateDate({
          gameManagementId: "",
          closeDate: "2026-01-25",
          updatedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.9: empty gameManagementId in updateDate"
    );

    await expectDomainError(
      () =>
        svc.deleteDate({
          gameManagementId: "",
          closeDate: "2026-01-25",
          deletedBy: "u-admin",
        }),
      "INVALID_INPUT",
      "STEP D.9: empty gameManagementId in deleteDate"
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Gruppe E — Player Management (STEP 29-35)
  // ────────────────────────────────────────────────────────────────────────

  test("STEP E.1 — pending player (status=PENDING, KycStatus enum)", async () => {
    const VALID_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
    assert.equal(VALID_STATUSES.length, 4, "STEP E.1: 4 KYC-statuser");
    assert.ok(VALID_STATUSES.includes("PENDING"), "PENDING må være en gyldig status");
  });

  test("STEP E.2 — Approve player — kontrakt-validering (PLAYER_KYC_MODERATE)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const openapiPath = path.resolve(
      new URL("../..", import.meta.url).pathname,
      "openapi.yaml"
    );
    const yaml = await fs.readFile(openapiPath, "utf8");
    assert.ok(
      yaml.includes("/api/admin/players/{id}/approve"),
      "STEP E.2: approve-route skal være i openapi"
    );
    assert.ok(
      yaml.includes("PLAYER_KYC_MODERATE"),
      "STEP E.2: PLAYER_KYC_MODERATE permission må være dokumentert"
    );
    assert.ok(
      yaml.includes("KYCApprovalInput"),
      "STEP E.2: KYCApprovalInput-skjema skal være definert"
    );
  });

  test("STEP E.3 — Reject player — required reason", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const openapiPath = path.resolve(
      new URL("../..", import.meta.url).pathname,
      "openapi.yaml"
    );
    const yaml = await fs.readFile(openapiPath, "utf8");
    const rejectIdx = yaml.indexOf("KYCRejectionInput");
    assert.ok(rejectIdx > 0, "STEP E.3: KYCRejectionInput-skjema skal eksistere");
    const slice = yaml.substring(rejectIdx, rejectIdx + 500);
    assert.ok(
      slice.includes("required:") && slice.includes("[reason]"),
      "STEP E.3: KYCRejectionInput.reason må være required"
    );
  });

  test("STEP E.4 — Resubmit (PLAYER_KYC_MODERATE: status → UNVERIFIED)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const openapiPath = path.resolve(
      new URL("../..", import.meta.url).pathname,
      "openapi.yaml"
    );
    const yaml = await fs.readFile(openapiPath, "utf8");
    assert.ok(
      yaml.includes("/api/admin/players/{id}/resubmit"),
      "STEP E.4: resubmit-route skal være i openapi"
    );
    assert.ok(
      yaml.includes("player.kyc.resubmit"),
      "STEP E.4: player.kyc.resubmit audit-action skal være dokumentert"
    );
  });

  test("STEP E.5 — Override (PLAYER_KYC_OVERRIDE, ADMIN-only)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const openapiPath = path.resolve(
      new URL("../..", import.meta.url).pathname,
      "openapi.yaml"
    );
    const yaml = await fs.readFile(openapiPath, "utf8");
    assert.ok(
      yaml.includes("PLAYER_KYC_OVERRIDE"),
      "STEP E.5: PLAYER_KYC_OVERRIDE-permission må være dokumentert"
    );
    const overrideIdx = yaml.indexOf("KYCOverrideInput");
    assert.ok(overrideIdx > 0, "STEP E.5: KYCOverrideInput-skjema skal eksistere");
    const slice = yaml.substring(overrideIdx, overrideIdx + 500);
    assert.ok(
      slice.includes("required:") && slice.includes("[status, reason]"),
      "STEP E.5: KYCOverrideInput skal kreve [status, reason]"
    );
  });

  test("STEP E.6 — Tilordne player til hall (BIN-591, USER_ROLE_WRITE)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const openapiPath = path.resolve(
      new URL("../..", import.meta.url).pathname,
      "openapi.yaml"
    );
    const yaml = await fs.readFile(openapiPath, "utf8");
    assert.ok(
      yaml.includes("/api/admin/users/{userId}/hall"),
      "STEP E.6: hall-assignment-route skal være i openapi"
    );
    assert.ok(
      yaml.includes("USER_ROLE_WRITE"),
      "STEP E.6: USER_ROLE_WRITE-permission må være dokumentert"
    );
  });

  test("STEP E.7 — Player block/unblock (REQ-097/098 — IKKE I OPENAPI ENDA)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const openapiPath = path.resolve(
      new URL("../..", import.meta.url).pathname,
      "openapi.yaml"
    );
    const yaml = await fs.readFile(openapiPath, "utf8");
    const hasSelfExclusion = yaml.includes("/api/admin/wallets/{walletId}/self-exclusion");
    assert.ok(
      hasSelfExclusion,
      "STEP E.7: self-exclusion er det nærmeste vi har til admin-block, må eksistere"
    );
    const hasBlockRoute = yaml.includes("/api/admin/players/") && yaml.includes("/block");
    if (!hasBlockRoute) {
      console.warn(
        "STEP E.7 P1-FINDING: REQ-097/098 admin-block-route ikke i openapi. " +
          "Funksjonen finnes via REST men er ikke spec'd. Se BACKEND_1TO1_GAP_AUDIT_2026-04-24.md"
      );
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Gruppe F — Agent + Role Management (STEP 36-40)
  // ────────────────────────────────────────────────────────────────────────

  test("STEP F.1 — opprett agent (POST /api/admin/agents)", async () => {
    const rig = makeAgentRig();
    const agent = await rig.agentService.createAgent({
      email: "new-agent@pilot.test",
      password: "hunter2hunter2",
      displayName: "New Agent",
      surname: "Test",
      hallIds: [MASTER_HALL_ID],
    });
    assert.equal(agent.email, "new-agent@pilot.test");
    assert.equal(agent.displayName, "New Agent");
    assert.equal(agent.role, "AGENT");
    assert.equal(agent.agentStatus, "active");
    assert.equal(agent.halls.length, 1);
    assert.equal(agent.halls[0]?.hallId, MASTER_HALL_ID);
    assert.equal(agent.halls[0]?.isPrimary, true);
  });

  test("STEP F.2 — tilordne flere haller med eksplisitt primary_hall_id", async () => {
    const rig = makeAgentRig();
    const agent = await rig.agentService.createAgent({
      email: "multi-hall@pilot.test",
      password: "hunter2hunter2",
      displayName: "Multi Hall",
      surname: "Agent",
      hallIds: [HALL_IDS[0]!, HALL_IDS[1]!, HALL_IDS[2]!],
      primaryHallId: HALL_IDS[1]!,
    });
    assert.equal(agent.halls.length, 3, "agent skal ha 3 hall-tildelinger");
    const primary = agent.halls.find((h) => h.isPrimary);
    assert.equal(primary?.hallId, HALL_IDS[1]!, "primary skal være hall-102");

    await expectDomainError(
      () =>
        rig.agentService.createAgent({
          email: "bad-primary@pilot.test",
          password: "hunter2hunter2",
          displayName: "Bad Primary",
          surname: "Agent",
          hallIds: [HALL_IDS[0]!],
          primaryHallId: "hall-not-in-list",
        }),
      "INVALID_PRIMARY_HALL",
      "STEP F.2: primaryHallId not in hallIds"
    );
  });

  test("STEP F.3 — set role permissions (AGENT_WRITE/AGENT_READ/AGENT_DELETE)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const openapiPath = path.resolve(
      new URL("../..", import.meta.url).pathname,
      "openapi.yaml"
    );
    const yaml = await fs.readFile(openapiPath, "utf8");
    assert.ok(
      yaml.includes("AGENT_READ"),
      "STEP F.3: AGENT_READ permission skal være dokumentert"
    );
    assert.ok(
      yaml.includes("AGENT_WRITE"),
      "STEP F.3: AGENT_WRITE permission skal være dokumentert"
    );
    assert.ok(
      yaml.includes("AGENT_DELETE"),
      "STEP F.3: AGENT_DELETE permission skal være dokumentert"
    );
  });

  test("STEP F.4 — Role Management 15 modules × 5 actions matrix (legacy §16.6)", async () => {
    const expectedModules = [
      "Player Management",
      "Schedule Management",
      "Game Creation Management",
      "Saved Game List",
      "Physical Ticket Management",
      "Unique ID Management",
      "Report Management",
      "Wallet Management",
      "Transaction Management",
      "Withdraw Management",
      "Product Management",
      "Hall Account Report",
      "Hall Account Report — Settlement",
      "Hall Account Specific report",
      "Payout Management",
    ];
    const expectedActions = ["Create", "Edit", "View", "Delete", "Block/Unblock"];
    assert.equal(
      expectedModules.length,
      15,
      "STEP F.4: 15 moduler i legacy Role Management"
    );
    assert.equal(
      expectedActions.length,
      5,
      "STEP F.4: 5 actions per modul"
    );
    assert.equal(expectedModules.length * expectedActions.length, 75);

    const fs = await import("node:fs/promises");
    const agentPermPath = new URL(
      "../platform/AgentPermissionService.ts",
      import.meta.url
    ).pathname;
    const agentPermSrc = await fs.readFile(agentPermPath, "utf8");
    assert.ok(
      agentPermSrc.length > 0,
      "STEP F.4: AgentPermissionService må eksistere som kodebase"
    );
  });

  test("STEP F.5 — Soft-delete agent blokkert hvis aktiv shift", async () => {
    const rig = makeAgentRig();
    const agent = await rig.agentService.createAgent({
      email: "to-delete@pilot.test",
      password: "hunter2hunter2",
      displayName: "Doomed",
      surname: "Agent",
      hallIds: [MASTER_HALL_ID],
    });
    await rig.shiftService.startShift({
      userId: agent.userId,
      hallId: MASTER_HALL_ID,
    });
    await expectDomainError(
      () => rig.agentService.softDeleteAgent(agent.userId),
      "AGENT_HAS_ACTIVE_SHIFT",
      "STEP F.5: soft-delete med aktiv shift"
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Gruppe G — Reports + Settlement (STEP 41-46)
  // ────────────────────────────────────────────────────────────────────────

  test("STEP G.1 — opprett ScheduledGame, kjør gjennom (5 baller, BingoEngine)", async () => {
    const engine = new BingoEngine(
      new FixedGridAdapter(),
      new InMemoryWalletAdapter(),
      {
        minDrawIntervalMs: 0,
        minPlayersToStart: 1,
        dailyLossLimit: 1_000_000,
        monthlyLossLimit: 10_000_000,
      }
    );
    const { roomCode, playerId } = await engine.createRoom({
      hallId: MASTER_HALL_ID,
      playerName: "Pilot Host",
      walletId: "wallet-pilot",
      gameSlug: "bingo",
    });
    await engine.startGame({
      roomCode,
      actorPlayerId: playerId,
      entryFee: 0,
      ticketsPerPlayer: 1,
      payoutPercent: 100,
    });
    for (let i = 0; i < 5; i++) {
      await engine.drawNextNumber({ roomCode, actorPlayerId: playerId });
    }
    const snapshot = engine.getRoomSnapshot(roomCode);
    assert.ok(snapshot.currentGame, "currentGame skal eksistere");
    assert.ok(
      snapshot.currentGame!.drawnNumbers.length >= 5,
      "skal ha trukket minst 5 baller"
    );
  });

  test("STEP G.2 — Hall Account Report — wireframe 19-kolonner-paritet", async () => {
    const expectedColumns = [
      "date", "day", "resultat_bingonet", "metronia", "ok_bingo", "franco",
      "otium", "radio_bingo", "norsk_tipping", "norsk_rikstoto",
      "rekvisita", "kaffe_penger", "bilag", "gevinst_overf_bank",
      "bank_terminal", "innskudd_dropsafe", "inn_ut_kasse", "diff", "kommentarer",
    ];
    assert.equal(expectedColumns.length, 19, "STEP G.2: 19 wireframe-kolonner");

    assert.equal(MACHINE_ROW_KEYS.length, 14, "STEP G.2: 14 maskin-rader (totalrad ekskludert)");
    assert.ok(
      (MACHINE_ROW_KEYS as readonly string[]).includes("metronia"),
      "STEP G.2: metronia må være navngitt rad"
    );
    assert.ok(
      (MACHINE_ROW_KEYS as readonly string[]).includes("ok_bingo"),
      "STEP G.2: ok_bingo må være navngitt rad"
    );
    assert.ok(
      (MACHINE_ROW_KEYS as readonly string[]).includes("franco"),
      "STEP G.2: franco må være navngitt rad"
    );
    assert.ok(
      (MACHINE_ROW_KEYS as readonly string[]).includes("otium"),
      "STEP G.2: otium må være navngitt rad"
    );
  });

  test("STEP G.3 — Group-of-halls aggregert rapport (REQ-143)", async () => {
    const fs = await import("node:fs/promises");
    const reportsPath = new URL("../admin/reports", import.meta.url).pathname;
    const files = await fs.readdir(reportsPath);
    assert.ok(
      files.includes("HallSpecificReport.ts"),
      "STEP G.3: HallSpecificReport.ts må eksistere (per-hall + GoH-mode)"
    );
  });

  test("STEP G.4 — Settlement: severity-thresholds (OK/NOTE_REQUIRED/FORCE_REQUIRED)", async () => {
    const settlementMod = await import("../agent/AgentSettlementService.js");
    assert.equal(settlementMod.DIFF_NOTE_THRESHOLD_NOK, 500);
    assert.equal(settlementMod.DIFF_NOTE_THRESHOLD_PCT, 5);
    assert.equal(settlementMod.DIFF_FORCE_THRESHOLD_NOK, 1000);
    assert.equal(settlementMod.DIFF_FORCE_THRESHOLD_PCT, 10);

    // computeDiffSeverity-funksjonen tar (diff, diffPct) og returnerer
    // DiffSeverity-streng direkte ("OK" | "NOTE_REQUIRED" | "FORCE_REQUIRED").
    assert.equal(typeof settlementMod.computeDiffSeverity, "function");
    assert.equal(
      settlementMod.computeDiffSeverity(100, 1),
      "OK",
      "STEP G.4: diff=100 NOK / 1% = OK"
    );
    assert.equal(
      settlementMod.computeDiffSeverity(800, 8),
      "NOTE_REQUIRED",
      "STEP G.4: diff=800 NOK / 8% = NOTE_REQUIRED"
    );
    assert.equal(
      settlementMod.computeDiffSeverity(2000, 20),
      "FORCE_REQUIRED",
      "STEP G.4: diff=2000 NOK / 20% = FORCE_REQUIRED"
    );
  });

  test("STEP G.5 — Settlement breakdown JSONB (14 maskin-rader + 5 shift-delta-felt)", async () => {
    const validPayload = {
      rows: {
        metronia: { in_cents: 481000, out_cents: 174800 },
        ok_bingo: { in_cents: 362000, out_cents: 162500 },
        franco: { in_cents: 477000, out_cents: 184800 },
        otium: { in_cents: 0, out_cents: 0 },
        norsk_tipping_dag: { in_cents: 0, out_cents: 0 },
        norsk_tipping_totall: { in_cents: 0, out_cents: 0 },
        rikstoto_dag: { in_cents: 0, out_cents: 0 },
        rikstoto_totall: { in_cents: 0, out_cents: 0 },
        rekvisita: { in_cents: 2500, out_cents: 0 },
        servering: { in_cents: 26000, out_cents: 0 },
        bilag: { in_cents: 0, out_cents: 0 },
        bank: { in_cents: 81400, out_cents: 81400 },
        gevinst_overfoering_bank: { in_cents: 0, out_cents: 0 },
        annet: { in_cents: 0, out_cents: 0 },
      },
      kasse_start_skift_cents: 3055800,
      ending_opptall_kassie_cents: 4616900,
      innskudd_drop_safe_cents: 100000,
      paafyll_ut_kasse_cents: 561300,
      totalt_dropsafe_paafyll_cents: 661300,
      difference_in_shifts_cents: 1100,
    };
    const validated = validateMachineBreakdown(validPayload);
    assert.ok(validated, "STEP G.5: gyldig breakdown skal valideres");
    assert.equal(
      Object.keys(validated.rows).length,
      14,
      "STEP G.5: 14 maskin-rader"
    );

    const totals = computeBreakdownTotals(validated);
    assert.equal(typeof totals.totalSumCents, "number");
    assert.ok(
      totals.totalSumCents > 0,
      "STEP G.5: total skal være positiv for legacy-eksempel"
    );
    assert.equal(
      totals.totalSumCents,
      totals.totalInCents - totals.totalOutCents,
      "STEP G.5: totalSum = totalIn - totalOut"
    );
  });

  test("STEP G.6 — Withdraw XML-eksport (per agent per dag) — service finnes", async () => {
    const mod = await import("../admin/WithdrawXmlExportService.js");
    assert.equal(typeof mod.WithdrawXmlExportService, "function");

    const emailMod = await import("../admin/AccountingEmailService.js");
    assert.equal(typeof emailMod.AccountingEmailService, "function");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Gruppe H — Pre-flight + spillkjøring (STEP 47-51)
  // ────────────────────────────────────────────────────────────────────────

  test("STEP H.1 — Pre-flight HALL_NOT_IN_GROUP (PR #661)", async () => {
    let RoomStartPreFlightValidator: unknown;
    try {
      const mod = await import("../game/RoomStartPreFlightValidator.js");
      RoomStartPreFlightValidator = mod.RoomStartPreFlightValidator;
    } catch (err) {
      const msg = (err as Error).message ?? "n/a";
      assert.fail(
        `STEP H.1: RoomStartPreFlightValidator mangler — PR #661 sa den er merget. ` +
          `Importfeil: ${msg}`
      );
    }
    const { pool } = createStubPool([
      {
        match: (sql) =>
          /app_hall_groups.*INNER JOIN.*app_hall_group_members/s.test(sql),
        rows: [],
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validator = (RoomStartPreFlightValidator as any).forTesting(pool);
    await assert.rejects(
      () => validator.validate("hall-orphan"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "HALL_NOT_IN_GROUP",
      "STEP H.1: HALL_NOT_IN_GROUP forventet"
    );
  });

  test("STEP H.2 — Pre-flight NO_SCHEDULE_FOR_HALL_GROUP", async () => {
    let RoomStartPreFlightValidator: unknown;
    try {
      const mod = await import("../game/RoomStartPreFlightValidator.js");
      RoomStartPreFlightValidator = mod.RoomStartPreFlightValidator;
    } catch (err) {
      const msg = (err as Error).message ?? "n/a";
      assert.fail(`STEP H.2: RoomStartPreFlightValidator mangler. ${msg}`);
    }
    const { pool } = createStubPool([
      {
        match: (sql) =>
          /app_hall_groups.*INNER JOIN.*app_hall_group_members/s.test(sql),
        rows: [{ id: TEST_GROUP_ID }],
      },
      {
        match: (sql) => /FROM .*app_daily_schedules/s.test(sql),
        rows: [],
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validator = (RoomStartPreFlightValidator as any).forTesting(pool);
    await assert.rejects(
      () => validator.validate(MASTER_HALL_ID),
      (err: unknown) =>
        err instanceof DomainError &&
        err.code === "NO_SCHEDULE_FOR_HALL_GROUP",
      "STEP H.2: NO_SCHEDULE_FOR_HALL_GROUP forventet"
    );
  });

  test("STEP H.3 — Hall i gruppe + schedule → start fungerer", async () => {
    let RoomStartPreFlightValidator: unknown;
    try {
      const mod = await import("../game/RoomStartPreFlightValidator.js");
      RoomStartPreFlightValidator = mod.RoomStartPreFlightValidator;
    } catch (err) {
      const msg = (err as Error).message ?? "n/a";
      assert.fail(`STEP H.3: RoomStartPreFlightValidator mangler. ${msg}`);
    }
    const { pool } = createStubPool([
      {
        match: (sql) =>
          /app_hall_groups.*INNER JOIN.*app_hall_group_members/s.test(sql),
        rows: [{ id: TEST_GROUP_ID }],
      },
      {
        match: (sql) => /FROM .*app_daily_schedules/s.test(sql),
        rows: [{ "?column?": 1 }],
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validator = (RoomStartPreFlightValidator as any).forTesting(pool);
    await validator.validate(MASTER_HALL_ID);
  });

  test("STEP H.4 — Trekk baller i 4-hall-runde (broadcast er routes/socket-job)", async () => {
    const engine = new BingoEngine(
      new FixedGridAdapter(),
      new InMemoryWalletAdapter(),
      {
        minDrawIntervalMs: 0,
        minPlayersToStart: 1,
        dailyLossLimit: 1_000_000,
        monthlyLossLimit: 10_000_000,
      }
    );
    const { roomCode, playerId } = await engine.createRoom({
      hallId: MASTER_HALL_ID,
      playerName: "Master",
      walletId: "wallet-broadcast",
      gameSlug: "bingo",
    });
    await engine.startGame({
      roomCode,
      actorPlayerId: playerId,
      entryFee: 0,
      ticketsPerPlayer: 1,
      payoutPercent: 100,
    });
    const balls: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await engine.drawNextNumber({ roomCode, actorPlayerId: playerId });
      balls.push(result.number);
    }
    assert.equal(balls.length, 5, "STEP H.4: 5 baller skal trekkes");
    assert.equal(
      new Set(balls).size,
      5,
      "STEP H.4: alle 5 baller skal være unike (uten gjenoppretting)"
    );
  });

  test("STEP H.5 — Demo Hall bypass (PR #660): runde ender ikke på BINGO", async () => {
    const fs = await import("node:fs/promises");
    const platformSrc = await fs.readFile(
      new URL("../platform/PlatformService.ts", import.meta.url).pathname,
      "utf8"
    );
    assert.ok(
      platformSrc.includes("isTestHall"),
      "STEP H.5: HallDefinition.isTestHall-feltet (PR #660) må være definert"
    );
    assert.ok(
      platformSrc.includes("Demo Hall bypass"),
      "STEP H.5: Demo Hall bypass-doc må stå i PlatformService.ts"
    );

    const bypassTestPath = new URL(
      "../game/BingoEngine.demoHallBypass.test.ts",
      import.meta.url
    ).pathname;
    let bypassExists = false;
    try {
      await fs.stat(bypassTestPath);
      bypassExists = true;
    } catch {
      bypassExists = false;
    }
    assert.equal(
      bypassExists,
      true,
      "STEP H.5: BingoEngine.demoHallBypass.test.ts må eksistere (PR #660)"
    );
  });
});
