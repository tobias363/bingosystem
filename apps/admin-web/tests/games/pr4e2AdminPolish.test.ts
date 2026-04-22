// PR 4e.2 (2026-04-22): tester for admin-UI polish før pilot-GO.
//
// Dekker tre områder:
//   1. DailyScheduleEditorModal — dropdown + multi-select for hall/gruppe/
//      master-hall (erstatter fri-tekst CSV). Pre-fylling fra gruppe-valg.
//   2. ScheduleEditorModal — "Sett inn eksempel" + "Valider JSON" knapper
//      for subGames.
//   3. Game1MasterConsole — stop-dialog med refund-preview, tooltips,
//      pretty-print audit-metadata.
//
// Mønstret etter tests/games/schedulesAdminWire.test.ts sin fetch-mock-stil.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initI18n } from "../../src/i18n/I18n.js";
import { openDailyScheduleEditorModal } from "../../src/pages/games/dailySchedules/DailyScheduleEditorModal.js";
import { openScheduleEditorModal } from "../../src/pages/games/schedules/ScheduleEditorModal.js";
import { renderGame1MasterConsole } from "../../src/pages/games/master/Game1MasterConsole.js";

// Socket-klienten skal ikke prøve å koble til i testene — vi mocker io-factory.
// PR 4d.3b introduserte AdminGame1Socket som internals; for våre tester er
// REST-flyten nok. Vi mocker AdminGame1Socket slik at konstruktøren blir no-op.
vi.mock("../../src/pages/games/master/adminGame1Socket.js", () => {
  return {
    AdminGame1Socket: class {
      constructor() {
        /* no-op */
      }
      subscribe() {
        /* no-op */
      }
      dispose() {
        /* no-op */
      }
      isFallbackActive() {
        return false;
      }
      isConnected() {
        return false;
      }
    },
  };
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successResponse<T>(data: T, status = 200): Response {
  return jsonResponse({ ok: status < 400, data }, status);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

type FetchMock = ReturnType<typeof vi.fn>;
function installFetch(
  impl: (input: string | URL | Request, init?: RequestInit) => Response | Promise<Response>
): FetchMock {
  const fn = vi
    .fn()
    .mockImplementation(async (input: string | URL | Request, init?: RequestInit) =>
      impl(input, init)
    );
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  initI18n();
  document.body.innerHTML = "";
  window.localStorage.clear();
  window.localStorage.setItem("bingo_admin_access_token", "tok");
});

// ── 1. DailyScheduleEditorModal — hall-picker-dropdowns ─────────────────────

describe("PR 4e.2 DailyScheduleEditorModal hall-picker", () => {
  const FAKE_HALLS = [
    { id: "hall-1", slug: "oslo", name: "Hall Oslo", region: "", address: "", isActive: true, clientVariant: "web", createdAt: "", updatedAt: "" },
    { id: "hall-2", slug: "bergen", name: "Hall Bergen", region: "", address: "", isActive: true, clientVariant: "web", createdAt: "", updatedAt: "" },
    { id: "hall-3", slug: "trondheim", name: "Hall Trondheim", region: "", address: "", isActive: true, clientVariant: "web", createdAt: "", updatedAt: "" },
  ];
  const FAKE_GROUP = {
    id: "grp-north",
    legacyGroupHallId: null,
    name: "Nord-link",
    status: "active" as const,
    tvId: null,
    productIds: [],
    members: [
      { hallId: "hall-1", hallName: "Hall Oslo", position: 0 },
      { hallId: "hall-2", hallName: "Hall Bergen", position: 1 },
    ],
    extra: {},
    createdBy: null,
    createdAt: "",
    updatedAt: "",
  };

  function installDefaultFetch(): FetchMock {
    return installFetch((url, init) => {
      const u = String(url);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "GET" && u.includes("/api/admin/halls")) {
        return successResponse(FAKE_HALLS);
      }
      if (method === "GET" && u.includes("/api/admin/hall-groups")) {
        return successResponse({ groups: [FAKE_GROUP], count: 1 });
      }
      if (method === "GET" && u.includes("/api/admin/schedules")) {
        return successResponse({ schedules: [], count: 0 });
      }
      return successResponse({});
    });
  }

  it("renderer dropdown for master-hall + multi-select for halls + groups", async () => {
    installDefaultFetch();
    await openDailyScheduleEditorModal({ mode: "create" });
    await flush();

    // Multi-select for haller
    const hallSelect = document.querySelector<HTMLSelectElement>("#ds-hall-ids");
    expect(hallSelect).not.toBeNull();
    expect(hallSelect!.tagName).toBe("SELECT");
    expect(hallSelect!.multiple).toBe(true);
    expect(hallSelect!.options.length).toBeGreaterThanOrEqual(3);

    // Multi-select for hall-grupper
    const groupSelect = document.querySelector<HTMLSelectElement>("#ds-group-hall-ids");
    expect(groupSelect).not.toBeNull();
    expect(groupSelect!.multiple).toBe(true);
    expect(groupSelect!.options.length).toBeGreaterThanOrEqual(1);

    // Dropdown (single-select) for master-hall
    const masterSelect = document.querySelector<HTMLSelectElement>("#ds-master-hall-id");
    expect(masterSelect).not.toBeNull();
    expect(masterSelect!.tagName).toBe("SELECT");
    expect(masterSelect!.multiple).toBe(false);
  });

  it("velg gruppe → pre-fyller hall-multi-select + master-hall", async () => {
    installDefaultFetch();
    await openDailyScheduleEditorModal({ mode: "create" });
    await flush();

    const groupSelect = document.querySelector<HTMLSelectElement>("#ds-group-hall-ids");
    const hallSelect = document.querySelector<HTMLSelectElement>("#ds-hall-ids");
    const masterSelect = document.querySelector<HTMLSelectElement>("#ds-master-hall-id");

    // Simuler at bruker velger "grp-north"
    const grpOption = Array.from(groupSelect!.options).find((o) => o.value === "grp-north");
    expect(grpOption).toBeTruthy();
    grpOption!.selected = true;
    groupSelect!.dispatchEvent(new Event("change"));
    await flush();

    // Hall-1 + hall-2 skal være pre-valgt i hall-multi-select
    const selectedHallIds = Array.from(hallSelect!.selectedOptions).map((o) => o.value);
    expect(selectedHallIds).toContain("hall-1");
    expect(selectedHallIds).toContain("hall-2");
    expect(selectedHallIds).not.toContain("hall-3");

    // Master-hall skal være satt til første gruppemedlem
    expect(["hall-1", "hall-2"]).toContain(masterSelect!.value);
  });

  it("submit POSTer hallIds-array som strenger (ikke CSV)", async () => {
    const fetchMock = installFetch((url, init) => {
      const u = String(url);
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "GET" && u.includes("/api/admin/halls")) {
        return successResponse(FAKE_HALLS);
      }
      if (method === "GET" && u.includes("/api/admin/hall-groups")) {
        return successResponse({ groups: [FAKE_GROUP], count: 1 });
      }
      if (method === "GET" && u.includes("/api/admin/schedules")) {
        return successResponse({ schedules: [], count: 0 });
      }
      if (method === "POST") {
        const body = JSON.parse((init as RequestInit).body as string);
        return successResponse({
          id: "ds-new",
          name: body.name,
          gameManagementId: null,
          hallId: null,
          hallIds: body.hallIds ?? {},
          weekDays: body.weekDays ?? 0,
          day: null,
          startDate: body.startDate,
          endDate: null,
          startTime: "",
          endTime: "",
          status: "active",
          stopGame: false,
          specialGame: false,
          isSavedGame: false,
          isAdminSavedGame: false,
          innsatsenSales: 0,
          subgames: [],
          otherData: body.otherData ?? {},
          createdBy: null,
          createdAt: "",
          updatedAt: "",
        });
      }
      return successResponse({});
    });

    const onSaved = vi.fn();
    await openDailyScheduleEditorModal({ mode: "create", onSaved });
    await flush();

    document.querySelector<HTMLInputElement>("#ds-name")!.value = "Pilot-mandag";
    document.querySelector<HTMLInputElement>("#ds-wd-mon")!.checked = true;

    // Velg to haller
    const hallSelect = document.querySelector<HTMLSelectElement>("#ds-hall-ids")!;
    for (const opt of Array.from(hallSelect.options)) {
      if (opt.value === "hall-1" || opt.value === "hall-2") opt.selected = true;
    }

    // Velg master-hall
    document.querySelector<HTMLSelectElement>("#ds-master-hall-id")!.value = "hall-1";

    const confirmBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".modal-footer button")
    ).find((b) => b.getAttribute("data-action") === "confirm");
    confirmBtn!.click();
    await flush();

    const postCall = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "POST"
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.hallIds).toBeDefined();
    expect(body.hallIds.masterHallId).toBe("hall-1");
    expect(body.hallIds.hallIds).toEqual(expect.arrayContaining(["hall-1", "hall-2"]));
    expect(onSaved).toHaveBeenCalled();
  });

  it("soft-validering: rejecter submit hvis hallId ikke er medlem av valgt gruppe", async () => {
    installDefaultFetch();
    const onSaved = vi.fn();
    await openDailyScheduleEditorModal({ mode: "create", onSaved });
    await flush();

    document.querySelector<HTMLInputElement>("#ds-name")!.value = "Bad setup";
    document.querySelector<HTMLInputElement>("#ds-wd-mon")!.checked = true;

    // Velg gruppe (inneholder hall-1 + hall-2), men velg hall-3 i tillegg
    // etter at pre-fylling er kjørt.
    const groupSelect = document.querySelector<HTMLSelectElement>("#ds-group-hall-ids")!;
    Array.from(groupSelect.options).find((o) => o.value === "grp-north")!.selected = true;
    groupSelect.dispatchEvent(new Event("change"));
    await flush();

    const hallSelect = document.querySelector<HTMLSelectElement>("#ds-hall-ids")!;
    // Bruker legger til hall-3 i tillegg til pre-fylte hall-1 + hall-2.
    const hall3Opt = Array.from(hallSelect.options).find((o) => o.value === "hall-3")!;
    hall3Opt.selected = true;

    const confirmBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".modal-footer button")
    ).find((b) => b.getAttribute("data-action") === "confirm");
    confirmBtn!.click();
    await flush();

    const errHost = document.querySelector<HTMLElement>("#ds-editor-error");
    expect(errHost).not.toBeNull();
    expect(errHost!.style.display).toBe("block");
    expect(errHost!.textContent).toContain("hall-3");
    expect(onSaved).not.toHaveBeenCalled();
  });
});

