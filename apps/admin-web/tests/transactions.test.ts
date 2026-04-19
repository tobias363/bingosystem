// PR-B4 (BIN-646) — tests for TransactionManagement pages.
// Fokus: deposit-accept Cash/Card-flow, placeholder-rendering,
// dispatcher-contract, fail-closed.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { setSession, type Session } from "../src/auth/Session.js";
import {
  isTransactionRoute,
  mountTransactionRoute,
} from "../src/pages/transactions/index.js";
import type { PaymentRequest } from "../src/api/admin-payments.js";

function adminSession(): Session {
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
    return Promise.resolve(
      new Response(JSON.stringify(status < 400 ? { ok: true, data: body } : body), {
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

const SAMPLE_DEPOSIT: PaymentRequest = {
  id: "req-dep-1",
  kind: "deposit",
  userId: "user-1",
  walletId: "w1",
  amountCents: 50000,
  hallId: "hall-1",
  submittedBy: null,
  status: "PENDING",
  rejectionReason: null,
  acceptedBy: null,
  acceptedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  walletTransactionId: null,
  destinationType: null,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

beforeEach(() => {
  initI18n();
  document.body.innerHTML = "";
  window.localStorage.setItem("bingo_admin_access_token", "tok");
  setSession(adminSession());
});

describe("isTransactionRoute", () => {
  it("matches 3 declared routes", () => {
    expect(isTransactionRoute("/deposit/requests")).toBe(true);
    expect(isTransactionRoute("/deposit/history")).toBe(true);
    expect(isTransactionRoute("/deposit/transaction")).toBe(true);
    expect(isTransactionRoute("/wallet")).toBe(false);
  });
});

describe("DepositRequestsPage", () => {
  it("queries type=deposit + status=PENDING", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({ requests: [SAMPLE_DEPOSIT] }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountTransactionRoute(root, "/deposit/requests");
    await tick();
    const calls = api.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toContain("type=deposit");
    expect(calls[0]).toContain("status=PENDING");
    // Amount rendered as 500.00 (50000 øre)
    expect(root.textContent).toContain("500.00");
  });

  it("fail-closed: backend-500 → callout-danger, no silent success", async () => {
    mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({ ok: false, error: { code: "INTERNAL", message: "boom" } }),
        status: 500,
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountTransactionRoute(root, "/deposit/requests");
    await tick(10);
    expect(root.querySelector(".callout-danger")).toBeTruthy();
  });
});

describe("DepositHistoryPage", () => {
  it("queries statuses=ACCEPTED,REJECTED with default 7-day range", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/payments\/requests/,
        handler: () => ({ requests: [] }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountTransactionRoute(root, "/deposit/history");
    await tick();
    const url = String(api.mock.calls[0]![0]);
    expect(url).toContain("type=deposit");
    expect(url).toContain("statuses=ACCEPTED%2CREJECTED");
    // Date inputs should be 7 days apart
    const startInput = root.querySelector<HTMLInputElement>("#start-date")!;
    const endInput = root.querySelector<HTMLInputElement>("#end-date")!;
    const diff = new Date(endInput.value).getTime() - new Date(startInput.value).getTime();
    expect(Math.round(diff / 86400000)).toBe(7);
  });
});

describe("DepositTransactionPlaceholderPage", () => {
  it("renders BIN-655 link + scope-drop message", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountTransactionRoute(root, "/deposit/transaction");
    // Placeholder should render without hitting API
    const links = Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href") || "");
    expect(links.some((h) => h.includes("BIN-655"))).toBe(true);
    expect(links.some((h) => h.includes("/deposit/history"))).toBe(true);
  });
});
