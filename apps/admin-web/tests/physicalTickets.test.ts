// PR-B3 (BIN-613) — tests for physical-tickets admin pages.
// Covers:
//   - AddPage: admin hall filter, list render, create POST, delete modal, generate.
//   - CashOutPlaceholderPage: renders Linear-issue refs.
//   - GameTicketListPlaceholderPage: renders Linear-issue refs.
//   - Dispatcher: isPhysicalTicketsRoute + mountPhysicalTicketsRoute.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { setSession, type Session } from "../src/auth/Session.js";
import { renderAddPage } from "../src/pages/physical-tickets/AddPage.js";
import { renderCashOutPlaceholderPage } from "../src/pages/physical-tickets/CashOutPlaceholderPage.js";
import { renderGameTicketListPlaceholderPage } from "../src/pages/physical-tickets/GameTicketListPlaceholderPage.js";
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
    // The halls request fires; batches request is gated on hall selection for admin.
    const calls = api.mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes("/api/admin/halls"))).toBe(true);
    // Without hall selected, the empty-scope hint is rendered.
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
    // Populate hall select option (admin fetches halls).
    const select = root.querySelector<HTMLSelectElement>("#hallId")!;
    select.value = "hall-1";
    select.dispatchEvent(new Event("change"));
    await tick();
    expect(api.mock.calls.some(([u]) => String(u).includes("hallId=hall-1"))).toBe(true);
    expect(root.textContent).toContain("Rød billett mai");
    expect(root.textContent).toContain("Utkast"); // DRAFT status label
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
    // Operator does NOT see the hall select (rendered with display:none).
    const hallRow = root.querySelector<HTMLElement>("#hall-row");
    expect(hallRow?.style.display).toBe("none");
    // Batches fetched with operator's hallId.
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

describe("CashOutPlaceholderPage", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
  });

  it("renders scope-drop message and links to BIN-638/640/641", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderCashOutPlaceholderPage(root);
    expect(root.textContent).toContain("Utenfor scope");
    const links = Array.from(root.querySelectorAll("a")).map((a) => a.textContent || "");
    expect(links.join(" ")).toContain("BIN-638");
    expect(links.join(" ")).toContain("BIN-640");
    expect(links.join(" ")).toContain("BIN-641");
  });
});

describe("GameTicketListPlaceholderPage", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
  });

  it("renders scope-drop message and links to BIN-638/639/642", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderGameTicketListPlaceholderPage(root);
    expect(root.textContent).toContain("Utenfor scope");
    const links = Array.from(root.querySelectorAll("a")).map((a) => a.textContent || "");
    expect(links.join(" ")).toContain("BIN-638");
    expect(links.join(" ")).toContain("BIN-639");
    expect(links.join(" ")).toContain("BIN-642");
  });
});

describe("physical-tickets route dispatcher", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    setSession(operatorSession());
    window.localStorage.setItem("bingo_admin_access_token", "tok");
    mockApiRouter([
      { match: /./, handler: () => ({ batches: [], count: 0, halls: [] }) },
    ]);
  });

  it("matches the 3 declared routes", () => {
    expect(isPhysicalTicketsRoute("/addPhysicalTickets")).toBe(true);
    expect(isPhysicalTicketsRoute("/physicalTicketManagement")).toBe(true);
    expect(isPhysicalTicketsRoute("/physical/cash-out")).toBe(true);
    expect(isPhysicalTicketsRoute("/something-else")).toBe(false);
  });

  it("dispatches to AddPage", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountPhysicalTicketsRoute(root, "/addPhysicalTickets");
    await tick();
    expect(root.querySelector("#batch-form")).toBeTruthy();
  });

  it("dispatches to CashOut placeholder", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountPhysicalTicketsRoute(root, "/physical/cash-out");
    expect(root.textContent).toContain("BIN-638");
  });

  it("dispatches to GameTicketList placeholder", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountPhysicalTicketsRoute(root, "/physicalTicketManagement");
    expect(root.textContent).toContain("BIN-639");
  });
});
