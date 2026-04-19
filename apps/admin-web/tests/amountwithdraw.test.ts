// PR-B4 (BIN-646) — tests for Amountwithdraw pages + PaymentActionModal.
// Fokus: regulatorisk fail-closed, permission-gating, route-dispatcher,
// modal accept/reject POST-body verifisering (AuditLog-forbindelse
// bekreftes på backend-side; frontend-test asserterer at riktig request
// sendes).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { setSession, type Session } from "../src/auth/Session.js";
import {
  isAmountwithdrawRoute,
  mountAmountwithdrawRoute,
} from "../src/pages/amountwithdraw/index.js";
import { openPaymentActionModal } from "../src/pages/amountwithdraw/modals/PaymentActionModal.js";
import type { PaymentRequest } from "../src/api/admin-payments.js";

function adminSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "u1",
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
    isSuperAdmin: true,
    avatar: "",
    hall: [],
    dailyBalance: null,
    permissions: {},
    ...overrides,
  };
}

function operatorSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "u2",
    name: "Operator",
    email: "op@example.com",
    role: "agent",
    isSuperAdmin: false,
    avatar: "",
    hall: [{ id: "hall-1", name: "Oslo Sentrum" }],
    dailyBalance: null,
    permissions: {},
    ...overrides,
  };
}

