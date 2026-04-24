/**
 * @vitest-environment happy-dom
 *
 * Game1BuyPopup tester — 30-brett-grense (D1) med Bong-portet UI (2026-04-24).
 *
 * Unity-referanser:
 *   - `BingoTemplates.cs:86` — `maxPurchaseTicket = 30`
 *   - `Game1PurchaseTicket.cs:67-93`, `:69` — `alreadyPurchased` fratrekk
 *   - `PrefabGame1TicketPurchaseSubType.cs:48-58,76` — `AllowMorePurchase` (plus-disable)
 *
 * Backend-grense håndheves i `apps/backend/src/sockets/gameEvents.ts:533-547`.
 *
 * NB: X-knapp-per-rad-tester (D2) droppet når popupen ble portert til
 * Bong.jsx-design 2026-04-24 — stepper-minus-knappen dekker samme funksjon
 * (trykk ned til 0). Separat clear-feature kan reintroduseres senere om
 * behovet dukker opp.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Game1BuyPopup } from "./Game1BuyPopup.js";
import { HtmlOverlayManager } from "./HtmlOverlayManager.js";

// ── Helpers ──────────────────────────────────────────────────────────────

const ENTRY_FEE = 10;

const TYPES = [
  { name: "Small", type: "small-yellow", priceMultiplier: 1, ticketCount: 1 },
  { name: "Large Elvis", type: "elvis", priceMultiplier: 3, ticketCount: 3 },
];

function makePopup(): { popup: Game1BuyPopup; container: HTMLElement } {
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const overlay = new HtmlOverlayManager(container);
  const popup = new Game1BuyPopup(overlay);
  return { popup, container };
}

/**
 * DOM-struktur (Bong-port 2026-04-24):
 *   overlayRoot > backdrop > card
 *   card.children: [0] header, [1] typesContainer, [2] sep, [3] statusMsg,
 *                  [4] totalRow, [5] buyBtn, [6] cancelBtn
 *   typesContainer.children[i] = row (én per billett-type)
 *   row.children: [0] left (brett-ikon + info), [1] stepper
 *   stepper.children: [minus, qtyLabel, plus]
 */
function getCard(container: HTMLElement): HTMLElement {
  const overlay = container.querySelector(".g1-overlay-root") as HTMLElement;
  const backdrop = overlay.children[overlay.children.length - 1] as HTMLElement;
  return backdrop.firstElementChild as HTMLElement;
}

function findTypeCard(container: HTMLElement, typeIndex: number): HTMLElement {
  const card = getCard(container);
  const typesContainer = card.children[1] as HTMLElement;
  return typesContainer.children[typeIndex] as HTMLElement;
}

function getStepper(rowEl: HTMLElement): HTMLElement {
  return rowEl.children[1] as HTMLElement;
}

function getPlusBtn(rowEl: HTMLElement): HTMLButtonElement {
  return getStepper(rowEl).children[2] as HTMLButtonElement;
}

function getMinusBtn(rowEl: HTMLElement): HTMLButtonElement {
  return getStepper(rowEl).children[0] as HTMLButtonElement;
}

function getQtyLabel(rowEl: HTMLElement): HTMLSpanElement {
  return getStepper(rowEl).children[1] as HTMLSpanElement;
}

function getBuyBtn(container: HTMLElement): HTMLButtonElement {
  return getCard(container).children[5] as HTMLButtonElement;
}

function getStatusMsg(container: HTMLElement): HTMLElement {
  return getCard(container).children[3] as HTMLElement;
}

// ── Test-suites ──────────────────────────────────────────────────────────

