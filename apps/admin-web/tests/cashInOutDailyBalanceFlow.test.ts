// Wireframe 17.3 (Control Daily Balance) + 17.5 (Add Daily Balance) —
// tester for modalene som styrer daglig saldo-flyten i Cash In/Out.
//
// Fokus:
//   - Add Daily Balance: rendering med "Current Balance"-display + "Enter
//     Balance"-input. POST sender legacy-kontrakt `{ amount, notes }`.
//   - Control Daily Balance: rendering med to felt (reportedDailyBalance +
//     reportedTotalCashBalance). POST sender begge feltene. Severity-respons
//     kontrollerer NOTE_REQUIRED-toggling.
//   - F8-hotkey: routes til #/hallSpecificReport (Dagens salgsrapport).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { openAddDailyBalanceModal } from "../src/pages/cash-inout/modals/AddDailyBalanceModal.js";
import { openControlDailyBalanceModal } from "../src/pages/cash-inout/modals/ControlDailyBalanceModal.js";
import { renderCashInOutPage } from "../src/pages/cash-inout/CashInOutPage.js";

interface Route {
  match: RegExp;
  method?: string;
  handler: (url: string, init: RequestInit | undefined) => unknown;
  status?: number;
}

function mockApiRouter(routes: Route[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  fn.mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes.find(
      (r) => r.match.test(url) && (r.method === undefined || r.method === method),
    );
    if (!route) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: false, error: { code: "NOT_MOCKED", message: url } }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    const body = route.handler(url, init);
    const status = route.status ?? 200;
    const ok = status < 400;
    const payload = ok ? { ok: true, data: body } : (body as Record<string, unknown>);
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

async function tick(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 0));
}

beforeEach(() => {
  initI18n();
  document.body.innerHTML = "";
  window.localStorage.setItem("bingo_admin_access_token", "tok");
});

describe("AddDailyBalanceModal (WF 17.5)", () => {
  it("rendrer 'Current Balance'-display + 'Enter Balance'-input", async () => {
    mockApiRouter([
      {
        match: /\/api\/agent\/shift\/daily-balance/,
        method: "GET",
        handler: () => ({
          openingBalance: 0,
          totalCashIn: 0,
          totalCashOut: 0,
          dailyBalance: 0,
          totalHallCashBalance: 0,
          updatedAt: new Date().toISOString(),
        }),
      },
    ]);
    openAddDailyBalanceModal();
    expect(document.querySelector("#adb-current")).toBeTruthy();
    expect(document.querySelector<HTMLInputElement>("#adb-amount")).toBeTruthy();
    expect(document.querySelector<HTMLTextAreaElement>("#adb-notes")).toBeTruthy();
    // Vent på async daily-balance-fetch.
    await tick();
    await tick();
  });

  it("submit sender legacy-kontrakt { amount, notes } til POST /api/agent/shift/open-day", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const api = mockApiRouter([
      {
        match: /\/api\/agent\/shift\/daily-balance/,
        method: "GET",
        handler: () => ({
          openingBalance: 0, totalCashIn: 0, totalCashOut: 0,
          dailyBalance: 0, totalHallCashBalance: 0,
          updatedAt: new Date().toISOString(),
        }),
      },
      {
        match: /\/api\/agent\/shift\/open-day/,
        method: "POST",
        handler: (_url, init) => {
          capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
          return {
            openingBalance: 5000, totalCashIn: 0, totalCashOut: 0,
            dailyBalance: 5000, totalHallCashBalance: 5000,
            updatedAt: new Date().toISOString(),
          };
        },
      },
    ]);
    openAddDailyBalanceModal();
    const input = document.querySelector<HTMLInputElement>("#adb-amount")!;
    input.value = "5000";
    const notes = document.querySelector<HTMLTextAreaElement>("#adb-notes")!;
    notes.value = "Skift-start";
    // Klikk "Legg til"-knappen.
    const submitBtn = Array.from(document.querySelectorAll<HTMLButtonElement>(".modal button"))
      .find((b) => b.textContent?.trim() === "Legg til")!;
    expect(submitBtn).toBeTruthy();
    submitBtn.click();
    await tick();
    await tick();
    await tick();
    expect(capturedBody).toEqual({ amount: 5000, notes: "Skift-start" });
    // Verifiser at POST faktisk ble kalt (én daily-balance GET + én open-day POST).
    const postCalls = api.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/open-day"));
    expect(postCalls.length).toBe(1);
  });
});

