// PR-B4 (BIN-646) — tests for admin-payments + admin-security-emails +
// admin-wallets API-wrappers. Verifiserer URL-konstruksjon, query-parse,
// HTTP-method, body-serialisering og auth-header.
//
// Dekker:
//   - listPaymentRequests (type, status, statuses-CSV, destinationType, hallId, limit)
//   - acceptPaymentRequest + rejectPaymentRequest (POST + JSON-body)
//   - listWithdrawEmails + addWithdrawEmail + deleteWithdrawEmail
//   - listWallets + getWallet + listWalletTransactions
//   - Fail-closed: ApiError propagerer på non-ok response

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiError } from "../src/api/client.js";
import {
  listPaymentRequests,
  acceptPaymentRequest,
  rejectPaymentRequest,
} from "../src/api/admin-payments.js";
import {
  listWithdrawEmails,
  addWithdrawEmail,
  deleteWithdrawEmail,
} from "../src/api/admin-security-emails.js";
import {
  listWallets,
  getWallet,
  listWalletTransactions,
} from "../src/api/admin-wallets.js";

type FetchCall = { url: string; init: RequestInit | undefined };

function mockJson(data: unknown, status = 200): typeof fetch {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    void url;
    void init;
    return new Response(JSON.stringify({ ok: status < 400, data }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn;
  return fn;
}

function mockError(code: string, message: string, status = 400): typeof fetch {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify({ ok: false, error: { code, message } }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn;
  return fn;
}

function captureCall(fn: typeof fetch): FetchCall {
  const call = (fn as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls[0];
  return { url: String(call![0]), init: call![1] };
}

const SAMPLE_REQUEST = {
  id: "req-1",
  kind: "withdraw" as const,
  userId: "u1",
  walletId: "w1",
  amountCents: 50000,
  hallId: "hall-1",
  submittedBy: "op-1",
  status: "PENDING" as const,
  rejectionReason: null,
  acceptedBy: null,
  acceptedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  walletTransactionId: null,
  destinationType: "bank" as const,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

beforeEach(() => {
  window.localStorage.setItem("bingo_admin_access_token", "tok");
});

describe("admin-payments.listPaymentRequests", () => {
  it("serialises all filter params incl. statuses-CSV", async () => {
    const fn = mockJson({ requests: [SAMPLE_REQUEST] });
    const res = await listPaymentRequests({
      type: "withdraw",
      statuses: ["ACCEPTED", "REJECTED"],
      destinationType: "bank",
      hallId: "hall-1",
      limit: 200,
    });
    const call = captureCall(fn);
    expect(call.url).toContain("/api/admin/payments/requests?");
    expect(call.url).toContain("type=withdraw");
    expect(call.url).toContain("statuses=ACCEPTED%2CREJECTED");
    expect(call.url).toContain("destinationType=bank");
    expect(call.url).toContain("hallId=hall-1");
    expect(call.url).toContain("limit=200");
    expect(res.requests).toHaveLength(1);
  });

  it("omits query string when no params", async () => {
    const fn = mockJson({ requests: [] });
    await listPaymentRequests();
    const call = captureCall(fn);
    expect(call.url).toBe("/api/admin/payments/requests");
  });

  it("sends Authorization header", async () => {
    const fn = mockJson({ requests: [] });
    await listPaymentRequests();
    const call = captureCall(fn);
    const headers = call.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("propagates ApiError on non-ok", async () => {
    mockError("FORBIDDEN", "nope", 403);
    await expect(listPaymentRequests()).rejects.toBeInstanceOf(ApiError);
  });

  it("prefers status when both status and statuses provided", async () => {
    // Both set: wrapper emits both, backend prefers statuses per PR-B4 c1
    // contract. This test pins the wrapper behaviour (emits both).
    const fn = mockJson({ requests: [] });
    await listPaymentRequests({ status: "PENDING", statuses: ["ACCEPTED"] });
    const call = captureCall(fn);
    expect(call.url).toContain("status=PENDING");
    expect(call.url).toContain("statuses=ACCEPTED");
  });
});

describe("admin-payments.acceptPaymentRequest", () => {
  it("POSTs with type + paymentType in body", async () => {
    const fn = mockJson({ request: { ...SAMPLE_REQUEST, status: "ACCEPTED" } });
    await acceptPaymentRequest("req-1", { type: "deposit", paymentType: "cash" });
    const call = captureCall(fn);
    expect(call.url).toBe("/api/admin/payments/requests/req-1/accept");
    expect(call.init!.method).toBe("POST");
    expect(JSON.parse(String(call.init!.body))).toEqual({
      type: "deposit",
      paymentType: "cash",
    });
  });

  it("encodes request id", async () => {
    const fn = mockJson({ request: SAMPLE_REQUEST });
    await acceptPaymentRequest("req/with/slash", { type: "withdraw" });
    const call = captureCall(fn);
    expect(call.url).toBe("/api/admin/payments/requests/req%2Fwith%2Fslash/accept");
  });
});

describe("admin-payments.rejectPaymentRequest", () => {
  it("POSTs with reason + type", async () => {
    const fn = mockJson({ request: { ...SAMPLE_REQUEST, status: "REJECTED" } });
    await rejectPaymentRequest("req-1", { type: "withdraw", reason: "Duplicate" });
    const call = captureCall(fn);
    expect(call.url).toBe("/api/admin/payments/requests/req-1/reject");
    expect(call.init!.method).toBe("POST");
    expect(JSON.parse(String(call.init!.body))).toEqual({
      type: "withdraw",
      reason: "Duplicate",
    });
  });

  it("propagates backend ApiError for invalid reason", async () => {
    mockError("INVALID_INPUT", "reason required", 400);
    await expect(
      rejectPaymentRequest("req-1", { type: "withdraw", reason: "" })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("admin-security-emails", () => {
  it("listWithdrawEmails issues GET", async () => {
    const fn = mockJson({ emails: [], count: 0 });
    await listWithdrawEmails();
    const call = captureCall(fn);
    expect(call.url).toBe("/api/admin/security/withdraw-emails");
    expect(call.init?.method ?? "GET").toBe("GET");
  });

  it("addWithdrawEmail POSTs body", async () => {
    const fn = mockJson({
      id: "e1",
      email: "x@y.no",
      label: "Revisor",
      addedBy: "admin",
      createdAt: "2026-04-19T00:00:00Z",
    });
    await addWithdrawEmail({ email: "x@y.no", label: "Revisor" });
    const call = captureCall(fn);
    expect(call.url).toBe("/api/admin/security/withdraw-emails");
    expect(call.init!.method).toBe("POST");
    expect(JSON.parse(String(call.init!.body))).toEqual({
      email: "x@y.no",
      label: "Revisor",
    });
  });

  it("deleteWithdrawEmail DELETEs with encoded id", async () => {
    const fn = mockJson({ deleted: true });
    await deleteWithdrawEmail("id with spaces");
    const call = captureCall(fn);
    expect(call.url).toBe("/api/admin/security/withdraw-emails/id%20with%20spaces");
    expect(call.init!.method).toBe("DELETE");
  });

  it("surfaces WITHDRAW_EMAIL_EXISTS code for duplicate", async () => {
    mockError("WITHDRAW_EMAIL_EXISTS", "duplicate", 409);
    await expect(
      addWithdrawEmail({ email: "dup@example.no" })
    ).rejects.toMatchObject({ code: "WITHDRAW_EMAIL_EXISTS" });
  });
});

describe("admin-wallets", () => {
  it("listWallets GETs /api/wallets", async () => {
    const fn = mockJson([]);
    await listWallets();
    const call = captureCall(fn);
    expect(call.url).toBe("/api/wallets");
  });

  it("getWallet encodes walletId", async () => {
    const fn = mockJson({
      account: { id: "w1", balance: 0, createdAt: "", updatedAt: "" },
      transactions: [],
    });
    await getWallet("wallet/1");
    const call = captureCall(fn);
    expect(call.url).toBe("/api/wallets/wallet%2F1");
  });

  it("listWalletTransactions includes limit query", async () => {
    const fn = mockJson([]);
    await listWalletTransactions("w1", 50);
    const call = captureCall(fn);
    expect(call.url).toBe("/api/wallets/w1/transactions?limit=50");
  });

  it("listWalletTransactions defaults limit to 100", async () => {
    const fn = mockJson([]);
    await listWalletTransactions("w1");
    const call = captureCall(fn);
    expect(call.url).toContain("limit=100");
  });
});
