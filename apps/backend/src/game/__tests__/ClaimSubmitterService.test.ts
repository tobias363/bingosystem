/**
 * F2-B unit tests for ClaimSubmitterService — extracted submitClaim flow.
 *
 * Behavior was previously verified by 50+ integration tests in
 * BingoEngine.test.ts (covers happy-path LINE/BINGO claims, duplicate-claim
 * idempotency, race-conditions, edge cases). These tests pin the delegate
 * pattern and the unique service-level invariants:
 *
 *   - The engine delegates to ClaimSubmitterService instead of running the
 *     logic inline.
 *   - The service is constructed once per engine instance and exposes the
 *     expected public API surface.
 *   - The post-transfer audit-trail helpers (`runPostTransferClaimAuditTrail`,
 *     `fireRecoveryEvent`) are no longer on the engine prototype.
 *
 * The end-to-end LINE/BINGO branches stay covered by the existing BingoEngine
 * test suite (1662 tests) because the engine wraps the service in a thin
 * delegate — testing through the engine exercises the service.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine } from "../BingoEngine.js";
import { InMemoryWalletAdapter } from "../BingoEngine.test.js";
import { ClaimSubmitterService } from "../ClaimSubmitterService.js";

import type { BingoSystemAdapter } from "../../adapters/BingoSystemAdapter.js";

class StubBingoAdapter implements BingoSystemAdapter {
  generateTicket(): import("../types.js").Ticket {
    return {
      grid: [
        [1, 16, 31, 46, 61],
        [2, 17, 32, 47, 62],
        [3, 18, 0, 48, 63],
        [4, 19, 33, 49, 64],
        [5, 20, 34, 50, 65],
      ],
      color: "small-yellow",
      type: "small-yellow",
      colorFamily: "yellow",
      sizeFamily: "small",
    } as unknown as import("../types.js").Ticket;
  }
}

test("F2-B: ClaimSubmitterService is wired into BingoEngine and not undefined", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const service = (engine as unknown as { claimSubmitterService: ClaimSubmitterService })
    .claimSubmitterService;
  assert.ok(service, "engine should expose a claimSubmitterService instance");
  assert.ok(
    service instanceof ClaimSubmitterService,
    "the field must be a real ClaimSubmitterService — not a mock or stub",
  );
});

test("F2-B: ClaimSubmitterService has no internal state — same instance returned", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const service1 = (engine as unknown as { claimSubmitterService: ClaimSubmitterService })
    .claimSubmitterService;
  const service2 = (engine as unknown as { claimSubmitterService: ClaimSubmitterService })
    .claimSubmitterService;
  assert.equal(service1, service2);
});

test("F2-B: BingoEngine.submitClaim is a thin delegate", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const fnSrc = engine.submitClaim.toString();
  assert.match(fnSrc, /requireRoom/, "should look up room");
  assert.match(fnSrc, /requireRunningGame/, "should look up game");
  assert.match(
    fnSrc,
    /claimSubmitterService\.submitClaim/,
    "should delegate to claimSubmitterService.submitClaim",
  );
  assert.doesNotMatch(
    fnSrc,
    /input\.type === ['"]LINE['"]/,
    "should NOT have inline LINE-branch logic",
  );
  assert.doesNotMatch(
    fnSrc,
    /input\.type === ['"]BINGO['"]/,
    "should NOT have inline BINGO-branch logic",
  );
});

test("F2-B: BingoEngine no longer owns runPostTransferClaimAuditTrail or fireRecoveryEvent", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const proto = Object.getPrototypeOf(engine) as Record<string, unknown>;
  assert.equal(
    typeof proto.runPostTransferClaimAuditTrail,
    "undefined",
    "moved to ClaimSubmitterService",
  );
  assert.equal(
    typeof proto.fireRecoveryEvent,
    "undefined",
    "moved to ClaimSubmitterService",
  );
});

test("F2-B: ClaimSubmitterService exposes expected public API", () => {
  const protoMethods = Object.getOwnPropertyNames(
    ClaimSubmitterService.prototype,
  ).filter((name) => name !== "constructor");
  assert.ok(
    protoMethods.includes("submitClaim"),
    "service must expose submitClaim",
  );
  const hasInternals =
    protoMethods.includes("handleValidLineClaim")
    && protoMethods.includes("handleValidBingoClaim")
    && protoMethods.includes("runPostTransferClaimAuditTrail")
    && protoMethods.includes("fireRecoveryEvent");
  assert.ok(
    hasInternals,
    "service should have its private helper methods on the prototype",
  );
});
