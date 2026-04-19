// PR-A6 (BIN-674) — tests for CMS + Settings + SystemInfo + otherGames pages.
//
// Focus: dispatcher-contract, placeholder-banner rendering, form-submit
// roundtrip via localStorage-fallback, regulatorisk-lock for Spillvett-tekst,
// i18n-key coverage. Holdes innenfor LOC-budsjett ved å samle alle fire
// domener i ett spec-fil.

import { describe, it, expect, beforeEach } from "vitest";
import { initI18n } from "../src/i18n/I18n.js";
import { isCmsRoute, mountCmsRoute } from "../src/pages/cms/index.js";
import { isSettingsRoute, mountSettingsRoute } from "../src/pages/settings/index.js";
import {
  isSystemInformationRoute,
  mountSystemInformationRoute,
} from "../src/pages/systemInformation/index.js";
import {
  isOtherGamesRoute,
  mountOtherGamesRoute,
} from "../src/pages/otherGames/index.js";
import noI18n from "../src/i18n/no.json";
import enI18n from "../src/i18n/en.json";

async function tick(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

function container(): HTMLElement {
  document.body.innerHTML = `<div id="app"></div>`;
  return document.getElementById("app")!;
}

beforeEach(() => {
  window.localStorage.clear();
  initI18n();
});

// ── CMS dispatcher ───────────────────────────────────────────────────────────

describe("PR-A6 CMS dispatcher", () => {
  it("matches static + dynamic CMS routes", () => {
    expect(isCmsRoute("/cms")).toBe(true);
    expect(isCmsRoute("/faq")).toBe(true);
    expect(isCmsRoute("/addFAQ")).toBe(true);
    expect(isCmsRoute("/faqEdit/abc123")).toBe(true);
    expect(isCmsRoute("/TermsofService")).toBe(true);
    expect(isCmsRoute("/Support")).toBe(true);
    expect(isCmsRoute("/Aboutus")).toBe(true);
    expect(isCmsRoute("/ResponsibleGameing")).toBe(true);
    expect(isCmsRoute("/LinksofOtherAgencies")).toBe(true);

    expect(isCmsRoute("/admin")).toBe(false);
    expect(isCmsRoute("/settings")).toBe(false);
    expect(isCmsRoute("/faq/something-else")).toBe(false);
  });

  it("/cms renders 6-row static table with links to sub-pages", () => {
    const host = container();
    mountCmsRoute(host, "/cms");
    const table = host.querySelector('[data-testid="cms-table"]');
    expect(table).toBeTruthy();
    const rows = host.querySelectorAll("tbody tr");
    expect(rows.length).toBe(6);
    // Banner present
    expect(host.querySelector('[data-testid="cms-placeholder-banner"]')).toBeTruthy();
    // Responsible row points to /ResponsibleGameing
    const responsibleRow = host.querySelector('[data-testid="cms-row-responsible"]');
    expect(responsibleRow?.innerHTML).toContain("#/ResponsibleGameing");
  });

  it("/ResponsibleGameing shows regulatory lock banner and disables edit", async () => {
    const host = container();
    mountCmsRoute(host, "/ResponsibleGameing");
    await tick();
    expect(host.querySelector('[data-testid="cms-regulatory-lock-banner"]')).toBeTruthy();
    const textarea = host.querySelector<HTMLTextAreaElement>('[data-testid="cms-body-textarea"]');
    expect(textarea?.disabled).toBe(true);
    const submit = host.querySelector<HTMLButtonElement>('[data-action="save-cms-text"]');
    expect(submit?.disabled).toBe(true);
  });

  it("/TermsofService allows edit (no regulatory lock)", async () => {
    const host = container();
    mountCmsRoute(host, "/TermsofService");
    await tick();
    const textarea = host.querySelector<HTMLTextAreaElement>('[data-testid="cms-body-textarea"]');
    expect(textarea?.disabled).toBe(false);
    const submit = host.querySelector<HTMLButtonElement>('[data-action="save-cms-text"]');
    expect(submit?.disabled).toBe(false);
  });

  it("/faq renders DataTable placeholder with add button", async () => {
    const host = container();
    mountCmsRoute(host, "/faq");
    await tick();
    expect(host.querySelector('[data-testid="cms-placeholder-banner"]')).toBeTruthy();
    const addBtn = host.querySelector<HTMLAnchorElement>('[data-action="add-faq"]');
    expect(addBtn).toBeTruthy();
    expect(addBtn!.href).toContain("#/addFAQ");
  });

  it("/addFAQ renders form with question + answer required fields", async () => {
    const host = container();
    mountCmsRoute(host, "/addFAQ");
    await tick();
    const form = host.querySelector<HTMLFormElement>('[data-testid="faq-form"]');
    expect(form).toBeTruthy();
    expect(form!.querySelector<HTMLInputElement>("#ff-question")!.required).toBe(true);
    expect(form!.querySelector<HTMLTextAreaElement>("#ff-answer")!.required).toBe(true);
  });
});

// ── Settings dispatcher ──────────────────────────────────────────────────────

describe("PR-A6 Settings dispatcher", () => {
  it("matches settings + maintenance routes", () => {
    expect(isSettingsRoute("/settings")).toBe(true);
    expect(isSettingsRoute("/maintenance")).toBe(true);
    expect(isSettingsRoute("/maintenance/edit/m1")).toBe(true);
    expect(isSettingsRoute("/cms")).toBe(false);
    expect(isSettingsRoute("/maintenance/edit/")).toBe(false);
  });

  it("/settings renders form with read-only spiller-tak + info banner", async () => {
    const host = container();
    mountSettingsRoute(host, "/settings");
    await tick();
    expect(host.querySelector('[data-testid="settings-placeholder-banner"]')).toBeTruthy();
    expect(
      host.querySelector('[data-testid="per-hall-spillvett-override-info"]')
    ).toBeTruthy();
    const daily = host.querySelector<HTMLInputElement>('[data-testid="sf-daily-readonly"]');
    expect(daily?.readOnly).toBe(true);
    const monthly = host.querySelector<HTMLInputElement>('[data-testid="sf-monthly-readonly"]');
    expect(monthly?.readOnly).toBe(true);
  });

  it("/maintenance renders status block + edit button", async () => {
    const host = container();
    mountSettingsRoute(host, "/maintenance");
    await tick();
    const edit = host.querySelector<HTMLAnchorElement>('[data-action="edit-maintenance"]');
    expect(edit).toBeTruthy();
    expect(edit!.href).toContain("#/maintenance/edit/");
  });

  it("/maintenance/edit/:id renders form with status select", async () => {
    const host = container();
    mountSettingsRoute(host, "/maintenance/edit/maintenance-default");
    await tick();
    const form = host.querySelector<HTMLFormElement>('[data-testid="maintenance-form"]');
    expect(form).toBeTruthy();
    const status = form!.querySelector<HTMLSelectElement>("#mf-status");
    expect(status).toBeTruthy();
    expect(status!.options.length).toBe(2);
  });
});

// ── SystemInformation dispatcher ─────────────────────────────────────────────

describe("PR-A6 SystemInformation dispatcher", () => {
  it("matches system-info route", () => {
    expect(isSystemInformationRoute("/system/systemInformation")).toBe(true);
    expect(isSystemInformationRoute("/system/anything-else")).toBe(false);
    expect(isSystemInformationRoute("/settings")).toBe(false);
  });

  it("renders placeholder banner + textarea", async () => {
    const host = container();
    mountSystemInformationRoute(host, "/system/systemInformation");
    await tick();
    expect(
      host.querySelector('[data-testid="system-info-placeholder-banner"]')
    ).toBeTruthy();
    const textarea = host.querySelector<HTMLTextAreaElement>(
      '[data-testid="system-info-textarea"]'
    );
    expect(textarea).toBeTruthy();
  });

  it("persists edit through localStorage roundtrip", async () => {
    const host = container();
    mountSystemInformationRoute(host, "/system/systemInformation");
    await tick();

    const textarea = host.querySelector<HTMLTextAreaElement>(
      '[data-testid="system-info-textarea"]'
    )!;
    textarea.value = "Hello PR-A6";
    const form = host.querySelector<HTMLFormElement>('[data-testid="system-info-form"]')!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();

    // Re-mount to verify persistence
    const host2 = container();
    mountSystemInformationRoute(host2, "/system/systemInformation");
    await tick();
    const textarea2 = host2.querySelector<HTMLTextAreaElement>(
      '[data-testid="system-info-textarea"]'
    )!;
    expect(textarea2.value).toBe("Hello PR-A6");
  });
});

// ── otherGames dispatcher ────────────────────────────────────────────────────

describe("PR-A6 otherGames dispatcher", () => {
  it("matches 4 mini-game routes", () => {
    expect(isOtherGamesRoute("/wheelOfFortune")).toBe(true);
    expect(isOtherGamesRoute("/treasureChest")).toBe(true);
    expect(isOtherGamesRoute("/mystery")).toBe(true);
    expect(isOtherGamesRoute("/colorDraft")).toBe(true);
    expect(isOtherGamesRoute("/cms")).toBe(false);
    expect(isOtherGamesRoute("/wheelOfFortune/extra")).toBe(false);
  });

  it("/wheelOfFortune renders 24 prize inputs", async () => {
    const host = container();
    mountOtherGamesRoute(host, "/wheelOfFortune");
    await tick();
    const inputs = host.querySelectorAll<HTMLInputElement>(
      '[data-testid="wheel-prizes"] input[type="number"]'
    );
    expect(inputs.length).toBe(24);
    expect(host.querySelector('[data-testid="wheel-placeholder-banner"]')).toBeTruthy();
  });

  it("/treasureChest renders 10 prize inputs", async () => {
    const host = container();
    mountOtherGamesRoute(host, "/treasureChest");
    await tick();
    const inputs = host.querySelectorAll<HTMLInputElement>(
      '[data-testid="chest-prizes"] input[type="number"]'
    );
    expect(inputs.length).toBe(10);
  });

  it("/mystery renders 6 prize inputs", async () => {
    const host = container();
    mountOtherGamesRoute(host, "/mystery");
    await tick();
    const inputs = host.querySelectorAll<HTMLInputElement>(
      '[data-testid="mystery-prizes"] input[type="number"]'
    );
    expect(inputs.length).toBe(6);
  });

  it("/colorDraft renders 4 inputs per color × 3 colors", async () => {
    const host = container();
    mountOtherGamesRoute(host, "/colorDraft");
    await tick();
    const red = host.querySelectorAll<HTMLInputElement>(
      '[data-testid="colordraft-red"] input[type="number"]'
    );
    const yellow = host.querySelectorAll<HTMLInputElement>(
      '[data-testid="colordraft-yellow"] input[type="number"]'
    );
    const green = host.querySelectorAll<HTMLInputElement>(
      '[data-testid="colordraft-green"] input[type="number"]'
    );
    expect(red.length).toBe(4);
    expect(yellow.length).toBe(4);
    expect(green.length).toBe(4);
  });

  it("wheelOfFortune form submit persists prize values", async () => {
    const host = container();
    mountOtherGamesRoute(host, "/wheelOfFortune");
    await tick();

    const first = host.querySelector<HTMLInputElement>(
      '[data-testid="wheel-prizes"] input[name="price-0"]'
    )!;
    first.value = "777";
    const form = host.querySelector<HTMLFormElement>('[data-testid="wheel-form"]')!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();

    const host2 = container();
    mountOtherGamesRoute(host2, "/wheelOfFortune");
    await tick();
    const first2 = host2.querySelector<HTMLInputElement>(
      '[data-testid="wheel-prizes"] input[name="price-0"]'
    )!;
    expect(first2.value).toBe("777");
  });
});

// ── i18n key coverage ───────────────────────────────────────────────────────

describe("PR-A6 i18n-keys present in NO + EN", () => {
  const REQUIRED_KEYS = [
    "cms_placeholder_banner",
    "cms_spillvett_audit_required_title",
    "cms_spillvett_audit_required_body",
    "terms_of_service",
    "responsible_gaming",
    "question",
    "maintenance_management",
    "maintenance_message",
    "maintenance_start_date",
    "maintenance_end_date",
    "maintenance_status",
    "show_before_minutes",
    "settings_placeholder_banner",
    "per_hall_spillvett_override_info",
    "system_information_body",
    "system_information_placeholder_banner",
    "wheel_of_fortune_prize",
    "other_games_placeholder_banner",
  ];

  it("NO has all PR-A6 keys", () => {
    const no = noI18n as Record<string, string>;
    for (const k of REQUIRED_KEYS) {
      expect(no[k], `missing NO key: ${k}`).toBeTruthy();
    }
  });

  it("EN has all PR-A6 keys", () => {
    const en = enI18n as Record<string, string>;
    for (const k of REQUIRED_KEYS) {
      expect(en[k], `missing EN key: ${k}`).toBeTruthy();
    }
  });
});
