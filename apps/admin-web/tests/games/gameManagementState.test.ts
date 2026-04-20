// Unit tests for GameManagementState — wired mot backend BIN-622.
//
// Coverage:
//   - fetchGameManagementList kaller riktig URL + parser respons
//   - fetchGameManagement kaller typeId+id-URL, returnerer null ved 404
//   - createGameManagement / saveGameManagement POST-er + mapper respons
//   - updateGameManagement PATCH + mapper respons
//   - deleteGameManagement DELETE + forward hard-flag
//   - repeatGame POST til /:id/repeat + body
//   - closeDay er fortsatt placeholder (BIN-623)
//   - isGame1Variant / isGame3Variant helpers

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchGameManagementList,
  fetchGameManagement,
  fetchGameTickets,
  createGameManagement,
  updateGameManagement,
  saveGameManagement,
  deleteGameManagement,
  repeatGame,
  closeDay,
  isGame1Variant,
  isGame3Variant,
} from "../../src/pages/games/gameManagement/GameManagementState.js";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

let calls: FetchCall[] = [];
let nextResponse: { ok: boolean; status: number; body: unknown } | null = null;

function installFetchMock() {
  calls = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(input), init });
      const resp = nextResponse ?? { ok: true, status: 200, body: { ok: true, data: null } };
      return {
        ok: resp.ok,
        status: resp.status,
        async json() {
          return resp.body;
        },
      } as unknown as Response;
    }
  );
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  nextResponse = null;
  calls = [];
});

