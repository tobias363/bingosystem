/**
 * BIN-603: Integration tests for the Swedbank webhook HMAC guard on
 * POST /api/payments/swedbank/callback.
 *
 * Wires a minimal express app with the same `express.json` verify-hook
 * used in production (so `req.rawBody` is available to the router) and
 * drives the handler via fetch() against a random-port server.
 *
 * Covers:
 *   - valid signature → 200 + processCallback called
 *   - invalid signature → 401 + processCallback NOT called
 *   - missing signature header → 401 + processCallback NOT called
 *   - empty webhook secret (mis-configured) → 503 + processCallback NOT called
 *   - body tampering → 401 (proves we verify over raw bytes)
 */

import assert from "node:assert/strict";
import test, { describe, beforeEach, afterEach } from "node:test";
import http from "node:http";
import express from "express";
import { createHmac } from "node:crypto";
import { createPaymentsRouter } from "../payments.js";
import { SWEDBANK_SIGNATURE_HEADER } from "../../payments/swedbankSignature.js";

const WEBHOOK_SECRET = "test-webhook-secret-987654321";

interface TestHarness {
  baseUrl: string;
  close: () => Promise<void>;
  swedbankCalls: Array<{ payload: unknown }>;
  emittedWalletIds: string[];
}

function buildHarness(opts: { webhookSecret?: string } = {}): Promise<TestHarness> {
  const secret = opts.webhookSecret ?? WEBHOOK_SECRET;
  const swedbankCalls: Array<{ payload: unknown }> = [];
  const emittedWalletIds: string[] = [];

  // Minimal mock of SwedbankPayService — only the method the handler uses.
  const swedbankPayService = {
    processCallback: async (payload: unknown) => {
      swedbankCalls.push({ payload });
      return {
        intent: { walletId: "wallet-alice" },
        walletCreditedNow: true,
      } as never;
    },
  };

  // platformService isn't touched on the webhook path — stub is enough.
  const platformService = {} as never;

  const app = express();
  // Mirror the production wiring from index.ts so req.rawBody is populated.
  app.use((req, _res, next) => {
    express.json({
      verify: (rawReq, _rawRes, buf) => {
        (rawReq as unknown as { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })(req, _res, next);
  });
  app.use(
    createPaymentsRouter({
      platformService,
      swedbankPayService: swedbankPayService as never,
      emitWalletRoomUpdates: async (ids) => {
        emittedWalletIds.push(...ids);
      },
      swedbankWebhookSecret: secret,
    }),
  );

  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        baseUrl: `http://localhost:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
        swedbankCalls,
        emittedWalletIds,
      });
    });
  });
}

function signBody(rawBody: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${hex}`;
}

async function postCallback(
  harness: TestHarness,
  rawBody: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${harness.baseUrl}/api/payments/swedbank/callback`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

describe("BIN-603 Swedbank webhook HMAC guard", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await buildHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  test("valid signature → 200, processCallback called with parsed body", async () => {
    const body = JSON.stringify({
      paymentOrder: { id: "/psp/paymentorders/abc-123" },
      orderReference: "TOPUP-valid",
    });
    const res = await postCallback(harness, body, {
      [SWEDBANK_SIGNATURE_HEADER]: signBody(body, WEBHOOK_SECRET),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true });
    assert.equal(harness.swedbankCalls.length, 1, "processCallback must be called exactly once");
    assert.equal(harness.emittedWalletIds[0], "wallet-alice", "wallet-update must be broadcast");
  });

  test("invalid signature (wrong secret) → 401, processCallback NOT called", async () => {
    const body = JSON.stringify({ orderReference: "TOPUP-invalid-secret" });
    const res = await postCallback(harness, body, {
      [SWEDBANK_SIGNATURE_HEADER]: signBody(body, "an-attacker-guess"),
    });

    assert.equal(res.status, 401);
    assert.equal((res.json as { ok: boolean }).ok, false);
    assert.equal((res.json as { error: { code: string } }).error.code, "INVALID_SIGNATURE");
    assert.equal(harness.swedbankCalls.length, 0, "processCallback must NOT be reached");
  });

  test("missing signature header → 401", async () => {
    const body = JSON.stringify({ orderReference: "TOPUP-no-header" });
    const res = await postCallback(harness, body, {});

    assert.equal(res.status, 401);
    assert.equal((res.json as { error: { code: string } }).error.code, "INVALID_SIGNATURE");
    assert.equal(harness.swedbankCalls.length, 0);
  });

  test("body tampering after signing → 401 (proves verify uses raw bytes)", async () => {
    const originalBody = JSON.stringify({ orderReference: "TOPUP-original" });
    const signature = signBody(originalBody, WEBHOOK_SECRET);
    // Attacker flips one field after obtaining a legit signature.
    const tamperedBody = originalBody.replace("TOPUP-original", "TOPUP-evil");

    const res = await postCallback(harness, tamperedBody, {
      [SWEDBANK_SIGNATURE_HEADER]: signature,
    });

    assert.equal(res.status, 401);
    assert.equal(harness.swedbankCalls.length, 0);
  });

  test("malformed signature header (non-hex) → 401", async () => {
    const body = JSON.stringify({ orderReference: "TOPUP-bad-header" });
    const res = await postCallback(harness, body, {
      [SWEDBANK_SIGNATURE_HEADER]: "sha256=not-a-hex-digest",
    });

    assert.equal(res.status, 401);
    assert.equal(harness.swedbankCalls.length, 0);
  });

  test("bare-hex signature (no sha256= prefix) is accepted", async () => {
    // Defensive support for providers that don't prefix; also tested at
    // unit level but here we confirm the wiring path works end-to-end.
    const body = JSON.stringify({ orderReference: "TOPUP-bare-hex" });
    const bareHex = createHmac("sha256", WEBHOOK_SECRET).update(body, "utf8").digest("hex");
    const res = await postCallback(harness, body, {
      [SWEDBANK_SIGNATURE_HEADER]: bareHex,
    });

    assert.equal(res.status, 200);
    assert.equal(harness.swedbankCalls.length, 1);
  });

  test("empty SWEDBANK_WEBHOOK_SECRET → 503 (fail-closed mis-configuration)", async () => {
    await harness.close();
    harness = await buildHarness({ webhookSecret: "" });

    const body = JSON.stringify({ orderReference: "TOPUP-no-secret" });
    const res = await postCallback(harness, body, {
      [SWEDBANK_SIGNATURE_HEADER]: signBody(body, "anything"),
    });

    assert.equal(res.status, 503);
    assert.equal((res.json as { error: { code: string } }).error.code, "WEBHOOK_NOT_CONFIGURED");
    assert.equal(harness.swedbankCalls.length, 0, "processCallback must never run when secret is unset");
  });
});