// ── 2. ScheduleEditorModal — subGames JSON-hjelper ──────────────────────────

describe("PR 4e.2 ScheduleEditorModal subGames-hjelper", () => {
  it("Sett inn eksempel fyller textarea med gyldig JSON-array", async () => {
    installFetch(() => successResponse({}));
    await openScheduleEditorModal({ mode: "create" });
    await flush();

    const exampleBtn = document.querySelector<HTMLButtonElement>("#sch-subgames-example");
    expect(exampleBtn).not.toBeNull();
    const textarea = document.querySelector<HTMLTextAreaElement>("#sch-subgames")!;
    textarea.value = "";

    exampleBtn!.click();
    await flush();

    expect(textarea.value.trim()).not.toBe("");
    const parsed = JSON.parse(textarea.value);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("gameManagementId");
    expect(parsed[0]).toHaveProperty("startTime");
  });

  it("Valider JSON viser OK for gyldig array", async () => {
    installFetch(() => successResponse({}));
    await openScheduleEditorModal({ mode: "create" });
    await flush();

    const textarea = document.querySelector<HTMLTextAreaElement>("#sch-subgames")!;
    textarea.value = '[{"gameManagementId":"gm-1"}]';

    const validateBtn = document.querySelector<HTMLButtonElement>("#sch-subgames-validate")!;
    validateBtn.click();
    await flush();

    const status = document.querySelector<HTMLElement>("#sch-subgames-status");
    expect(status).not.toBeNull();
    expect(status!.style.display).toBe("block");
    // OK-tekst bør inneholde antall (1 underspill i eksempelet)
    expect(status!.textContent).toContain("1");
    // Grønn OK-farge (JSDOM normaliserer til rgb)
    expect(status!.style.color).toBe("rgb(60, 118, 61)");
  });

  it("Valider JSON viser feilmelding for ugyldig syntax", async () => {
    installFetch(() => successResponse({}));
    await openScheduleEditorModal({ mode: "create" });
    await flush();

    const textarea = document.querySelector<HTMLTextAreaElement>("#sch-subgames")!;
    textarea.value = "{not valid json";

    const validateBtn = document.querySelector<HTMLButtonElement>("#sch-subgames-validate")!;
    validateBtn.click();
    await flush();

    const status = document.querySelector<HTMLElement>("#sch-subgames-status");
    expect(status).not.toBeNull();
    expect(status!.style.display).toBe("block");
    // Rød feil-farge (#a94442 → rgb(169, 68, 66))
    expect(status!.style.color).toBe("rgb(169, 68, 66)");
  });

  it("Valider JSON avviser ikke-array toppnivå", async () => {
    installFetch(() => successResponse({}));
    await openScheduleEditorModal({ mode: "create" });
    await flush();

    const textarea = document.querySelector<HTMLTextAreaElement>("#sch-subgames")!;
    textarea.value = '{"gameManagementId":"gm-1"}';

    const validateBtn = document.querySelector<HTMLButtonElement>("#sch-subgames-validate")!;
    validateBtn.click();
    await flush();

    const status = document.querySelector<HTMLElement>("#sch-subgames-status");
    expect(status!.style.color).toBe("rgb(169, 68, 66)");
  });
});

