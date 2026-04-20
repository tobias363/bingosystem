// BIN-618 / BIN-629 / BIN-630 / BIN-633 / BIN-634:
// Integration tests for admin-player wiring:
//   - LoginHistoryTab (BIN-629, cursor-paginert)
//   - ChipsHistoryTab (BIN-630, cursor-paginert)
//   - CreatePlayerModal (BIN-633, POST /api/admin/players)
//   - EditPlayerModal (BIN-634, PUT /api/admin/players/:id, email blokkert)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { mountLoginHistoryTab } from "../src/pages/players/tabs/LoginHistoryTab.js";
import { mountChipsHistoryTab } from "../src/pages/players/tabs/ChipsHistoryTab.js";
import { openCreatePlayerModal } from "../src/pages/players/modals/CreatePlayerModal.js";
import { openEditPlayerModal } from "../src/pages/players/modals/EditPlayerModal.js";
import type { PlayerSummary } from "../src/api/admin-players.js";

const PLAYER: PlayerSummary = {
  id: "user-1",
  email: "test@example.com",
  displayName: "Kari",
  surname: "Nordmann",
  phone: "+4791234567",
  kycStatus: "VERIFIED",
  birthDate: "1985-06-15",
  kycVerifiedAt: null,
  kycProviderRef: null,
  hallId: "hall-42",
  createdAt: "2026-01-01T10:00:00Z",
  updatedAt: "2026-01-02T10:00:00Z",
  complianceData: null,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successResponse<T>(data: T, status = 200): Response {
  return jsonResponse({ ok: status < 400, data }, status);
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

type FetchMock = ReturnType<typeof vi.fn>;
function installFetch(impl: (input: string | URL | Request) => Response | Promise<Response>): FetchMock {
  const fn = vi.fn().mockImplementation(async (input: string | URL | Request) => impl(input));
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("BIN-629 LoginHistoryTab", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.clear();
    window.localStorage.setItem("bingo_admin_access_token", "tok");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("loads page 1, renders rows, and hides pager when nextCursor is null", async () => {
    const fetchMock = installFetch(() =>
      successResponse({
        userId: "user-1",
        from: null,
        to: null,
        items: [
          {
            id: "a-1",
            timestamp: "2026-04-01T12:00:00Z",
            ipAddress: "10.0.0.1",
            userAgent: "Mozilla",
            success: true,
            failureReason: null,
          },
          {
            id: "a-2",
            timestamp: "2026-04-01T11:00:00Z",
            ipAddress: "10.0.0.2",
            userAgent: null,
            success: false,
            failureReason: "INVALID_CREDENTIALS",
          },
        ],
        nextCursor: null,
      })
    );

    const host = document.createElement("div");
    document.body.appendChild(host);
    mountLoginHistoryTab(host, "user-1");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]![0] as string;
    expect(call).toContain("/api/admin/players/user-1/login-history");
    expect(call).toContain("limit=50");

    const rows = host.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    expect(host.querySelector("#login-history-pager")?.innerHTML.trim()).toBe("");
  });

  it("shows Load more when nextCursor is set and paginates on click", async () => {
    let callCount = 0;
    const fetchMock = installFetch(() => {
      callCount++;
      if (callCount === 1) {
        return successResponse({
          userId: "user-1",
          from: null,
          to: null,
          items: [
            {
              id: "a-1",
              timestamp: "2026-04-01T12:00:00Z",
              ipAddress: "10.0.0.1",
              userAgent: null,
              success: true,
              failureReason: null,
            },
          ],
          nextCursor: "Y3Vyc29yLTE",
        });
      }
      return successResponse({
        userId: "user-1",
        from: null,
        to: null,
        items: [
          {
            id: "a-2",
            timestamp: "2026-04-01T11:00:00Z",
            ipAddress: "10.0.0.2",
            userAgent: null,
            success: false,
            failureReason: "INVALID_CREDENTIALS",
          },
        ],
        nextCursor: null,
      });
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    mountLoginHistoryTab(host, "user-1");
    await flush();

    const loadMore = host.querySelector<HTMLButtonElement>("#login-history-load-more");
    expect(loadMore).toBeTruthy();
    loadMore!.click();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1]![0] as string;
    expect(secondCall).toContain("cursor=Y3Vyc29yLTE");

    const rows = host.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    expect(host.querySelector("#login-history-load-more")).toBeNull();
  });

  it("renders empty state when API returns no items", async () => {
    installFetch(() =>
      successResponse({
        userId: "user-1",
        from: null,
        to: null,
        items: [],
        nextCursor: null,
      })
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    mountLoginHistoryTab(host, "user-1");
    await flush();
    const body = host.querySelector<HTMLElement>("#login-history-body")!;
    expect(body.textContent).toMatch(/.+/); // non-empty message
    expect(host.querySelectorAll("tbody tr").length).toBe(0);
  });
});

describe("BIN-630 ChipsHistoryTab", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.clear();
    window.localStorage.setItem("bingo_admin_access_token", "tok");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hits /chips-history with pageSize and renders signed amounts", async () => {
    const fetchMock = installFetch(() =>
      successResponse({
        userId: "user-1",
        walletId: "w-1",
        from: null,
        to: null,
        items: [
          {
            id: "tx-1",
            timestamp: "2026-04-01T12:00:00Z",
            type: "TOPUP",
            amount: 100,
            balanceAfter: 200,
            description: "Innskudd",
            sourceGameId: null,
            refundedAt: null,
          },
          {
            id: "tx-2",
            timestamp: "2026-04-01T11:30:00Z",
            type: "DEBIT",
            amount: 25,
            balanceAfter: 100,
            description: "Bingo-innsats",
            sourceGameId: null,
            refundedAt: null,
          },
        ],
        nextCursor: null,
      })
    );

    const host = document.createElement("div");
    document.body.appendChild(host);
    mountChipsHistoryTab(host, "user-1");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]![0] as string;
    expect(call).toContain("/api/admin/players/user-1/chips-history");
    expect(call).toContain("limit=50");

    const body = host.querySelector<HTMLElement>("#chips-history-body")!;
    // TOPUP = +, DEBIT = -
    expect(body.textContent).toContain("+100.00");
    expect(body.textContent).toContain("-25.00");
  });

  it("paginates on Load more", async () => {
    let n = 0;
    const fetchMock = installFetch(() => {
      n++;
      if (n === 1) {
        return successResponse({
          userId: "user-1",
          walletId: "w-1",
          from: null,
          to: null,
          items: [
            {
              id: "tx-1",
              timestamp: "2026-04-01T12:00:00Z",
              type: "TOPUP",
              amount: 100,
              balanceAfter: 100,
              description: "",
              sourceGameId: null,
              refundedAt: null,
            },
          ],
          nextCursor: "Y3Vyc29yLTI",
        });
      }
      return successResponse({
        userId: "user-1",
        walletId: "w-1",
        from: null,
        to: null,
        items: [
          {
            id: "tx-2",
            timestamp: "2026-04-01T11:30:00Z",
            type: "DEBIT",
            amount: 25,
            balanceAfter: 75,
            description: "",
            sourceGameId: null,
            refundedAt: null,
          },
        ],
        nextCursor: null,
      });
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    mountChipsHistoryTab(host, "user-1");
    await flush();
    host
      .querySelector<HTMLButtonElement>("#chips-history-load-more")!
      .click();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toContain("cursor=Y3Vyc29yLTI");
    expect(host.querySelectorAll("tbody tr").length).toBe(2);
  });

  it("shows error message on failure", async () => {
    installFetch(() => errorResponse("FORBIDDEN", "Ingen tilgang", 403));
    const host = document.createElement("div");
    document.body.appendChild(host);
    mountChipsHistoryTab(host, "user-1");
    await flush();
    const body = host.querySelector<HTMLElement>("#chips-history-body")!;
    expect(body.textContent).toContain("Ingen tilgang");
  });
});

describe("BIN-633 CreatePlayerModal", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.clear();
    window.localStorage.setItem("bingo_admin_access_token", "tok");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("blocks submit on empty required fields (no fetch)", async () => {
    const fetchMock = installFetch(() => successResponse({}));
    openCreatePlayerModal({});
    const confirm = document.querySelector<HTMLButtonElement>(
      'button[data-action="confirm"]'
    )!;
    confirm.click();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    const err = document.querySelector<HTMLElement>("#create-player-error")!;
    expect(err.style.display).toBe("block");
  });

  it("validates email format", async () => {
    const fetchMock = installFetch(() => successResponse({}));
    openCreatePlayerModal({});
    (document.querySelector<HTMLInputElement>("#cp-email")!).value = "not-an-email";
    (document.querySelector<HTMLInputElement>("#cp-displayName")!).value = "Kari";
    (document.querySelector<HTMLInputElement>("#cp-surname")!).value = "Nordmann";
    (document.querySelector<HTMLInputElement>("#cp-birthDate")!).value = "1985-06-15";
    document
      .querySelector<HTMLButtonElement>('button[data-action="confirm"]')!
      .click();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    const err = document.querySelector<HTMLElement>("#create-player-error")!;
    expect(err.textContent).toMatch(/e-post|email/i);
  });

  it("POSTs to /api/admin/players and shows temp-password dialog on success", async () => {
    const fetchMock = installFetch(() =>
      successResponse({
        player: { ...PLAYER, email: "new@example.com", id: "new-1" },
        temporaryPassword: "TmpPass1234",
      })
    );
    const onCreated = vi.fn();
    openCreatePlayerModal({ onCreated });

    (document.querySelector<HTMLInputElement>("#cp-email")!).value = "new@example.com";
    (document.querySelector<HTMLInputElement>("#cp-displayName")!).value = "Ola";
    (document.querySelector<HTMLInputElement>("#cp-surname")!).value = "Hansen";
    (document.querySelector<HTMLInputElement>("#cp-birthDate")!).value = "1990-01-01";
    document
      .querySelector<HTMLButtonElement>('button[data-action="confirm"]')!
      .click();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/players");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.email).toBe("new@example.com");
    expect(body.displayName).toBe("Ola");
    expect(body.surname).toBe("Hansen");
    expect(body.birthDate).toBe("1990-01-01");

    expect(onCreated).toHaveBeenCalled();
    // second modal (temp-password) should be rendered
    const tempInput = document.querySelector<HTMLInputElement>("#cp-temppw");
    expect(tempInput?.value).toBe("TmpPass1234");
  });

  it("shows backend error (EMAIL_EXISTS) inline", async () => {
    installFetch(() => errorResponse("EMAIL_EXISTS", "E-post finnes allerede", 409));
    openCreatePlayerModal({});
    (document.querySelector<HTMLInputElement>("#cp-email")!).value = "dup@example.com";
    (document.querySelector<HTMLInputElement>("#cp-displayName")!).value = "Ola";
    (document.querySelector<HTMLInputElement>("#cp-surname")!).value = "Hansen";
    (document.querySelector<HTMLInputElement>("#cp-birthDate")!).value = "1990-01-01";
    document
      .querySelector<HTMLButtonElement>('button[data-action="confirm"]')!
      .click();
    await flush();
    const err = document.querySelector<HTMLElement>("#create-player-error")!;
    expect(err.textContent).toContain("E-post finnes allerede");
  });
});

