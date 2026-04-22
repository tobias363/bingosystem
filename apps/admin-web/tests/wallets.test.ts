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

// PR-W4 wallet-split: header-UI rendrer deposit + winnings separat.
describe("WalletViewPage — PR-W4 split-header", () => {
  it("rendrer deposit + winnings som separate linjer med ARIA-labels", async () => {
    window.location.hash = "#/wallet/view?id=w-split";
    mockApiRouter([
      {
        match: /\/api\/wallets\/w-split$/,
        handler: () => ({
          account: {
            id: "w-split",
            balance: 150000,
            depositBalance: 50000,
            winningsBalance: 100000,
            createdAt: "2026-04-22T00:00:00Z",
            updatedAt: "2026-04-22T00:00:00Z",
          },
          transactions: [],
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick();

    // 500 kr (deposit) + 1000 kr (winnings) + 1500 kr (total)
    const depositNode = root.querySelector(".wallet-deposit");
    const winningsNode = root.querySelector(".wallet-winnings");
    const totalNode = root.querySelector(".wallet-total");

    expect(depositNode).toBeTruthy();
    expect(winningsNode).toBeTruthy();
    expect(totalNode).toBeTruthy();

    // ARIA-label for skjermleser-tilgjengelighet
    expect(depositNode!.getAttribute("aria-label")).toMatch(/innskudd/i);
    expect(winningsNode!.getAttribute("aria-label")).toMatch(/gevinst/i);
    expect(totalNode!.getAttribute("aria-label")).toMatch(/total/i);

    // Verdier riktig format (formatAmountCents deler på 100)
    expect(depositNode!.textContent).toContain("500.00");
    expect(winningsNode!.textContent).toContain("1000.00");
    expect(totalNode!.textContent).toContain("1500.00");
  });

  it("bakoverkompat: account uten split-felter viser kun total balance", async () => {
    window.location.hash = "#/wallet/view?id=w-legacy";
    mockApiRouter([
      {
        match: /\/api\/wallets\/w-legacy$/,
        handler: () => ({
          account: {
            id: "w-legacy",
            balance: 100000,
            // ingen depositBalance / winningsBalance — legacy response
            createdAt: "2026-04-01T00:00:00Z",
            updatedAt: "2026-04-01T00:00:00Z",
          },
          transactions: [],
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick();

    // Split-felter ikke rendret
    expect(root.querySelector(".wallet-deposit")).toBeNull();
    expect(root.querySelector(".wallet-winnings")).toBeNull();
    // Fortsatt en total balance synlig
    expect(root.textContent).toContain("1000.00");
  });

  it("transaksjons-tabell viser split-fordeling for DEBIT med winnings+deposit", async () => {
    window.location.hash = "#/wallet/view?id=w-tx";
    mockApiRouter([
      {
        match: /\/api\/wallets\/w-tx$/,
        handler: () => ({
          account: {
            id: "w-tx",
            balance: 0,
            depositBalance: 0,
            winningsBalance: 0,
            createdAt: "2026-04-22T00:00:00Z",
            updatedAt: "2026-04-22T00:00:00Z",
          },
          transactions: [
            {
              id: "tx-split",
              accountId: "w-tx",
              type: "TRANSFER_OUT",
              amount: 15000, // 150 kr
              reason: "Bingo buy-in",
              createdAt: "2026-04-22T10:00:00Z",
              split: { fromDeposit: 10000, fromWinnings: 5000 }, // 100 kr + 50 kr
            },
            {
              id: "tx-legacy",
              accountId: "w-tx",
              type: "TOPUP",
              amount: 10000,
              reason: "Legacy top-up",
              createdAt: "2026-04-22T09:00:00Z",
              // ingen split-felt
            },
          ],
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick();

    // TRANSFER_OUT med split skal vise begge deler
    expect(root.textContent).toMatch(/100\.00.*innskudd/i);
    expect(root.textContent).toMatch(/50\.00.*gevinst/i);
  });
});

// PR-W4: WalletListPage viser deposit + winnings som separate kolonner.
describe("WalletListPage — PR-W4 split-kolonner", () => {
  it("rendrer Deposit + Winnings + Balance som separate kolonner", async () => {
    mockApiRouter([
      {
        match: /\/api\/wallets$/,
        handler: () => [
          {
            id: "w1",
            balance: 75000,
            depositBalance: 50000,
            winningsBalance: 25000,
            createdAt: "2026-04-22T00:00:00Z",
            updatedAt: "2026-04-22T00:00:00Z",
          },
        ],
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet");
    await tick();

    const text = root.textContent ?? "";
    // 500.00 = deposit, 250.00 = winnings, 750.00 = balance
    expect(text).toContain("500.00");
    expect(text).toContain("250.00");
    expect(text).toContain("750.00");
  });
});

// PR-W5: Admin wallet-correction modal (manual credit).
describe("WalletViewPage — PR-W5 correction modal", () => {
  async function setupViewPage(walletId = "w-correct"): Promise<{
    root: HTMLElement;
    api: ReturnType<typeof vi.fn>;
  }> {
    window.location.hash = `#/wallet/view?id=${walletId}`;
    const api = mockApiRouter([
      {
        match: new RegExp(`/api/wallets/${walletId}$`),
        handler: () => ({
          account: {
            id: walletId,
            balance: 50000,
            depositBalance: 50000,
            winningsBalance: 0,
            createdAt: "2026-04-22T00:00:00Z",
            updatedAt: "2026-04-22T00:00:00Z",
          },
          transactions: [],
        }),
      },
      {
        match: new RegExp(
          `/api/admin/wallets/${walletId}/credit$`
        ),
        handler: () => ({
          transaction: {
            id: "tx-correction-1",
            accountId: walletId,
            type: "CREDIT",
            amount: 10000,
            reason: "Admin correction: test",
            createdAt: "2026-04-22T10:00:00Z",
            split: { fromDeposit: 10000, fromWinnings: 0 },
          },
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick();
    return { root, api };
  }

  it('viser "Ny wallet-correction"-knapp på wallet-detalj', async () => {
    const { root } = await setupViewPage();
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-testid="wallet-correction-open"]'
    );
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toMatch(/ny.*wallet.*correction/i);
    expect(btn!.disabled).toBe(false);
  });

  it("modal åpnes ved klikk med side=deposit som default", async () => {
    const { root } = await setupViewPage();
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-testid="wallet-correction-open"]'
    )!;
    btn.click();
    await tick();

    const modal = document.querySelector(".modal");
    expect(modal).toBeTruthy();

    const form = document.querySelector<HTMLFormElement>(
      '[data-testid="wallet-correction-form"]'
    );
    expect(form).toBeTruthy();

    const sideEl = document.querySelector<HTMLSelectElement>(
      '[data-testid="wallet-correction-side"]'
    )!;
    expect(sideEl.value).toBe("deposit");
  });

  it("winnings-option er disabled med tooltip + regulatorisk forklaring", async () => {
    const { root } = await setupViewPage();
    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();

    const winningsOpt = document.querySelector<HTMLOptionElement>(
      '[data-testid="wallet-correction-side-winnings-disabled"]'
    );
    expect(winningsOpt).toBeTruthy();
    expect(winningsOpt!.disabled).toBe(true);
    // Tooltip (native title) skal henvise til regulatorisk forbud.
    expect(winningsOpt!.title).toMatch(/ADMIN_WINNINGS_CREDIT_FORBIDDEN/);
    expect(winningsOpt!.title).toMatch(/§11|pengespillforskriften/i);

    // Help-text under select forklarer også for brukere (skjermlesere).
    const helpText = document.querySelector<HTMLElement>(
      '[data-testid="wallet-correction-side-help"]'
    );
    expect(helpText).toBeTruthy();
    expect(helpText!.textContent).toMatch(/pengespillforskriften/i);
  });

  it("submit happy-path kaller POST /api/admin/wallets/:id/credit", async () => {
    const { root, api } = await setupViewPage("w-happy");
    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();

    const amountEl = document.querySelector<HTMLInputElement>(
      '[data-testid="wallet-correction-amount"]'
    )!;
    const reasonEl = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="wallet-correction-reason"]'
    )!;
    amountEl.value = "100";
    reasonEl.value = "Compensate lost buy-in for support ticket #42";

    const submitBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-footer [data-action="submit"]')
    )[0]!;
    submitBtn.click();
    await tick(20);

    const creditCall = api.mock.calls.find(([u]) =>
      String(u).includes("/api/admin/wallets/w-happy/credit")
    );
    expect(creditCall).toBeTruthy();
    const [, init] = creditCall!;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.amount).toBe(100);
    expect(body.reason).toBe(
      "Compensate lost buy-in for support ticket #42"
    );
    expect(body.to).toBe("deposit");
    expect(typeof body.idempotencyKey).toBe("string");
    expect(body.idempotencyKey).toContain("admin-correction");
  });

  it("submit viser success-toast og lukker modal", async () => {
    const { root } = await setupViewPage("w-ok");
    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();

    const amountEl = document.querySelector<HTMLInputElement>(
      '[data-testid="wallet-correction-amount"]'
    )!;
    const reasonEl = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="wallet-correction-reason"]'
    )!;
    amountEl.value = "50";
    reasonEl.value = "Manual top-up after failed deposit";

    const submitBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-footer [data-action="submit"]')
    )[0]!;
    submitBtn.click();
    await tick(20);

    // Toast med success-melding
    const toastContainer = document.getElementById("toast-container");
    expect(toastContainer?.textContent ?? "").toMatch(/korreksjon|correction/i);
    // Modal lukket
    expect(document.querySelector(".modal")).toBeNull();
  });

  it("tom begrunnelse → valideringsfeil og ingen API-kall", async () => {
    const { root, api } = await setupViewPage("w-noreason");
    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();

    const amountEl = document.querySelector<HTMLInputElement>(
      '[data-testid="wallet-correction-amount"]'
    )!;
    amountEl.value = "50";
    // Begrunnelse bevisst tom.

    const callsBeforeSubmit = api.mock.calls.length;
    const submitBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-footer [data-action="submit"]')
    )[0]!;
    submitBtn.click();
    await tick(20);

    // Ingen POST /credit-kall utløst
    const creditCalls = api.mock.calls.filter(([u]) =>
      String(u).includes("/credit")
    );
    expect(creditCalls.length).toBe(0);
    // Modal fortsatt åpen
    expect(document.querySelector(".modal")).toBeTruthy();
    // Toast viser valideringsfeil
    const toast = document.getElementById("toast-container");
    expect(toast?.textContent ?? "").toMatch(/begrunnelse|reason/i);
    // API kun truffet for den opprinnelige wallet-henting
    expect(api.mock.calls.length).toBe(callsBeforeSubmit);
  });

  it("ugyldig beløp (0 eller negativ) → valideringsfeil og ingen API-kall", async () => {
    const { root, api } = await setupViewPage("w-zero");
    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();

    const amountEl = document.querySelector<HTMLInputElement>(
      '[data-testid="wallet-correction-amount"]'
    )!;
    const reasonEl = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="wallet-correction-reason"]'
    )!;
    amountEl.value = "0";
    reasonEl.value = "test";

    const submitBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-footer [data-action="submit"]')
    )[0]!;
    submitBtn.click();
    await tick(20);

    const creditCalls = api.mock.calls.filter(([u]) =>
      String(u).includes("/credit")
    );
    expect(creditCalls.length).toBe(0);
    expect(document.querySelector(".modal")).toBeTruthy();
    const toast = document.getElementById("toast-container");
    expect(toast?.textContent ?? "").toMatch(/beløp|amount/i);
  });

  it("403 ADMIN_WINNINGS_CREDIT_FORBIDDEN fra server → regulatorisk advarsel", async () => {
    window.location.hash = "#/wallet/view?id=w-403";
    mockApiRouter([
      {
        match: /\/api\/wallets\/w-403$/,
        handler: () => ({
          account: {
            id: "w-403",
            balance: 10000,
            depositBalance: 10000,
            winningsBalance: 0,
            createdAt: "2026-04-22T00:00:00Z",
            updatedAt: "2026-04-22T00:00:00Z",
          },
          transactions: [],
        }),
      },
      {
        match: /\/api\/admin\/wallets\/w-403\/credit$/,
        handler: () => ({
          ok: false,
          error: {
            code: "ADMIN_WINNINGS_CREDIT_FORBIDDEN",
            message:
              "Admin kan ikke kreditere direkte til winnings-siden (pengespillforskriften §11).",
          },
        }),
        status: 403,
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick();

    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();

    // Simulér at brukeren tvinger gjennom winnings ved å fjerne disabled
    // (DOM-manipulasjon — server er siste forsvarslinje).
    const winningsOpt = document.querySelector<HTMLOptionElement>(
      '[data-testid="wallet-correction-side-winnings-disabled"]'
    )!;
    winningsOpt.disabled = false;
    const sideEl = document.querySelector<HTMLSelectElement>(
      '[data-testid="wallet-correction-side"]'
    )!;
    sideEl.value = "winnings";

    const amountEl = document.querySelector<HTMLInputElement>(
      '[data-testid="wallet-correction-amount"]'
    )!;
    const reasonEl = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="wallet-correction-reason"]'
    )!;
    amountEl.value = "100";
    reasonEl.value = "Prøver å tvinge gjennom winnings-credit";

    const submitBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-footer [data-action="submit"]')
    )[0]!;
    submitBtn.click();
    await tick(30);

    // Modal skal fortsatt være åpen (server-feil → bruker kan korrigere).
    expect(document.querySelector(".modal")).toBeTruthy();
    // Advarsels-toast med regulatorisk tekst.
    const toast = document.getElementById("toast-container");
    const toastText = toast?.textContent ?? "";
    expect(toastText).toMatch(/regulatorisk|regulatory|gevinst|winnings/i);
  });

  it("generic 500-feil → viser error-toast men forblir åpen", async () => {
    window.location.hash = "#/wallet/view?id=w-500";
    mockApiRouter([
      {
        match: /\/api\/wallets\/w-500$/,
        handler: () => ({
          account: {
            id: "w-500",
            balance: 10000,
            depositBalance: 10000,
            winningsBalance: 0,
            createdAt: "2026-04-22T00:00:00Z",
            updatedAt: "2026-04-22T00:00:00Z",
          },
          transactions: [],
        }),
      },
      {
        match: /\/api\/admin\/wallets\/w-500\/credit$/,
        handler: () => ({
          ok: false,
          error: { code: "INTERNAL", message: "database down" },
        }),
        status: 500,
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick();

    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();

    const amountEl = document.querySelector<HTMLInputElement>(
      '[data-testid="wallet-correction-amount"]'
    )!;
    const reasonEl = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="wallet-correction-reason"]'
    )!;
    amountEl.value = "25";
    reasonEl.value = "Test 500-feil-håndtering";

    const submitBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-footer [data-action="submit"]')
    )[0]!;
    submitBtn.click();
    await tick(30);

    expect(document.querySelector(".modal")).toBeTruthy();
    const toast = document.getElementById("toast-container");
    expect(toast?.textContent ?? "").toMatch(/database down|internal/i);
  });

  it("cancel-knapp lukker modal uten API-kall", async () => {
    const { root, api } = await setupViewPage("w-cancel");
    const callsBefore = api.mock.calls.length;
    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();
    expect(document.querySelector(".modal")).toBeTruthy();

    const cancelBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-footer [data-action="cancel"]')
    )[0]!;
    cancelBtn.click();

    expect(document.querySelector(".modal")).toBeNull();
    expect(api.mock.calls.length).toBe(callsBefore);
  });

  it("etter vellykket correction reloader wallet-detalj-data", async () => {
    window.location.hash = "#/wallet/view?id=w-reload";
    let callCount = 0;
    const api = mockApiRouter([
      {
        match: /\/api\/wallets\/w-reload$/,
        handler: () => {
          callCount += 1;
          // Første GET returnerer 500 kr, andre GET returnerer 600 kr
          // (100 kr kreditert).
          const deposit = callCount === 1 ? 50000 : 60000;
          return {
            account: {
              id: "w-reload",
              balance: deposit,
              depositBalance: deposit,
              winningsBalance: 0,
              createdAt: "2026-04-22T00:00:00Z",
              updatedAt: "2026-04-22T00:00:00Z",
            },
            transactions: [],
          };
        },
      },
      {
        match: /\/api\/admin\/wallets\/w-reload\/credit$/,
        handler: () => ({
          transaction: {
            id: "tx-reload",
            accountId: "w-reload",
            type: "CREDIT",
            amount: 10000,
            reason: "Manual credit",
            createdAt: "2026-04-22T10:00:00Z",
            split: { fromDeposit: 10000, fromWinnings: 0 },
          },
        }),
      },
    ]);
    const root = document.createElement("div");
    document.body.appendChild(root);
    mountWalletRoute(root, "/wallet/view");
    await tick();

    // Første render: 500.00 kr
    expect(root.textContent).toContain("500.00");

    root
      .querySelector<HTMLButtonElement>('[data-testid="wallet-correction-open"]')!
      .click();
    await tick();

    const amountEl = document.querySelector<HTMLInputElement>(
      '[data-testid="wallet-correction-amount"]'
    )!;
    const reasonEl = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="wallet-correction-reason"]'
    )!;
    amountEl.value = "100";
    reasonEl.value = "Test reload etter correction";

    const submitBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.modal-footer [data-action="submit"]')
    )[0]!;
    submitBtn.click();
    await tick(30);

    // Wallet-GET skal være kalt minst 2 ganger (initial + refresh).
    const walletGetCalls = api.mock.calls.filter(
      ([u, init]) =>
        String(u).endsWith("/api/wallets/w-reload") &&
        (init?.method === "GET" || init?.method === undefined)
    );
    expect(walletGetCalls.length).toBeGreaterThanOrEqual(2);
    // Nytt saldo-tall synlig.
    expect(root.textContent).toContain("600.00");
  });
});