// ── 3. Game1MasterConsole — pretty-print audit + stop-dialog preview ────────

describe("PR 4e.2 Game1MasterConsole polish", () => {
  const FAKE_DETAIL = {
    game: {
      id: "g1",
      status: "running",
      scheduledStartTime: "2026-04-22T10:00:00Z",
      scheduledEndTime: null,
      actualStartTime: "2026-04-22T10:00:05Z",
      actualEndTime: null,
      masterHallId: "hall-1",
      groupHallId: "grp-north",
      participatingHallIds: ["hall-1", "hall-2"],
      subGameName: "Spill 1",
      customGameName: null,
      startedByUserId: "admin-1",
      stoppedByUserId: null,
      stopReason: null,
    },
    halls: [
      {
        hallId: "hall-1",
        hallName: "Hall Oslo",
        isReady: true,
        readyAt: null,
        readyByUserId: null,
        digitalTicketsSold: 12,
        physicalTicketsSold: 3,
        excludedFromGame: false,
        excludedReason: null,
      },
      {
        hallId: "hall-2",
        hallName: "Hall Bergen",
        isReady: true,
        readyAt: null,
        readyByUserId: null,
        digitalTicketsSold: 8,
        physicalTicketsSold: 1,
        excludedFromGame: false,
        excludedReason: null,
      },
    ],
    allReady: true,
    auditRecent: [
      {
        id: "aud-1",
        action: "exclude_hall",
        actorUserId: "admin-1",
        actorHallId: "ADMIN_CONSOLE",
        metadata: { excludedHallId: "hall-2", reason: "hall-closed" },
        createdAt: "2026-04-22T10:05:00Z",
      },
    ],
  };

  it("master-hall får tooltip på disabled exclude-knapp", async () => {
    installFetch(() => successResponse(FAKE_DETAIL));
    const c = document.createElement("div");
    document.body.appendChild(c);
    await renderGame1MasterConsole(c, "g1");
    await flush();

    // Master-hall (hall-1) skal ha span med "master" + tooltip, ikke knapp
    const hallRows = c.querySelectorAll<HTMLTableRowElement>("#g1-master-halls tbody tr");
    expect(hallRows.length).toBe(2);
    const masterSpan = c.querySelector<HTMLElement>(
      '#g1-master-halls span[title]'
    );
    expect(masterSpan).not.toBeNull();
    expect(masterSpan!.getAttribute("title")).toContain("Master");
  });

  it("exclude-knapp på ikke-master hall har forklarende tooltip", async () => {
    installFetch(() => successResponse(FAKE_DETAIL));
    const c = document.createElement("div");
    document.body.appendChild(c);
    await renderGame1MasterConsole(c, "g1");
    await flush();

    const excludeBtn = c.querySelector<HTMLButtonElement>(
      '#g1-master-halls button[data-action="exclude-hall"]'
    );
    expect(excludeBtn).not.toBeNull();
    expect(excludeBtn!.getAttribute("title")).toBeTruthy();
    expect(excludeBtn!.getAttribute("title")!.length).toBeGreaterThan(10);
  });

  it("audit-tabell rendrer metadata som nøkkel:verdi istedenfor JSON-dump", async () => {
    installFetch(() => successResponse(FAKE_DETAIL));
    const c = document.createElement("div");
    document.body.appendChild(c);
    await renderGame1MasterConsole(c, "g1");
    await flush();

    const auditHost = c.querySelector<HTMLElement>("#g1-master-audit");
    expect(auditHost).not.toBeNull();
    const text = auditHost!.textContent ?? "";
    // Pretty-print skal ha nøkkel-navn synlig
    expect(text).toContain("excludedHallId");
    expect(text).toContain("hall-2");
    expect(text).toContain("reason");
    expect(text).toContain("hall-closed");
    // Rå JSON.stringify-form ({"excludedHallId":"hall-2"...) skal IKKE være der
    expect(text).not.toContain('{"excludedHallId"');
  });

  it("stop-dialog åpnes ved klikk og viser refund-summary", async () => {
    installFetch(() => successResponse(FAKE_DETAIL));
    const c = document.createElement("div");
    document.body.appendChild(c);
    await renderGame1MasterConsole(c, "g1");
    await flush();

    const stopBtn = c.querySelector<HTMLButtonElement>(
      '#g1-master-actions button[data-action="stop"]'
    );
    expect(stopBtn).not.toBeNull();
    expect(stopBtn!.disabled).toBe(false);
    stopBtn!.click();
    await flush();

    // Dialog bør være rendret et sted i document (Modal mounter til body).
    const dialog = document.querySelector<HTMLElement>(".modal-stop-game");
    expect(dialog).not.toBeNull();
    const txt = dialog!.textContent ?? "";
    // Summen av digitale (12+8=20) + fysiske (3+1=4) skal vises
    expect(txt).toContain("20");
    expect(txt).toContain("4");
    // Textarea for reason
    const reasonInput = dialog!.querySelector<HTMLTextAreaElement>("#g1-stop-reason");
    expect(reasonInput).not.toBeNull();
  });
});
