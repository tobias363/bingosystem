// Agent-portal Check-for-Bingo + Physical Cashout (P0 pilot-blokker).
//
// Tester at begge sidene rendrer riktig skjema, kaller backend-endpointene
// med riktig body, og håndterer resultat-popup med 5×5-grid + vinnende
// mønstre + reward-knapper.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { setSession, type Session } from "../src/auth/Session.js";
import { mountAgentCheckForBingo } from "../src/pages/agent-portal/AgentCheckForBingoPage.js";
// Note: mountAgentPhysicalCashout-import fjernet 2026-04-28 — alle 3
// AgentPhysicalCashoutPage-tester er skip'et inntil ny vy (PR #670) får
// dedikert test-suite. Se test-bodies for detaljer.

function agentSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "ag-1",
    name: "Agent Test",
    email: "agent@test.no",
    role: "agent",
    isSuperAdmin: false,
    avatar: "",
    hall: [{ id: "hall-a", name: "Test Hall" }],
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
      }),
    );
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

async function tick(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

describe("AgentCheckForBingoPage", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    setSession(agentSession());
    window.localStorage.setItem("bingo_admin_access_token", "tok");
  });

  it("rendrer skjema med 25-celle-grid (senter readOnly = 0)", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountAgentCheckForBingo(root);
    expect(root.querySelector("#agent-cb-form")).toBeTruthy();
    expect(root.querySelector("#agent-cb-uniqueId")).toBeTruthy();
    expect(root.querySelector("#agent-cb-gameId")).toBeTruthy();
    const cells = root.querySelectorAll<HTMLInputElement>("#agent-cb-grid input[data-idx]");
    expect(cells.length).toBe(25);
    expect(cells[12]?.value).toBe("0");
    expect(cells[12]?.readOnly).toBe(true);
  });

  it("poster uniqueId + gameId + numbers[25] til /api/agent/bingo/check", async () => {
    let postBody: unknown = null;
    let capturedUrl = "";
    mockApiRouter([
      {
        match: /\/api\/agent\/bingo\/check/,
        handler: (url, init) => {
          capturedUrl = url;
          postBody = JSON.parse(String(init?.body ?? "{}"));
          return {
            uniqueId: "100042",
            gameId: "game-7",
            gameStatus: "ENDED",
            hasWon: true,
            winningPattern: "row_1",
            winningPatterns: ["row_1"],
            matchedCellIndexes: [0, 1, 2, 3, 4, 12],
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
    mountAgentCheckForBingo(root);
    root.querySelector<HTMLInputElement>("#agent-cb-uniqueId")!.value = "100042";
    root.querySelector<HTMLInputElement>("#agent-cb-gameId")!.value = "game-7";
    const cells = root.querySelectorAll<HTMLInputElement>("#agent-cb-grid input[data-idx]");
    cells.forEach((cell, i) => {
      if (i !== 12) cell.value = String(i + 1);
    });
    root.querySelector<HTMLFormElement>("#agent-cb-form")!.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    );
    await tick();
    expect(capturedUrl).toContain("/api/agent/bingo/check");
    const body = postBody as { uniqueId: string; gameId: string; numbers: number[] };
    expect(body.uniqueId).toBe("100042");
    expect(body.gameId).toBe("game-7");
    expect(body.numbers.length).toBe(25);
    expect(body.numbers[12]).toBe(0);
    // Resultat-popup åpnet med "Bingo"-tekst.
    expect(document.body.textContent).toContain("Bingo");
  });
});

describe("AgentPhysicalCashoutPage", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    setSession(agentSession());
    window.localStorage.setItem("bingo_admin_access_token", "tok");
  });

  // Test-debt 2026-04-28: PR #670 (BIN-FOLLOWUP-13 — Physical Cashout 5×5
  // pattern popup + Reward All) erstatte hele AgentPhysicalCashoutPage med
  // en ny daily-list-vy som laster fra current-shift via getCurrentShift()
  // i stedet for å kreve game-id-skjema som input. Det gamle kontraktet
  // (`#agent-cashout-form`, `#agent-cashout-gameId`, submit → POST
  // /api/agent/physical/pending med gameId) finnes ikke lenger.
  //
  // Disse 3 testene må re-implementeres mot ny vy:
  //   1. Mock `getCurrentShift()` for å returnere hallId.
  //   2. Mock `GET /api/agent/physical/cashout/daily-list` per ny route.
  //   3. Verifiser daily-list-tabell + per-game drill-down + 5×5 popup +
  //      reward-all-knapp i den nye flyten.
  //
  // Skip i påvente av re-implementasjon — ikke bug i prod-koden, kun
  // test-debt etter pilot-fix-bølge.
  it.skip("rendrer game-id-skjema uten coming-soon-marker", () => {
    /* OBSOLETE: Page rewritten in PR #670, no longer has game-id form. */
  });

  it.skip("kaller /api/agent/physical/pending med gameId ved innsending", async () => {
    /* OBSOLETE: Page rewritten in PR #670 — daily-list-flyt, ikke gameId-skjema. */
  });

  it.skip("viser tom-state hvis ingen pending eller rewarded", async () => {
    /* OBSOLETE: Page rewritten in PR #670 — daily-list rendrer tom-state annerledes. */
  });
});

describe("sidebar + routes wiring", () => {
  beforeEach(() => {
    initI18n();
  });

  it("agentSidebar inkluderer agent-bingo-check", async () => {
    const { agentSidebar } = await import("../src/shell/sidebarSpec.js");
    const ids = agentSidebar
      .filter((n) => n.kind !== "header")
      .map((n) => (n.kind === "leaf" || n.kind === "group" ? n.id : ""));
    expect(ids).toContain("agent-bingo-check");
    expect(ids).toContain("agent-physical-cashout");
  });

  it("routes inneholder /agent/bingo-check med agent-role", async () => {
    const { routes, findRoute } = await import("../src/router/routes.js");
    const route = findRoute("/agent/bingo-check");
    expect(route).toBeDefined();
    expect(route?.roles).toContain("agent");
    expect(route?.roles).toContain("hall-operator");
    // Duplicate check — ensure no collision.
    const bingoCheckRoutes = routes.filter((r) => r.path === "/agent/bingo-check");
    expect(bingoCheckRoutes.length).toBe(1);
  });
});