function mockApiRouter(
  routes: Array<{ match: RegExp; handler: (url: string, init: RequestInit | undefined) => unknown; status?: number }>
): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  fn.mockImplementation((url: string, init?: RequestInit) => {
    const route = routes.find((r) => r.match.test(url));
    if (!route) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: false, error: { code: "NOT_MOCKED", message: url } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    const body = route.handler(url, init);
    const status = route.status ?? 200;
    const ok = status < 400;
    return Promise.resolve(
      new Response(JSON.stringify(ok ? { ok: true, data: body } : body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

async function tick(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

const SAMPLE_WITHDRAW: PaymentRequest = {
  id: "req-bank-1",
  kind: "withdraw",
  userId: "user-1",
  walletId: "w1",
  amountCents: 150000,
  hallId: "hall-1",
  submittedBy: "op-1",
  status: "PENDING",
  rejectionReason: null,
  acceptedBy: null,
  acceptedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  walletTransactionId: null,
  destinationType: "bank",
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

beforeEach(() => {
  initI18n();
  document.body.innerHTML = "";
  window.localStorage.setItem("bingo_admin_access_token", "tok");
});

describe("isAmountwithdrawRoute", () => {
  it("matches all 5 declared routes", () => {
    expect(isAmountwithdrawRoute("/withdraw/requests/bank")).toBe(true);
    expect(isAmountwithdrawRoute("/withdraw/requests/hall")).toBe(true);
    expect(isAmountwithdrawRoute("/withdraw/history/bank")).toBe(true);
    expect(isAmountwithdrawRoute("/withdraw/history/hall")).toBe(true);
    expect(isAmountwithdrawRoute("/withdraw/list/emails")).toBe(true);
    expect(isAmountwithdrawRoute("/something-else")).toBe(false);
  });
});

describe("RequestsPage (bank)", () => {
  beforeEach(() => setSession(adminSession()));

  it("filters list call with destinationType=bank + status=PENDING", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({ requests: [SAMPLE_WITHDRAW] }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAmountwithdrawRoute(root, "/withdraw/requests/bank");
    await tick();
    const calls = api.mock.calls.map((c) => String(c[0]));
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall).toContain("type=withdraw");
    expect(firstCall).toContain("status=PENDING");
    expect(firstCall).toContain("destinationType=bank");
    expect(root.textContent).toContain("1500.00");
  });

  it("renders hall-request with no bankAccount column", async () => {
    mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({
          requests: [{ ...SAMPLE_WITHDRAW, destinationType: "hall" }],
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAmountwithdrawRoute(root, "/withdraw/requests/hall");
    await tick();
    const headers = Array.from(root.querySelectorAll("th")).map((th) => th.textContent || "");
    // hall-variant: ingen bank_account_number-kolonne
    expect(headers.some((h) => h.includes("Bankkonto"))).toBe(false);
  });

  it("fail-closed: backend 500 → callout-danger shown, no blank table", async () => {
    mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({ ok: false, error: { code: "INTERNAL", message: "boom" } }),
        status: 500,
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAmountwithdrawRoute(root, "/withdraw/requests/bank");
    await tick(10);
    expect(root.querySelector(".callout-danger")).toBeTruthy();
  });

  it("HALL_OPERATOR without PAYMENT_REQUEST_WRITE sees no action buttons", async () => {
    setSession(
      operatorSession({
        permissions: { "Withdraw Management": { view: true, add: false, edit: false, delete: false } },
      })
    );
    mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({ requests: [SAMPLE_WITHDRAW] }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAmountwithdrawRoute(root, "/withdraw/requests/bank");
    await tick();
    // No accept/reject buttons should appear in table body
    const acceptBtns = root.querySelectorAll("[data-action='accept']");
    expect(acceptBtns.length).toBe(0);
  });
});

describe("HistoryPage", () => {
  beforeEach(() => setSession(adminSession()));

  it("queries with statuses=ACCEPTED,REJECTED for bank-history", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({ requests: [] }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAmountwithdrawRoute(root, "/withdraw/history/bank");
    await tick();
    const calls = api.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toContain("statuses=ACCEPTED%2CREJECTED");
    expect(calls[0]).toContain("destinationType=bank");
  });

  it("default date-range is set to last 7 days", async () => {
    mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({ requests: [] }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAmountwithdrawRoute(root, "/withdraw/history/hall");
    await tick();
    const startInput = root.querySelector<HTMLInputElement>("#start-date");
    const endInput = root.querySelector<HTMLInputElement>("#end-date");
    expect(startInput?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endInput?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // end - start = 7 days
    const diffMs = new Date(endInput!.value).getTime() - new Date(startInput!.value).getTime();
    expect(Math.round(diffMs / 86400000)).toBe(7);
  });
});

describe("EmailsPage", () => {
  beforeEach(() => setSession(adminSession()));

  it("GETs /api/admin/security/withdraw-emails on mount", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/security\/withdraw-emails/,
        handler: () => ({ emails: [], count: 0 }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAmountwithdrawRoute(root, "/withdraw/list/emails");
    await tick();
    expect(
      api.mock.calls.some(([u]) => String(u).includes("/api/admin/security/withdraw-emails"))
    ).toBe(true);
  });

  it("renders add-button only when canWrite", async () => {
    setSession(
      operatorSession({
        permissions: { "Withdraw Management": { view: true, add: false, edit: false, delete: false } },
      })
    );
    mockApiRouter([
      {
        match: /withdraw-emails/,
        handler: () => ({ emails: [], count: 0 }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAmountwithdrawRoute(root, "/withdraw/list/emails");
    await tick();
    expect(root.querySelector("[data-action='add']")).toBeNull();
  });
});

describe("PaymentActionModal", () => {
  beforeEach(() => setSession(adminSession()));

  it("withdraw-accept POSTs type=withdraw, audit footer rendered", async () => {
    let acceptBody: unknown = null;
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests\/.+\/accept/,
        handler: (_url, init) => {
          acceptBody = JSON.parse(String(init?.body));
          return { request: { ...SAMPLE_WITHDRAW, status: "ACCEPTED" } };
        },
      },
    ]);
    openPaymentActionModal({ kind: "withdraw-accept", request: SAMPLE_WITHDRAW });
    await tick();
    const confirm = document.querySelector<HTMLButtonElement>("[data-action='confirm']");
    expect(confirm).toBeTruthy();
    // Audit footer should include actor-label (session.name)
    expect(document.body.textContent).toContain("Admin");
    confirm!.click();
    await tick(8);
    expect(acceptBody).toEqual({ type: "withdraw" });
    expect(api).toHaveBeenCalled();
  });

  it("deposit-accept sends paymentType=cash by default", async () => {
    let acceptBody: unknown = null;
    mockApiRouter([
      {
        match: /\/accept/,
        handler: (_url, init) => {
          acceptBody = JSON.parse(String(init?.body));
          return { request: SAMPLE_WITHDRAW };
        },
      },
    ]);
    openPaymentActionModal({
      kind: "deposit-accept",
      request: { ...SAMPLE_WITHDRAW, kind: "deposit", destinationType: null },
    });
    await tick();
    document.querySelector<HTMLButtonElement>("[data-action='confirm']")!.click();
    await tick(8);
    expect(acceptBody).toEqual({ type: "deposit", paymentType: "cash" });
  });

  it("deposit-accept picks up card radio selection", async () => {
    let acceptBody: unknown = null;
    mockApiRouter([
      {
        match: /\/accept/,
        handler: (_url, init) => {
          acceptBody = JSON.parse(String(init?.body));
          return { request: SAMPLE_WITHDRAW };
        },
      },
    ]);
    openPaymentActionModal({
      kind: "deposit-accept",
      request: { ...SAMPLE_WITHDRAW, kind: "deposit", destinationType: null },
    });
    await tick();
    const card = document.querySelector<HTMLInputElement>("input[name='paymentType'][value='card']");
    expect(card).toBeTruthy();
    card!.checked = true;
    document.querySelector<HTMLButtonElement>("[data-action='confirm']")!.click();
    await tick(8);
    expect(acceptBody).toMatchObject({ paymentType: "card" });
  });

  it("withdraw-reject requires reason; empty reason blocks POST (fail-closed)", async () => {
    const api = mockApiRouter([
      {
        match: /\/reject/,
        handler: () => ({ request: SAMPLE_WITHDRAW }),
      },
    ]);
    openPaymentActionModal({ kind: "withdraw-reject", request: SAMPLE_WITHDRAW });
    await tick();
    // Do not fill reason → click confirm → POST should NOT fire
    document.querySelector<HTMLButtonElement>("[data-action='confirm']")!.click();
    await tick(8);
    expect(api).not.toHaveBeenCalled();
    // Fill reason and try again
    const textarea = document.querySelector<HTMLTextAreaElement>("#reject-reason")!;
    textarea.value = "duplicate";
    document.querySelector<HTMLButtonElement>("[data-action='confirm']")!.click();
    await tick(8);
    expect(api).toHaveBeenCalled();
    const [, init] = api.mock.calls[0] as [string, RequestInit | undefined];
    expect(JSON.parse(String(init!.body))).toEqual({ type: "withdraw", reason: "duplicate" });
  });

  it("backend-500 keeps modal open (fail-closed, no silent success)", async () => {
    mockApiRouter([
      {
        match: /\/accept/,
        handler: () => ({ ok: false, error: { code: "INTERNAL", message: "boom" } }),
        status: 500,
      },
    ]);
    openPaymentActionModal({ kind: "withdraw-accept", request: SAMPLE_WITHDRAW });
    await tick();
    const modalBefore = document.querySelector(".modal");
    expect(modalBefore).toBeTruthy();
    document.querySelector<HTMLButtonElement>("[data-action='confirm']")!.click();
    await tick(10);
    // Modal must still be present after the 500
    const modalAfter = document.querySelector(".modal");
    expect(modalAfter).toBeTruthy();
  });
});