describe("BIN-634 EditPlayerModal", () => {
  beforeEach(() => {
    initI18n();
    document.body.innerHTML = "";
    window.localStorage.clear();
    window.localStorage.setItem("bingo_admin_access_token", "tok");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders email read-only and shows email-change-blocked hint", () => {
    openEditPlayerModal({ player: PLAYER });
    const emailInput = document.querySelector<HTMLInputElement>("#ep-email")!;
    expect(emailInput.readOnly).toBe(true);
    expect(emailInput.value).toBe(PLAYER.email);
    // The form must not include an email field in the PUT payload — verified
    // implicitly by test "sends only changed fields" below.
  });

  it("blocks PUT when no fields changed", async () => {
    const fetchMock = installFetch(() => successResponse({}));
    openEditPlayerModal({ player: PLAYER });
    document
      .querySelector<HTMLButtonElement>('button[data-action="confirm"]')!
      .click();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    const err = document.querySelector<HTMLElement>("#edit-player-error")!;
    expect(err.style.display).toBe("block");
  });

  it("sends only changed fields (phone + hallId)", async () => {
    const fetchMock = installFetch(() =>
      successResponse({
        player: { ...PLAYER, phone: "+4798765432", hallId: "hall-99" },
        changedFields: ["phone", "hallId"],
      })
    );
    const onUpdated = vi.fn();
    openEditPlayerModal({ player: PLAYER, onUpdated });

    // Change phone + hallId only. displayName/surname left as-is.
    (document.querySelector<HTMLInputElement>("#ep-phone")!).value = "+4798765432";
    (document.querySelector<HTMLInputElement>("#ep-hallId")!).value = "hall-99";
    document
      .querySelector<HTMLButtonElement>('button[data-action="confirm"]')!
      .click();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/players/user-1");
    expect((init as RequestInit).method).toBe("PUT");
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["hallId", "phone"]);
    expect(body.phone).toBe("+4798765432");
    expect(body.hallId).toBe("hall-99");
    expect("email" in body).toBe(false);
    expect("displayName" in body).toBe(false);
    expect(onUpdated).toHaveBeenCalled();
  });

  it("sends null when a nullable field is cleared", async () => {
    const fetchMock = installFetch(() =>
      successResponse({ player: PLAYER, changedFields: ["phone"] })
    );
    openEditPlayerModal({ player: PLAYER });
    (document.querySelector<HTMLInputElement>("#ep-phone")!).value = "";
    document
      .querySelector<HTMLButtonElement>('button[data-action="confirm"]')!
      .click();
    await flush();
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.phone).toBeNull();
  });

  it("surfaces backend validation error (email-inclusion protection is server-side)", async () => {
    // Even though our UI doesn't send email, the backend still returns
    // INVALID_INPUT for any rejected diff. We only test our overlay here.
    installFetch(() => errorResponse("INVALID_INPUT", "hallId må være en tekst", 400));
    openEditPlayerModal({ player: PLAYER });
    (document.querySelector<HTMLInputElement>("#ep-hallId")!).value = "new-hall";
    document
      .querySelector<HTMLButtonElement>('button[data-action="confirm"]')!
      .click();
    await flush();
    const err = document.querySelector<HTMLElement>("#edit-player-error")!;
    expect(err.textContent).toContain("hallId må være en tekst");
  });
});