function envelope<T>(data: T) {
  return { ok: true, data };
}
function errorEnvelope(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

const sampleBackend = {
  id: "gm-1",
  gameTypeId: "bingo",
  parentId: null,
  name: "My Game",
  ticketType: "Large" as const,
  ticketPrice: 1000,
  startDate: "2026-05-01T10:00:00Z",
  endDate: null,
  status: "active" as const,
  totalSold: 0,
  totalEarning: 0,
  config: { spill1: { note: "hei" } },
  repeatedFromId: null,
  createdBy: "admin-1",
  createdAt: "2026-04-15T10:00:00Z",
  updatedAt: "2026-04-15T10:00:00Z",
};

describe("GameManagement fetchers", () => {
  it("fetchGameManagementList calls GET with gameTypeId query and adapts response", async () => {
    nextResponse = {
      ok: true,
      status: 200,
      body: envelope({ games: [sampleBackend], count: 1 }),
    };
    const rows = await fetchGameManagementList("bingo");
    expect(calls[0]?.url).toContain("/api/admin/game-management?gameTypeId=bingo");
    expect(rows.length).toBe(1);
    expect(rows[0]?._id).toBe("gm-1");
    expect(rows[0]?.id).toBe("gm-1");
    expect(rows[0]?.childId).toBeUndefined();
  });
  it("fetchGameManagementList tolerates array-response (legacy)", async () => {
    nextResponse = { ok: true, status: 200, body: envelope([sampleBackend]) };
    const rows = await fetchGameManagementList("bingo");
    expect(rows.length).toBe(1);
  });
  it("fetchGameManagement calls typeId+id URL", async () => {
    nextResponse = { ok: true, status: 200, body: envelope(sampleBackend) };
    const row = await fetchGameManagement("bingo", "gm-1");
    expect(calls[0]?.url).toContain("/api/admin/game-management/bingo/gm-1");
    expect(row?.id).toBe("gm-1");
  });
  it("fetchGameManagement returns null on 404", async () => {
    nextResponse = {
      ok: false,
      status: 404,
      body: errorEnvelope("GAME_MANAGEMENT_NOT_FOUND", "not found"),
    };
    const row = await fetchGameManagement("bingo", "nope");
    expect(row).toBeNull();
  });
  it("fetchGameTickets returns [] (separate backend-task)", async () => {
    expect(await fetchGameTickets("bingo", "gm-1")).toEqual([]);
  });
});

describe("GameManagement write-ops", () => {
  it("createGameManagement POSTs payload + adapts response", async () => {
    nextResponse = { ok: true, status: 200, body: envelope(sampleBackend) };
    const res = await createGameManagement({
      gameTypeId: "bingo",
      name: "My Game",
      ticketType: "Large",
      ticketPrice: 1000,
      startDate: "2026-05-01T10:00:00Z",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe("gm-1");
    const call = calls[0];
    expect(call?.init?.method).toBe("POST");
    const body = JSON.parse(String(call?.init?.body ?? "{}"));
    expect(body.gameTypeId).toBe("bingo");
    expect(body.name).toBe("My Game");
  });
  it("createGameManagement returns API_ERROR shape on 400", async () => {
    nextResponse = {
      ok: false,
      status: 400,
      body: errorEnvelope("INVALID_INPUT", "name mangler"),
    };
    const res = await createGameManagement({
      gameTypeId: "bingo",
      name: "",
      startDate: "2026-05-01",
    });
    expect(res.ok).toBe(false);
    if (!res.ok && res.reason === "API_ERROR") {
      expect(res.code).toBe("INVALID_INPUT");
      expect(res.status).toBe(400);
      expect(res.message).toContain("name");
    }
  });
  it("updateGameManagement PATCHes + body contains update fields", async () => {
    nextResponse = { ok: true, status: 200, body: envelope(sampleBackend) };
    const res = await updateGameManagement("gm-1", { name: "Ny", status: "running" });
    expect(res.ok).toBe(true);
    const call = calls[0];
    expect(call?.init?.method).toBe("PATCH");
    const body = JSON.parse(String(call?.init?.body ?? "{}"));
    expect(body.name).toBe("Ny");
    expect(body.status).toBe("running");
  });
  it("saveGameManagement delegates to create when no id", async () => {
    nextResponse = { ok: true, status: 200, body: envelope(sampleBackend) };
    await saveGameManagement({ gameTypeId: "bingo", name: "X", startDate: "2026-05-01" });
    expect(calls[0]?.init?.method).toBe("POST");
  });
  it("saveGameManagement delegates to update when id provided", async () => {
    nextResponse = { ok: true, status: 200, body: envelope(sampleBackend) };
    await saveGameManagement(
      { gameTypeId: "bingo", name: "X", startDate: "2026-05-01" },
      "gm-1"
    );
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(calls[0]?.url).toContain("/api/admin/game-management/gm-1");
  });
  it("deleteGameManagement DELETEs without hard flag by default", async () => {
    nextResponse = { ok: true, status: 200, body: envelope({ softDeleted: true }) };
    const res = await deleteGameManagement("bingo", "gm-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.softDeleted).toBe(true);
    expect(calls[0]?.url).toContain("/api/admin/game-management/gm-1");
    expect(calls[0]?.url).not.toContain("hard=true");
    expect(calls[0]?.init?.method).toBe("DELETE");
  });
  it("deleteGameManagement forwards hard=true query param", async () => {
    nextResponse = { ok: true, status: 200, body: envelope({ softDeleted: false }) };
    await deleteGameManagement("bingo", "gm-1", { hard: true });
    expect(calls[0]?.url).toContain("hard=true");
  });
  it("repeatGame POSTs to /:id/repeat with body", async () => {
    nextResponse = { ok: true, status: 200, body: envelope(sampleBackend) };
    const res = await repeatGame({
      sourceGameId: "src-1",
      startDate: "2026-05-05",
      name: "Gjenta",
      repeatToken: "tok-1",
    });
    expect(res.ok).toBe(true);
    expect(calls[0]?.url).toContain("/api/admin/game-management/src-1/repeat");
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}"));
    expect(body.startDate).toBe("2026-05-05");
    expect(body.name).toBe("Gjenta");
    expect(body.repeatToken).toBe("tok-1");
  });
  it("closeDay is still a placeholder (BIN-623)", async () => {
    const res = await closeDay({ gameTypeId: "bingo", gameId: "g1", closeDate: "2026-01-02" });
    expect(res).toEqual({ ok: false, reason: "BACKEND_MISSING", issue: "BIN-623" });
  });
});

describe("Type-variant helpers", () => {
  it("isGame1Variant true only for game_1", () => {
    expect(isGame1Variant({ type: "game_1" })).toBe(true);
    expect(isGame1Variant({ type: "game_3" })).toBe(false);
    expect(isGame1Variant(null)).toBe(false);
  });
  it("isGame3Variant true for game_3", () => {
    expect(isGame3Variant({ type: "game_3" })).toBe(true);
  });
  it("isGame3Variant false for other types and nullish", () => {
    expect(isGame3Variant({ type: "game_1" })).toBe(false);
    expect(isGame3Variant({ type: "game_2" })).toBe(false);
    expect(isGame3Variant({ type: "game_5" })).toBe(false);
    expect(isGame3Variant(null)).toBe(false);
    expect(isGame3Variant(undefined)).toBe(false);
  });
});
