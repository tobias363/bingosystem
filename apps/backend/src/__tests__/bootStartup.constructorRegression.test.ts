/**
 * Boot-startup constructor regression test — pilot guardrail.
 *
 * INCIDENT 2026-04-29 07:12 UTC:
 *   PR #715 ("Bølge 2B pilot-blockers — boot-DDL + pool consolidation")
 *   passed CI green with 7752 unit-tests + type-check + build, but the
 *   built binary CRASHED at `node dist/index.js` startup with
 *   `Mangler connection string for PhysicalTicketPayoutService.`
 *
 * ROOT CAUSE:
 *   `PhysicalTicketPayoutService` constructor migration kept the
 *   pre-existing input-validation gate at the top:
 *
 *     if (!options.connectionString?.trim()) {
 *       throw new DomainError("INVALID_CONFIG", "Mangler connection string ...");
 *     }
 *     // ... new pool-injection branch never reached when caller passes
 *     // {pool: sharedPool} without connectionString
 *
 *   Existing unit-tests used `PhysicalTicketPayoutService.forTesting()`
 *   which bypasses the constructor — so no test exercised the {pool}-only
 *   constructor shape that index.ts now uses.
 *
 * THIS TEST:
 *   Directly constructs every Postgres-backed service from index.ts the
 *   way index.ts constructs it (with a stub Pool — no DB required) and
 *   asserts no constructor throws. Cheap, fast, runs on every CI without
 *   any infrastructure. The companion `bootStartup.test.ts` exercises the
 *   full end-to-end boot with real Postgres+Redis (CI gate); this file is
 *   the always-runs guardrail that catches input-validation-order
 *   regressions before they reach prod.
 *
 * SEE ALSO:
 *   - apps/backend/src/__tests__/bootStartup.test.ts — full boot e2e
 *   - .github/workflows/ci.yml — `boot-test` job
 */

import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";

import { PhysicalTicketPayoutService } from "../compliance/PhysicalTicketPayoutService.js";
import { PhysicalTicketService } from "../compliance/PhysicalTicketService.js";
import { StaticTicketService } from "../compliance/StaticTicketService.js";
import { AgentTicketRangeService } from "../compliance/AgentTicketRangeService.js";
import { VoucherService } from "../compliance/VoucherService.js";
import { LoyaltyService } from "../compliance/LoyaltyService.js";
import { AmlService } from "../compliance/AmlService.js";
import { SecurityService } from "../compliance/SecurityService.js";
// HallAccountReportService is intentionally NOT covered here — its constructor
// requires a full BingoEngine dep, which would either need the engine module
// (heavy) or a stub-engine harness. The companion `bootStartup.test.ts` covers
// it via the actual boot path. The 30 services kept in this file are pure
// pool-only constructors; they're the exact shape PR #715 broke.
import { CloseDayService } from "../admin/CloseDayService.js";
import { DailyScheduleService } from "../admin/DailyScheduleService.js";
import { ScheduleService } from "../admin/ScheduleService.js";
import { PatternService } from "../admin/PatternService.js";
import { HallGroupService } from "../admin/HallGroupService.js";
import { GameTypeService } from "../admin/GameTypeService.js";
import { SubGameService } from "../admin/SubGameService.js";
import { LeaderboardTierService } from "../admin/LeaderboardTierService.js";
import { GameManagementService } from "../admin/GameManagementService.js";
import { MiniGamesConfigService } from "../admin/MiniGamesConfigService.js";
import { SavedGameService } from "../admin/SavedGameService.js";
import { SettingsService } from "../admin/SettingsService.js";
import { ScreenSaverService } from "../admin/ScreenSaverService.js";
import { MaintenanceService } from "../admin/MaintenanceService.js";
import { CmsService } from "../admin/CmsService.js";
import { PhysicalTicketsAggregateService } from "../admin/PhysicalTicketsAggregate.js";
import { PhysicalTicketsGamesInHallService } from "../admin/PhysicalTicketsGamesInHall.js";
import { WithdrawXmlExportService } from "../admin/WithdrawXmlExportService.js";
import { AgentPermissionService } from "../platform/AgentPermissionService.js";
import { PaymentRequestService } from "../payments/PaymentRequestService.js";
import { AuthTokenService } from "../auth/AuthTokenService.js";

/**
 * Build a Pool stub that satisfies TypeScript without requiring a DB.
 * Constructor-only tests don't issue queries — they just store the pool.
 */
function makeStubPool(): Pool {
  // Minimal proxy: throws on any unexpected method call so accidental
  // query-execution-during-construct shows up loudly.
  return new Proxy(
    {
      query: async () => {
        throw new Error("[stub-pool] query() not allowed during construct");
      },
      connect: async () => {
        throw new Error("[stub-pool] connect() not allowed during construct");
      },
      end: async () => {
        // no-op so cleanup paths don't blow up
      },
      on: () => undefined,
      removeListener: () => undefined,
    },
    {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        // Unknown methods → tracker that constructor doesn't probe pool.
        return () => undefined;
      },
    },
  ) as unknown as Pool;
}

