// BIN-587/638/640/641/639 — tests for physical-tickets admin pages.
// Covers:
//   - AddPage: admin hall filter, list render, create POST, delete modal, generate.
//   - CashOutPage: BIN-640 scan + cashout flow.
//   - GameTicketListPage: BIN-638 games-in-hall + BIN-639 reward-all.
//   - CheckBingoPage: BIN-641 stamp flow.
//   - Dispatcher: isPhysicalTicketsRoute + mountPhysicalTicketsRoute.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { setSession, type Session } from "../src/auth/Session.js";
import { renderAddPage } from "../src/pages/physical-tickets/AddPage.js";
import { renderCashOutPage } from "../src/pages/physical-tickets/CashOutPage.js";
import { renderGameTicketListPage } from "../src/pages/physical-tickets/GameTicketListPage.js";
import { renderCheckBingoPage } from "../src/pages/physical-tickets/CheckBingoPage.js";
import { isPhysicalTicketsRoute, mountPhysicalTicketsRoute } from "../src/pages/physical-tickets/index.js";

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

const SAMPLE_BATCH = {
  id: "batch-1",
  hallId: "hall-1",
  batchName: "Rød billett mai",
  rangeStart: 100001,
  rangeEnd: 100500,
  defaultPriceCents: 2000,
  gameSlug: null,
  assignedGameId: null,
  status: "DRAFT" as const,
  createdBy: "u1",
  createdAt: "2026-04-19T00:00:00Z",
  updatedAt: "2026-04-19T00:00:00Z",
};

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
  numbersJson: null as number[] | null,
  patternWon: null as "row_1" | "row_2" | "row_3" | "row_4" | "full_house" | null,
  wonAmountCents: null as number | null,
  evaluatedAt: null as string | null,
  isWinningDistributed: false,
  winningDistributedAt: null as string | null,
};

describe("physical-tickets AddPage (admin)", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    setSession(adminSession());
  });

  it("requires hall selection before listing batches", async () => {
    const api = mockApiRouter([
      { match: /\/api\/admin\/halls/, handler: () => ({ halls: [{ id: "hall-1", name: "Oslo", isActive: true }] }) },
      { match: /\/api\/admin\/physical-tickets\/batches/, handler: () => ({ batches: [], count: 0 }) },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderAddPage(root);
    await tick();
    const calls = api.mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes("/api/admin/halls"))).toBe(true);
    expect(root.textContent).toContain("Velg hall");
  });

  it("loads batches when hall is selected", async () => {
    const api = mockApiRouter([
      { match: /\/api\/admin\/halls/, handler: () => ({ halls: [{ id: "hall-1", name: "Oslo", isActive: true }] }) },
      {
        match: /\/api\/admin\/physical-tickets\/batches/,
        handler: () => ({ batches: [SAMPLE_BATCH], count: 1 }),
      },
      {
        match: /\/last-registered-id/,
        handler: () => ({ hallId: "hall-1", lastUniqueId: "100000", lastBatchId: null }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderAddPage(root);
    await tick();
    const select = root.querySelector<HTMLSelectElement>("#hallId")!;
    select.value = "hall-1";
    select.dispatchEvent(new Event("change"));
    await tick();
    expect(api.mock.calls.some(([u]) => String(u).includes("hallId=hall-1"))).toBe(true);
    expect(root.textContent).toContain("Rød billett mai");
    expect(root.textContent).toContain("Utkast");
  });
});

describe("physical-tickets AddPage (operator)", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    setSession(operatorSession());
  });

  it("locks to operator's hall and fetches batches immediately", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/physical-tickets\/batches/,
        handler: () => ({ batches: [SAMPLE_BATCH], count: 1 }),
      },
      {
        match: /\/last-registered-id/,
        handler: () => ({ hallId: "hall-1", lastUniqueId: "100000", lastBatchId: null }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderAddPage(root);
    await tick();
    const hallRow = root.querySelector<HTMLElement>("#hall-row");
    expect(hallRow?.style.display).toBe("none");
    expect(api.mock.calls.some(([u]) => String(u).includes("hallId=hall-1"))).toBe(true);
    expect(root.textContent).toContain("Rød billett mai");
  });

  it("submits create-batch POST with expected payload", async () => {
    let createBody: unknown = null;
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/physical-tickets\/batches$/,
        handler: (_url, init) => {
          if (init?.method === "POST") {
            createBody = JSON.parse(String(init.body));
            return SAMPLE_BATCH;
          }
          return { batches: [], count: 0 };
        },
      },
      {
        match: /\/api\/admin\/physical-tickets\/batches\?/,
        handler: () => ({ batches: [], count: 0 }),
      },
      {
        match: /\/last-registered-id/,
        handler: () => ({ hallId: "hall-1", lastUniqueId: null, lastBatchId: null }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderAddPage(root);
    await tick();
    root.querySelector<HTMLInputElement>("#batchName")!.value = "Blå mai";
    root.querySelector<HTMLInputElement>("#rangeStart")!.value = "1";
    root.querySelector<HTMLInputElement>("#rangeEnd")!.value = "500";
    root.querySelector<HTMLInputElement>("#defaultPrice")!.value = "20";
    const form = root.querySelector<HTMLFormElement>("#batch-form")!;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await tick();
    const postCalls = api.mock.calls.filter(([, init]) => (init as RequestInit)?.method === "POST");
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
    expect(createBody).toMatchObject({
      hallId: "hall-1",
      batchName: "Blå mai",
      rangeStart: 1,
      rangeEnd: 500,
      defaultPriceCents: 2000,
    });
  });
});