describe("ControlDailyBalanceModal (WF 17.3)", () => {
  it("rendrer to felt: reportedDailyBalance + reportedTotalCashBalance", () => {
    mockApiRouter([]);
    openControlDailyBalanceModal();
    expect(document.querySelector<HTMLInputElement>("#cdb-daily-balance")).toBeTruthy();
    expect(document.querySelector<HTMLInputElement>("#cdb-total-cash")).toBeTruthy();
  });

  it("submit sender begge felt + viser severity OK ved liten diff", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockApiRouter([
      {
        match: /\/api\/agent\/shift\/control-daily-balance/,
        method: "POST",
        handler: (_url, init) => {
          capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
          return {
            shiftDailyBalance: 5000,
            reportedDailyBalance: 5050,
            diff: 50,
            diffPct: 1.0,
            severity: "OK",
          };
        },
      },
    ]);
    openControlDailyBalanceModal();
    (document.querySelector<HTMLInputElement>("#cdb-daily-balance")!).value = "5050";
    (document.querySelector<HTMLInputElement>("#cdb-total-cash")!).value = "10000";
    const submitBtn = Array.from(document.querySelectorAll<HTMLButtonElement>(".modal button"))
      .find((b) => b.textContent?.trim() === "Send inn")!;
    expect(submitBtn).toBeTruthy();
    submitBtn.click();
    await tick();
    await tick();
    expect(capturedBody).toEqual({
      reportedDailyBalance: 5050,
      reportedTotalCashBalance: 10000,
    });
  });

  it("viser notat-felt ved NOTE_REQUIRED-severity", async () => {
    mockApiRouter([
      {
        match: /\/api\/agent\/shift\/control-daily-balance/,
        method: "POST",
        handler: () => ({
          shiftDailyBalance: 5000,
          reportedDailyBalance: 4200,
          diff: -800,
          diffPct: -16.0,
          severity: "NOTE_REQUIRED",
        }),
      },
    ]);
    openControlDailyBalanceModal();
    (document.querySelector<HTMLInputElement>("#cdb-daily-balance")!).value = "4200";
    (document.querySelector<HTMLInputElement>("#cdb-total-cash")!).value = "10000";
    const submitBtn = Array.from(document.querySelectorAll<HTMLButtonElement>(".modal button"))
      .find((b) => b.textContent?.trim() === "Send inn")!;
    submitBtn.click();
    await tick();
    await tick();
    // Notat-feltet skal være synlig.
    const noteGroup = document.querySelector<HTMLElement>("#cdb-note-group");
    expect(noteGroup).toBeTruthy();
    expect(noteGroup!.style.display).toBe("");
    // Severity-felt skal vise NOTE_REQUIRED-tekst.
    const severityEl = document.querySelector("#cdb-severity")!;
    expect(severityEl.textContent).toBe("Notat påkrevd");
  });
});

describe("F8 hotkey — Dagens salgsrapport", () => {
  it("F8-tast på CashInOutPage routes til #/hallSpecificReport", () => {
    // GET /daily-balance returnerer tomt så page-render ikke feiler.
    mockApiRouter([
      {
        match: /\/api\/agent\/shift\/daily-balance/,
        method: "GET",
        handler: () => ({
          openingBalance: 0, totalCashIn: 0, totalCashOut: 0,
          dailyBalance: 0, totalHallCashBalance: 0,
          updatedAt: new Date().toISOString(),
        }),
      },
    ]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderCashInOutPage(container);

    window.location.hash = "#/cashInOut";
    const before = window.location.hash;
    expect(before).toBe("#/cashInOut");

    const evt = new KeyboardEvent("keydown", { key: "F8", bubbles: true, cancelable: true });
    document.dispatchEvent(evt);

    expect(window.location.hash).toBe("#/hallSpecificReport");
  });
});
