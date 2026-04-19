// PR-B4 (BIN-646) — tests for walletManagement pages.
// Fokus: list renders with view-btn, detail reads hashParam("id"),
// fail-closed på backend-error.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { setSession, type Session } from "../src/auth/Session.js";
import { isWalletRoute, mountWalletRoute } from "../src/pages/wallets/index.js";

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

beforeEach(() => {
  initI18n();
  document.body.innerHTML = "";
  window.location.hash = "";
  window.localStorage.setItem("bingo_admin_access_token", "tok");
  setSession(adminSession());
});

describe("isWalletRoute", () => {
  it("matches 2 declared routes", () => {
    expect(isWalletRoute("/wallet")).toBe(true);
    expect(isWalletRoute("/wallet/view")).toBe(true);
    expect(isWalletRoute("/deposit/requests")).toBe(false);
  });
});

describe("WalletListPage", () => {
  it("GETs /api/wallets and renders view-buttons", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/wallets$/,
        handler: () => [
          { id: "w1", balance: 25000, createdAt: "2026-04-19T00:00:00Z", updatedAt: "2026-04-19T00:00:00Z" },
          { id: "w2", balance: 50000, createdAt: "2026-04-19T00:00:00Z", updatedAt: "2026-04-19T00:00:00Z" },
        ],
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet");
    await tick();
    expect(api.mock.calls.length).toBeGreaterThanOrEqual(1);
    // 2 view-knapper, en per rad
    const viewLinks = Array.from(root.querySelectorAll("a")).filter((a) =>
      (a.getAttribute("href") ?? "").startsWith("#/wallet/view")
    );
    expect(viewLinks.length).toBe(2);
    expect(viewLinks[0]!.getAttribute("href")).toContain("id=w1");
    expect(root.textContent).toContain("250.00");
    expect(root.textContent).toContain("500.00");
  });

  it("fail-closed: error → callout-danger shown", async () => {
    mockApiRouter([
      {
        match: /\/api\/wallets/,
        handler: () => ({ ok: false, error: { code: "INTERNAL", message: "boom" } }),
        status: 500,
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet");
    await tick(10);
    expect(root.querySelector(".callout-danger")).toBeTruthy();
  });
});

describe("WalletViewPage", () => {
  it("reads hashParam id and fetches /api/wallets/:id", async () => {
    window.location.hash = "#/wallet/view?id=wallet-42";
    const api = mockApiRouter([
      {
        match: /\/api\/wallets\/wallet-42$/,
        handler: () => ({
          account: {
            id: "wallet-42",
            balance: 99900,
            createdAt: "2026-04-19T00:00:00Z",
            updatedAt: "2026-04-19T00:00:00Z",
          },
          transactions: [
            {
              id: "tx1",
              accountId: "wallet-42",
              type: "TOPUP",
              amount: 10000,
              reason: "Deposit",
              createdAt: "2026-04-19T01:00:00Z",
            },
          ],
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick();
    expect(api.mock.calls.some(([u]) => String(u).endsWith("/api/wallets/wallet-42"))).toBe(true);
    expect(root.textContent).toContain("wallet-42");
    expect(root.textContent).toContain("999.00"); // balance rendered
    expect(root.textContent).toContain("TOPUP"); // transaction row
  });

  it("fail-closed when id missing: callout + no fetch", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/wallets/,
        handler: () => ({ account: { id: "", balance: 0, createdAt: "", updatedAt: "" }, transactions: [] }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick(8);
    expect(root.querySelector(".callout-danger")).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });
});