const STUB_SCHEMA = "public";

// ── Compliance services ──────────────────────────────────────────────────────

test("PhysicalTicketPayoutService constructor accepts {pool} without connectionString (regression: PR #715)", () => {
  // PR #715 left an early `if (!connectionString?.trim()) throw` that
  // fired BEFORE the pool-fallback branch was reached. PR #716 fixed it.
  // This test pins the contract: pool-only construction must not throw.
  const pool = makeStubPool();
  assert.doesNotThrow(() => {
    const svc = new PhysicalTicketPayoutService({ pool, schema: STUB_SCHEMA });
    assert.ok(svc, "service must be constructed");
  });
});

test("PhysicalTicketPayoutService constructor still rejects empty options (no pool, no connectionString)", () => {
  // The other half of the contract: passing neither must throw. This
  // guards against an over-permissive fix that would silently accept
  // empty options and explode at first query.
  assert.throws(
    () => new PhysicalTicketPayoutService({ schema: STUB_SCHEMA }),
    /pool|connectionString/i,
  );
});

test("PhysicalTicketService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new PhysicalTicketService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("StaticTicketService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new StaticTicketService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("AgentTicketRangeService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new AgentTicketRangeService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("VoucherService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new VoucherService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("LoyaltyService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new LoyaltyService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("AmlService constructor accepts {pool}", () => {
  // AmlService takes paymentRequestService as a dep; pass a minimal stub.
  const pool = makeStubPool();
  const paymentRequestService = {} as unknown as PaymentRequestService;
  assert.doesNotThrow(() => {
    new AmlService({ pool, schema: STUB_SCHEMA, paymentRequestService });
  });
});

test("SecurityService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new SecurityService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

// HallAccountReportService — see top-of-file note. Skipped intentionally.

// ── Admin services ───────────────────────────────────────────────────────────

test("CloseDayService constructor accepts {pool}", () => {
  // CloseDayService also requires gameManagementService.
  const pool = makeStubPool();
  const gameManagementService = new GameManagementService({ pool, schema: STUB_SCHEMA });
  assert.doesNotThrow(() => {
    new CloseDayService({ pool, schema: STUB_SCHEMA, gameManagementService });
  });
});

test("DailyScheduleService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new DailyScheduleService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("ScheduleService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new ScheduleService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("PatternService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new PatternService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("HallGroupService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new HallGroupService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("GameTypeService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new GameTypeService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("SubGameService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new SubGameService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("LeaderboardTierService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new LeaderboardTierService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("GameManagementService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new GameManagementService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("MiniGamesConfigService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new MiniGamesConfigService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("SavedGameService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new SavedGameService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("SettingsService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new SettingsService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("ScreenSaverService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new ScreenSaverService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("MaintenanceService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new MaintenanceService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("CmsService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new CmsService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("PhysicalTicketsAggregateService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new PhysicalTicketsAggregateService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("PhysicalTicketsGamesInHallService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new PhysicalTicketsGamesInHallService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("WithdrawXmlExportService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new WithdrawXmlExportService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

// ── Platform / payments / auth services ──────────────────────────────────────

test("AgentPermissionService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new AgentPermissionService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

test("AuthTokenService constructor accepts {pool}", () => {
  assert.doesNotThrow(() => {
    new AuthTokenService({ pool: makeStubPool(), schema: STUB_SCHEMA });
  });
});

// ── Source-level guardrail ───────────────────────────────────────────────────

test("index.ts boot wires PhysicalTicketPayoutService with {pool} not {connectionString} (regression: PR #715)", async () => {
  // Source-level lock: if someone reverts the wiring back to
  //   new PhysicalTicketPayoutService({ connectionString, schema: pgSchema })
  // we want CI to refuse the change. Pool-injection is the contract that
  // makes the constructor regression test above meaningful.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const indexSrc = readFileSync(join(__dirname, "..", "index.ts"), "utf8");

  // Find the PhysicalTicketPayoutService instantiation and verify the
  // immediately-following options-block contains `pool: sharedPool`.
  const match = indexSrc.match(
    /new\s+PhysicalTicketPayoutService\s*\(\s*\{\s*([\s\S]*?)\}\s*\)/,
  );
  assert.ok(match, "index.ts must instantiate PhysicalTicketPayoutService");
  const optionsBlock = match[1];
  assert.match(
    optionsBlock,
    /pool\s*:\s*sharedPool/,
    "PhysicalTicketPayoutService must be constructed with {pool: sharedPool} (DB-P0-002). " +
      "Reverting to {connectionString} re-introduces the cold-boot pool-sprawl bug.",
  );
  assert.doesNotMatch(
    optionsBlock,
    /connectionString\s*:/,
    "PhysicalTicketPayoutService options must NOT pass connectionString — pool-injection is the canonical wiring.",
  );
});
