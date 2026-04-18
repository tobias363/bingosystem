/**
 * @vitest-environment happy-dom
 *
 * Game1BuyPopup tester — dekker D1 (30-brett-grense med vekting) og D2 (X-slett per rad).
 *
 * Unity-referanser:
 *   - `BingoTemplates.cs:86` — `maxPurchaseTicket = 30`
 *   - `Game1PurchaseTicket.cs:67-93`, `:69` — `alreadyPurchased` fratrekk
 *   - `PrefabGame1TicketPurchaseSubType.cs:48-58,76` — `AllowMorePurchase` (plus-disable)
 *   - `Game1ViewPurchaseElvisTicket.cs:17,49-76` — deleteBtn-pattern (tilpasset)
 *
 * Backend-grense håndheves i `apps/backend/src/sockets/gameEvents.ts:533-547`.
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
  // happy-dom gir oss document; stub ResizeObserver (brukes av HtmlOverlayManager).
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

/** Finn kort for gitt type-navn (første <div> med matchende tekst i container). */
function findTypeCard(container: HTMLElement, typeIndex: number): HTMLElement {
  const grid = container.querySelector(".g1-overlay-root") as HTMLElement;
  // typesContainer er første grid child inne i popup-card
  const backdrop = grid.children[grid.children.length - 1] as HTMLElement;
  const card = backdrop.firstElementChild as HTMLElement;
  const typesContainer = card.children[1] as HTMLElement; // [0]=title, [1]=grid
  return typesContainer.children[typeIndex] as HTMLElement;
}

function getPlusBtn(cardEl: HTMLElement): HTMLButtonElement {
  const qtyRow = cardEl.lastElementChild as HTMLElement;
  // qtyRow children: [minus, qtyLabel, plus]
  return qtyRow.children[2] as HTMLButtonElement;
}

function getMinusBtn(cardEl: HTMLElement): HTMLButtonElement {
  const qtyRow = cardEl.lastElementChild as HTMLElement;
  return qtyRow.children[0] as HTMLButtonElement;
}

function getQtyLabel(cardEl: HTMLElement): HTMLSpanElement {
  const qtyRow = cardEl.lastElementChild as HTMLElement;
  return qtyRow.children[1] as HTMLSpanElement;
}

function getClearBtn(cardEl: HTMLElement): HTMLButtonElement {
  // X-knappen er første child (position:absolute top-right)
  return cardEl.firstElementChild as HTMLButtonElement;
}

function getBuyBtn(container: HTMLElement): HTMLButtonElement {
  // Buy-knappen er første button i btnRow (siste child i card)
  const root = container.querySelector(".g1-overlay-root") as HTMLElement;
  const backdrop = root.children[root.children.length - 1] as HTMLElement;
  const card = backdrop.firstElementChild as HTMLElement;
  const btnRow = card.lastElementChild as HTMLElement;
  return btnRow.children[0] as HTMLButtonElement;
}

function getStatusMsg(container: HTMLElement): HTMLElement {
  const root = container.querySelector(".g1-overlay-root") as HTMLElement;
  const backdrop = root.children[root.children.length - 1] as HTMLElement;
  const card = backdrop.firstElementChild as HTMLElement;
  // card children: [title, typesContainer, sep, totalLabel, statusMsg, btnRow]
  return card.children[4] as HTMLElement;
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

    // Klikk 10 ganger → 10 × 3 = 30 vektede brett
    for (let i = 0; i < 10; i++) {
      largePlus.click();
    }

    expect(popup.getTotalTicketCount()).toBe(30);
    expect(largePlus.disabled).toBe(true);
    expect(largePlus.style.opacity).toBe("0.35");

    // Også small plus skal disables (ingen plass til 1 mer)
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

    // Statusmelding "Maks 30 brett valgt" (grønn)
    const status = getStatusMsg(container);
    expect(status.textContent).toBe("Maks 30 brett valgt");
    expect(status.style.color).toBe("#81c784"); // grønn success-farge
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

    // Small plus burde også re-enables (ticketCount=1 ≤ remaining=3)
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

describe("Game1BuyPopup — X-slett per rad (D2)", () => {
  let popup: Game1BuyPopup;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    ({ popup, container } = makePopup());
  });

  it("Test 4: X-knapp nullstiller qty og updaterer total", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const largeCard = findTypeCard(container, 1);
    const plus = getPlusBtn(largeCard);
    const clearBtn = getClearBtn(largeCard);

    plus.click();
    plus.click();
    expect(popup.getTotalTicketCount()).toBe(6); // 2 × ticketCount 3
    expect(clearBtn.style.display).toBe("block");

    clearBtn.click();

    expect(popup.getTotalTicketCount()).toBe(0);
    expect(getQtyLabel(largeCard).textContent).toBe("0");
    // X-knapp skjules når qty=0
    expect(clearBtn.style.display).toBe("none");
  });

  it("X-knapp er skjult ved qty=0 initielt", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const smallCard = findTypeCard(container, 0);
    const clear = getClearBtn(smallCard);
    expect(clear.style.display).toBe("none");
  });

  it("X-knapp blir synlig når qty øker over 0", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const smallCard = findTypeCard(container, 0);
    const clear = getClearBtn(smallCard);

    expect(clear.style.display).toBe("none");
    getPlusBtn(smallCard).click();
    expect(clear.style.display).toBe("block");
  });

  it("X-knapp påvirker ikke andre rader", () => {
    popup.showWithTypes(ENTRY_FEE, TYPES, 0);
    const smallCard = findTypeCard(container, 0);
    const largeCard = findTypeCard(container, 1);

    getPlusBtn(smallCard).click();
    getPlusBtn(smallCard).click();
    getPlusBtn(largeCard).click(); // 2 small + 1 large = 2 + 3 = 5

    expect(popup.getTotalTicketCount()).toBe(5);

    getClearBtn(smallCard).click(); // bare small nullstilles

    expect(popup.getTotalTicketCount()).toBe(3); // bare large igjen
    expect(getQtyLabel(largeCard).textContent).toBe("1");
  });
});
