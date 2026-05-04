/**
 * ComboPanel phase-aware buy-button-label tests (Tobias 2026-05-04, Bug 2).
 *
 * Verifiserer at `setBuyMoreLabel(label)` oppdaterer pill-teksten i
 * Hovedspill-kolonnen. Speiler BuyPopup phase-aware tittel-test så
 * samme intent dekkes på begge stedene UI-en kommuniserer "kjøp gjelder
 * neste runde".
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Text } from "pixi.js";
import { ComboPanel } from "./ComboPanel.js";

describe("ComboPanel — setBuyMoreLabel (Tobias 2026-05-04, Bug 2)", () => {
  let panel: ComboPanel;

  beforeEach(() => {
    panel = new ComboPanel(900);
  });

  afterEach(() => {
    panel.destroy({ children: true });
  });

  function findBuyButtonText(p: ComboPanel): string | null {
    // Walk children rekursivt — pill-tekst ligger inni buyButton-Container
    // inni hovedspill-kolonnen. Vi tar første Text-noden som matcher
    // forventede tekst-verdier.
    function walk(container: { children: Array<unknown> }): string | null {
      for (const child of container.children) {
        if (child instanceof Text) {
          if (
            child.text === "Kjøp flere brett" ||
            child.text === "Forhåndskjøp neste runde"
          ) {
            return child.text;
          }
        }
        const candidate = child as { children?: Array<unknown> };
        if (candidate.children && Array.isArray(candidate.children)) {
          const found = walk(candidate as { children: Array<unknown> });
          if (found) return found;
        }
      }
      return null;
    }
    return walk(panel);
  }

  it("default label er 'Kjøp flere brett'", () => {
    expect(findBuyButtonText(panel)).toBe("Kjøp flere brett");
  });

  it("setBuyMoreLabel('Forhåndskjøp neste runde') oppdaterer pill-teksten", () => {
    panel.setBuyMoreLabel("Forhåndskjøp neste runde");
    expect(findBuyButtonText(panel)).toBe("Forhåndskjøp neste runde");
  });

  it("setBuyMoreLabel kan toggle frem og tilbake (LOBBY ↔ RUNNING)", () => {
    panel.setBuyMoreLabel("Forhåndskjøp neste runde");
    panel.setBuyMoreLabel("Kjøp flere brett");
    expect(findBuyButtonText(panel)).toBe("Kjøp flere brett");
    panel.setBuyMoreLabel("Forhåndskjøp neste runde");
    expect(findBuyButtonText(panel)).toBe("Forhåndskjøp neste runde");
  });

  it("er idempotent — flere kall med samme verdi gjør ingenting", () => {
    panel.setBuyMoreLabel("Forhåndskjøp neste runde");
    panel.setBuyMoreLabel("Forhåndskjøp neste runde");
    expect(findBuyButtonText(panel)).toBe("Forhåndskjøp neste runde");
  });
});