describe("CashOutPage (BIN-640)", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    setSession(adminSession());
  });

  it("renders a scan form", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCashOutPage(root);
    expect(root.querySelector("#scan-form")).toBeTruthy();
    expect(root.querySelector<HTMLInputElement>("#scan-uniqueId")).toBeTruthy();
  });

  it("scans uniqueId and shows cashout form when SOLD and not cashed-out", async () => {
    mockApiRouter([
      {
        match: /\/api\/admin\/unique-ids\/check/,
        handler: () => ({ exists: true, sellable: false, ticket: SAMPLE_TICKET }),
      },
      {
        match: /\/api\/admin\/physical-tickets\/100042\/cashout$/,
        handler: () => ({
          uniqueId: "100042",
          status: "SOLD",
          cashedOut: false,
          cashout: null,
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCashOutPage(root);
    root.querySelector<HTMLInputElement>("#scan-uniqueId")!.value = "100042";
    const form = root.querySelector<HTMLFormElement>("#scan-form")!;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await tick();
    expect(root.textContent).toContain("100042");
    expect(root.querySelector("#cashout-form")).toBeTruthy();
  });

  it("submits cashout POST with cents", async () => {
    let postBody: unknown = null;
    mockApiRouter([
      {
        match: /\/api\/admin\/unique-ids\/check/,
        handler: () => ({ exists: true, sellable: false, ticket: SAMPLE_TICKET }),
      },
      {
        match: /\/api\/admin\/physical-tickets\/100042\/cashout$/,
        handler: (_url, init) => {
          if (init?.method === "POST") {
            postBody = JSON.parse(String(init.body));
            return { cashout: { id: "co-1", ticketUniqueId: "100042", hallId: "hall-1", gameId: "game-7", payoutCents: 15000, paidBy: "u1", paidAt: "2026-04-20T10:05:00Z", notes: null, otherData: {} }, ticket: { ...SAMPLE_TICKET } };
          }
          return { uniqueId: "100042", status: "SOLD", cashedOut: false, cashout: null };
        },
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCashOutPage(root);
    root.querySelector<HTMLInputElement>("#scan-uniqueId")!.value = "100042";
    root.querySelector<HTMLFormElement>("#scan-form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await tick();
    const amount = root.querySelector<HTMLInputElement>("#cashout-amount")!;
    amount.value = "150";
    const cashoutForm = root.querySelector<HTMLFormElement>("#cashout-form")!;
    cashoutForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await tick();
    expect(postBody).toMatchObject({ payoutCents: 15000 });
  });

  it("shows ticket-not-found alert if check says missing", async () => {
    mockApiRouter([
      {
        match: /\/api\/admin\/unique-ids\/check/,
        handler: () => ({ exists: false, sellable: false, ticket: null }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCashOutPage(root);
    root.querySelector<HTMLInputElement>("#scan-uniqueId")!.value = "999";
    root.querySelector<HTMLFormElement>("#scan-form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await tick();
    expect(root.textContent).toContain("ikke funnet");
  });
});

describe("GameTicketListPage (BIN-638/639)", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    setSession(operatorSession());
  });

  it("loads games-in-hall for operator's hall immediately", async () => {
    const api = mockApiRouter([
      {
        match: /\/api\/admin\/physical-tickets\/games\/in-hall/,
        handler: () => ({
          generatedAt: "2026-04-20T00:00:00Z",
          hallId: "hall-1",
          from: null,
          to: null,
          rows: [
            {
              gameId: "game-7",
              name: "Kveld 1",
              status: "ACTIVE",
              sold: 10,
              pendingCashoutCount: 2,
              ticketsInPlay: 2,
              cashedOut: 1,
              totalRevenueCents: 20000,
            },
          ],
          totals: {
            sold: 10,
            pendingCashoutCount: 2,
            ticketsInPlay: 2,
            cashedOut: 1,
            totalRevenueCents: 20000,
            rowCount: 1,
          },
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderGameTicketListPage(root);
    await tick();
    expect(api.mock.calls.some(([u]) => String(u).includes("hallId=hall-1"))).toBe(true);
    expect(root.textContent).toContain("Kveld 1");
  });

  it("shows empty-hall callout when admin has no hall selected", async () => {
    setSession(adminSession());
    mockApiRouter([
      { match: /\/api\/admin\/halls/, handler: () => ({ halls: [] }) },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderGameTicketListPage(root);
    await tick();
    expect(root.textContent).toContain("Velg hall");
  });
});

describe("CheckBingoPage (BIN-641)", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    setSession(adminSession());
  });

  it("renders form with 25-cell grid", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCheckBingoPage(root);
    expect(root.querySelector("#check-bingo-form")).toBeTruthy();
    const cells = root.querySelectorAll<HTMLInputElement>("#cb-grid input[data-idx]");
    expect(cells.length).toBe(25);
    // Centre cell is readOnly = 0.
    expect(cells[12]?.value).toBe("0");
    expect(cells[12]?.readOnly).toBe(true);
  });

  it("posts numbers[] + gameId and shows result", async () => {
    let postBody: unknown = null;
    mockApiRouter([
      {
        match: /\/api\/admin\/physical-tickets\/100042\/check-bingo/,
        handler: (_url, init) => {
          postBody = JSON.parse(String(init?.body ?? "{}"));
          return {
            uniqueId: "100042",
            gameId: "game-7",
            gameStatus: "ENDED",
            hasWon: true,
            winningPattern: "row_1",
            matchedNumbers: [1, 2, 3, 4, 5],
            drawnNumbersCount: 10,
            payoutEligible: true,
            alreadyEvaluated: false,
            evaluatedAt: "2026-04-20T11:00:00Z",
            wonAmountCents: null,
            isWinningDistributed: false,
          };
        },
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCheckBingoPage(root);
    root.querySelector<HTMLInputElement>("#cb-uniqueId")!.value = "100042";
    root.querySelector<HTMLInputElement>("#cb-gameId")!.value = "game-7";
    const cells = root.querySelectorAll<HTMLInputElement>("#cb-grid input[data-idx]");
    cells.forEach((cell, i) => {
      if (i !== 12) cell.value = String(i + 1);
    });
    root.querySelector<HTMLFormElement>("#check-bingo-form")!.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true })
    );
    await tick();
    expect(postBody).toMatchObject({ gameId: "game-7" });
    expect((postBody as { numbers: number[] }).numbers.length).toBe(25);
    expect((postBody as { numbers: number[] }).numbers[12]).toBe(0);
    expect(root.textContent).toContain("Bingo");
  });
});

describe("physical-tickets route dispatcher", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    setSession(operatorSession());
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    mockApiRouter([
      { match: /./, handler: () => ({ batches: [], count: 0, halls: [], rows: [], totals: { sold: 0, pendingCashoutCount: 0, ticketsInPlay: 0, cashedOut: 0, totalRevenueCents: 0, rowCount: 0 } }) },
    ]);
  });

  it("matches the 4 declared routes", () => {
    expect(isPhysicalTicketsRoute("/addPhysicalTickets")).toBe(true);
    expect(isPhysicalTicketsRoute("/physicalTicketManagement")).toBe(true);
    expect(isPhysicalTicketsRoute("/physical/cash-out")).toBe(true);
    expect(isPhysicalTicketsRoute("/physical/check-bingo")).toBe(true);
    expect(isPhysicalTicketsRoute("/something-else")).toBe(false);
  });

  it("dispatches to AddPage", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountPhysicalTicketsRoute(root, "/addPhysicalTickets");
    await tick();
    expect(root.querySelector("#batch-form")).toBeTruthy();
  });

  it("dispatches to CashOutPage", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountPhysicalTicketsRoute(root, "/physical/cash-out");
    expect(root.querySelector("#scan-form")).toBeTruthy();
  });

  it("dispatches to GameTicketListPage", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountPhysicalTicketsRoute(root, "/physicalTicketManagement");
    expect(root.querySelector("#games-table")).toBeTruthy();
  });

  it("dispatches to CheckBingoPage", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountPhysicalTicketsRoute(root, "/physical/check-bingo");
    expect(root.querySelector("#check-bingo-form")).toBeTruthy();
  });
});
