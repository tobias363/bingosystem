/**
 * Snapshot/render test for AgentFormPage (Tobias-direktiv 2026-04-27 —
 * "agent-creation i admin-backend").
 *
 * Verifies that:
 *   1. The create-form renders all required fields per OpenAPI
 *      `/api/admin/agents POST` contract.
 *   2. The language dropdown matches the OpenAPI enum (nb/nn/en/sv/da)
 *      and NOT the legacy "no/en" pair (which crashed backend).
 *   3. The password input enforces minlength=12 (matches platformService).
 *   4. The parentUserId field is present (BIN-583 manager-hierarki).
 *   5. The hall multiselect is populated from the listHalls() mock.
 *
 * API-modulen mockes via vi.mock — vi tester strukturen i den rendrede
 * markup-en, ikke nettverkskall.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../api/admin-agents.js", () => ({
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  getAgent: vi.fn(),
  listAgents: vi.fn(async () => []),
}));

vi.mock("../../../api/admin-halls.js", () => ({
  listHalls: vi.fn(async () => [
    { id: "hall-1", name: "Notodden Bingo", isActive: true },
    { id: "hall-2", name: "Hamar Bingo", isActive: true },
  ]),
}));

// Toast is a side-effect-only API; stub it out to avoid touching the DOM.
vi.mock("../../../components/Toast.js", () => ({
  Toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { renderAgentFormPage } from "../AgentFormPage.js";

describe("AgentFormPage — create-mode", () => {
  let container: HTMLElement;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    renderAgentFormPage(container, null);
    // Lar mount() fullføre.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("renderer alle påkrevde felt fra OpenAPI", () => {
    const html = container.innerHTML;
    expect(html).toContain('id="af-displayName"');
    expect(html).toContain('id="af-surname"');
    expect(html).toContain('id="af-email"');
    expect(html).toContain('id="af-phone"');
    expect(html).toContain('id="af-password"');
    expect(html).toContain('id="af-language"');
    expect(html).toContain('id="af-parentUserId"');
    expect(html).toContain('id="af-halls"');
    expect(html).toContain('id="af-primary"');
  });

  it("har language-dropdown som matcher OpenAPI enum (nb/nn/en/sv/da)", () => {
    const sel = container.querySelector<HTMLSelectElement>("#af-language");
    expect(sel).not.toBeNull();
    const values = Array.from(sel!.options).map((o) => o.value);
    expect(values).toEqual(["nb", "nn", "en", "sv", "da"]);
  });

  it("language-default er nb (matcher backend AgentService.SUPPORTED_LANGUAGES default)", () => {
    const sel = container.querySelector<HTMLSelectElement>("#af-language");
    expect(sel?.value).toBe("nb");
  });

  it("password-feltet håndhever minlength 12 (matcher platformService.register)", () => {
    const pw = container.querySelector<HTMLInputElement>("#af-password");
    expect(pw).not.toBeNull();
    expect(pw!.minLength).toBe(12);
    expect(pw!.required).toBe(true);
    expect(pw!.autocomplete).toBe("new-password");
  });

  it("password help-block er synlig med 12-tegn-veiledning", () => {
    const help = container.querySelector('[data-testid="agent-password-help"]');
    expect(help).not.toBeNull();
    expect(help!.textContent).toContain("12");
  });

  it("hall-multiselect er populert fra listHalls()", () => {
    const sel = container.querySelector<HTMLSelectElement>("#af-halls");
    expect(sel).not.toBeNull();
    expect(sel!.multiple).toBe(true);
    const opts = Array.from(sel!.options).map((o) => ({ value: o.value, text: o.text }));
    expect(opts).toEqual([
      { value: "hall-1", text: "Notodden Bingo" },
      { value: "hall-2", text: "Hamar Bingo" },
    ]);
  });

  it("primary-hall-dropdown har en placeholder + alle hallene", () => {
    const sel = container.querySelector<HTMLSelectElement>("#af-primary");
    expect(sel).not.toBeNull();
    const values = Array.from(sel!.options).map((o) => o.value);
    expect(values).toEqual(["", "hall-1", "hall-2"]);
  });

  it("parentUserId-dropdown har en 'ingen overordnet'-option først", () => {
    const sel = container.querySelector<HTMLSelectElement>("#af-parentUserId");
    expect(sel).not.toBeNull();
    expect(sel!.options[0]?.value).toBe("");
  });

  it("submit-knappen har data-action='save-agent' (e2e-stable selector)", () => {
    const btn = container.querySelector('[data-action="save-agent"]');
    expect(btn).not.toBeNull();
  });

  it("'Cancel'-link peker tilbake til /agent-listen", () => {
    const links = container.querySelectorAll('a.btn');
    const cancelLink = Array.from(links).find((el) => el.getAttribute("href") === "#/agent");
    expect(cancelLink).not.toBeNull();
  });
});