describe("Game1BuyPopup — 30-brett-grense (D1)", () => {
  let popup: Game1BuyPopup;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    ({ popup, container } = makePopup());
  });

  it("Test 1: 10× Large = 30 vektet, 11. Large plus disabled", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const largeCard = findTypeCard(container, 1); // elvis (ticketCount=3)
    const largePlus = getPlusBtn(largeCard);

    for (let i = 0; i < 10; i++) {
      largePlus.click();
    }

    expect(popup.getTotalTicketCount()).toBe(30);
    expect(largePlus.disabled).toBe(true);
    expect(largePlus.style.opacity).toBe("0.35");

    const smallCard = findTypeCard(container, 0);
    const smallPlus = getPlusBtn(smallCard);
    expect(smallPlus.disabled).toBe(true);
  });

  it("Test 2: 1 Large + 27 small → vektet=30, alle plus disabled", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const smallCard = findTypeCard(container, 0);
    const largeCard = findTypeCard(container, 1);

    getPlusBtn(largeCard).click(); // +3
    for (let i = 0; i < 27; i++) {
      getPlusBtn(smallCard).click(); // +1 × 27
    }

    expect(popup.getTotalTicketCount()).toBe(30);
    expect(getPlusBtn(largeCard).disabled).toBe(true);
    expect(getPlusBtn(smallCard).disabled).toBe(true);

    const status = getStatusMsg(container);
    expect(status.textContent).toBe("Maks 30 brett valgt");
    expect(status.style.color).toBe("#81c784"); // grønn success
  });

  it("Test 3: Etter minus re-enables plus-knappene", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const largeCard = findTypeCard(container, 1);
    const largePlus = getPlusBtn(largeCard);
    const largeMinus = getMinusBtn(largeCard);

    for (let i = 0; i < 10; i++) largePlus.click();
    expect(largePlus.disabled).toBe(true);

    largeMinus.click(); // Nå 27 vektet, remaining=3
    expect(largePlus.disabled).toBe(false);
    expect(largePlus.style.opacity).toBe("1");

    const smallPlus = getPlusBtn(findTypeCard(container, 0));
    expect(smallPlus.disabled).toBe(false);
  });

  it("Test 5: alreadyPurchased=30 → alle plus disabled + hard-cap melding", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 30);

    const smallPlus = getPlusBtn(findTypeCard(container, 0));
    const largePlus = getPlusBtn(findTypeCard(container, 1));
    expect(smallPlus.disabled).toBe(true);
    expect(largePlus.disabled).toBe(true);

    const status = getStatusMsg(container);
    expect(status.textContent).toBe("Du har maks 30 brett denne runden");

    const buyBtn = getBuyBtn(container);
    expect(buyBtn.disabled).toBe(true);
  });

  it("alreadyPurchased=28 + small (ticketCount=1) tillates, Large (ticketCount=3) disables", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 28);

    const smallPlus = getPlusBtn(findTypeCard(container, 0));
    const largePlus = getPlusBtn(findTypeCard(container, 1));

    // remaining = 30 - 28 = 2
    // small.ticketCount=1 ≤ 2 → enabled
    // large.ticketCount=3 > 2 → disabled
    expect(smallPlus.disabled).toBe(false);
    expect(largePlus.disabled).toBe(true);
  });
});

describe("Game1BuyPopup — Bong-portet UI-atferd (2026-04-24)", () => {
  let popup: Game1BuyPopup;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    ({ popup, container } = makePopup());
  });

  it("Stepper-minus går ned til 0 og oppdaterer total", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const largeCard = findTypeCard(container, 1);
    const plus = getPlusBtn(largeCard);
    const minus = getMinusBtn(largeCard);

    plus.click();
    plus.click();
    expect(popup.getTotalTicketCount()).toBe(6); // 2 × ticketCount 3

    minus.click();
    minus.click();
    expect(popup.getTotalTicketCount()).toBe(0);
    expect(getQtyLabel(largeCard).textContent).toBe("0");
  });

  it("Stepper-minus på 0 er no-op (går ikke under 0)", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const smallCard = findTypeCard(container, 0);
    const minus = getMinusBtn(smallCard);

    minus.click();
    minus.click();
    expect(popup.getTotalTicketCount()).toBe(0);
    expect(getQtyLabel(smallCard).textContent).toBe("0");
  });

  it("Aktiv rad får gyllen glød (bakgrunn + inset shadow)", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const smallCard = findTypeCard(container, 0);
    getPlusBtn(smallCard).click();

    // Rad har gyllen bg + inset shadow når qty > 0 (happy-dom beholder
    // original CSS-string uten whitespace-normalisering).
    expect(smallCard.style.background).toMatch(/rgba\(245,\s*184,\s*65/);
    expect(smallCard.style.boxShadow).toMatch(/rgba\(245,\s*184,\s*65/);
  });

  it("Buy-knapp viser 'Kjøp X brett · Y kr' når brett er valgt", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const smallCard = findTypeCard(container, 0);
    getPlusBtn(smallCard).click();
    getPlusBtn(smallCard).click(); // 2 × 10 kr = 20 kr, 2 brett

    const buyBtn = getBuyBtn(container);
    expect(buyBtn.textContent).toBe("Kjøp 2 brett · 20 kr");
    expect(buyBtn.disabled).toBe(false);
  });

  it("Buy-knapp viser 'Velg brett for å kjøpe' når 0 valgt", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const buyBtn = getBuyBtn(container);
    expect(buyBtn.textContent).toBe("Velg brett for å kjøpe");
    expect(buyBtn.disabled).toBe(true);
  });
});
