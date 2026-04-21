// BIN-587 B4b — tests for unique-id admin pages.
//   - LookupPage: POST /api/admin/unique-ids/check + transactions
//   - ListPage: GET /api/admin/unique-ids?hallId&status
//   - Dispatcher: isUniqueIdRoute + mountUniqueIdRoute

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { setSession, type Session } from "../src/auth/Session.js";
import { renderUniqueIdLookupPage } from "../src/pages/unique-ids/LookupPage.js";
import { renderUniqueIdListPage } from "../src/pages/unique-ids/ListPage.js";
import { isUniqueIdRoute, mountUniqueIdRoute } from "../src/pages/unique-ids/index.js";

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

type JsonResponder = (url: string, init: RequestInit | undefined) => unknown;

function mockApiRouter(routes: Array<{ match: RegExp; handler: JsonResponder }>): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  fn.mockImplementation((url: string, init?: RequestInit) => {
    const route = routes.find((r) => r.match.test(url));
    const body = route ? route.handler(url, init) : { ok: false, error: { code: "NOT_MOCKED", message: url } };
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, data: body }), {
        status: 200,
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

const SAMPLE_TICKET = {
  id: "tix-1",
  batchId: "batch-1",
  uniqueId: "100042",
  hallId: "hall-1",
  status: "SOLD" as const,
  priceCents: 2000,
  assignedGameId: "game-7",
  soldAt: "2026-04-20T10:00:00Z",
  soldBy: "agent-1",
  buyerUserId: null,
  voidedAt: null,
  voidedBy: null,
  voidedReason: null,
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-20T10:00:00Z",
  numbersJson: null,
  patternWon: null,
  wonAmountCents: null,
  evaluatedAt: null,
  isWinningDistributed: false,
  winningDistributedAt: null,
};

describe("UniqueIdLookupPage", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    setSession(adminSession());
  });

  it("renders lookup form", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderUniqueIdLookupPage(root);
    expect(root.querySelector("#lookup-form")).toBeTruthy();
    expect(root.querySelector<HTMLInputElement>("#lookup-uniqueId")).toBeTruthy();
  });

  it("scans id, shows ticket details + events", async () => {
    mockApiRouter([
      {
        match: /\/api\/admin\/unique-ids\/check/,
        handler: () => ({ exists: true, sellable: false, ticket: SAMPLE_TICKET }),
      },
      {
        match: /\/api\/admin\/unique-ids\/100042\/transactions/,
        handler: () => ({
          uniqueId: "100042",
          currentStatus: "SOLD",
          events: [
            { at: "2026-04-19T00:00:00Z", event: "CREATED", actor: null, details: {} },
            { at: "2026-04-20T10:00:00Z", event: "SOLD", actor: "agent-1", details: {} },
          ],
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderUniqueIdLookupPage(root);
    root.querySelector<HTMLInputElement>("#lookup-uniqueId")!.value = "100042";
    root.querySelector<HTMLFormElement>("#lookup-form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await tick();
    expect(root.textContent).toContain("100042");
    expect(root.textContent).toContain("CREATED");
    expect(root.textContent).toContain("SOLD");
  });

  it("shows not-found alert when check returns exists=false", async () => {
    mockApiRouter([
      {
        match: /\/api\/admin\/unique-ids\/check/,
        handler: () => ({ exists: false, sellable: false, ticket: null }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderUniqueIdLookupPage(root);
    root.querySelector<HTMLInputElement>("#lookup-uniqueId")!.value = "999";
    root.querySelector<HTMLFormElement>("#lookup-form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await tick();
    expect(root.textContent).toContain("ikke funnet");
  });
});

describe("UniqueIdListPage", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    setSession(operatorSession());
  });

  it("loads tickets for operator's hall", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/unique-ids/,
        handler: () => ({ tickets: [SAMPLE_TICKET], count: 1 }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderUniqueIdListPage(root);
    await tick();
    expect(api.mock.calls.some(([u]) => String(u).includes("hallId=hall-1"))).toBe(true);
    expect(root.textContent).toContain("100042");
  });

  it("filters by status", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/unique-ids/,
        handler: () => ({ tickets: [], count: 0 }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderUniqueIdListPage(root);
    await tick();
    const statusSelect = root.querySelector<HTMLSelectElement>("#filterStatus")!;
    statusSelect.value = "SOLD";
    statusSelect.dispatchEvent(new Event("change"));
    await tick();
    expect(api.mock.calls.some(([u]) => String(u).includes("status=SOLD"))).toBe(true);
  });
});

describe("unique-ids dispatcher", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    setSession(operatorSession());
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    mockApiRouter([
      { match: /./, handler: () => ({ tickets: [], count: 0, halls: [] }) },
    ]);
  });

  it("matches the 2 declared routes", () => {
    expect(isUniqueIdRoute("/uniqueId")).toBe(true);
    expect(isUniqueIdRoute("/uniqueIdList")).toBe(true);
    expect(isUniqueIdRoute("/other")).toBe(false);
  });

  it("dispatches to LookupPage", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountUniqueIdRoute(root, "/uniqueId");
    await tick();
    expect(root.querySelector("#lookup-form")).toBeTruthy();
  });

  it("dispatches to ListPage", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountUniqueIdRoute(root, "/uniqueIdList");
    await tick();
    expect(root.querySelector("#unique-ids-table")).toBeTruthy();
  });
});
