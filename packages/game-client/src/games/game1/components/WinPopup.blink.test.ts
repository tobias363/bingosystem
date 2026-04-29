/**
 * @vitest-environment happy-dom
 *
 * WinPopup blink-runde 8 regresjonstester.
 *
 * Tobias rapporterte 2026-04-30: "Det kom blink når popup av gevinster kommer
 * på rad 1, 2, 3 osv." — dvs. WinPopup (fase 1-4 vinn) blinker når den vises
 * over Pixi-canvas under live spill.
 *
 * To hazards funnet og fikset:
 *
 * 1. **`backdrop-filter: blur(4px)` på backdrop** — den dyreste paint-
 *    operasjonen mulig. Chrome må re-blure regionen hver gang Pixi-canvas
 *    re-promoterer composite-treet (skjer på hver draw/animation-tick mens
 *    bingo-baller trekkes). Identisk hazard som blink-runde 7 (Spillvett
 *    pause-modal, PR #672).
 *
 * 2. **`transition: all 180ms ease` på Lukk-knapp** — `all` inkluderer paint-
 *    properties (background, box-shadow). Hover-state-endring trigger re-paint-
 *    kaskade. Identisk pattern som Game1BuyPopup (PR #530).
 *
 * Disse testene fanger regresjon ved fremtidige rebakes/cascading-CSS-edits.
 *
 * Tidligere blink-fix-runder relatert til denne komponenten (round 6) er
 * dekket av WinPopup.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WinPopup } from "./WinPopup.js";

function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("WinPopup blink-runde 8 — paint-property hazards", () => {
  let parent: HTMLElement;
  let popup: WinPopup;

  beforeEach(() => {
    document.body.innerHTML = "";
    // Fjern stylesheet fra forrige test slik at ensureWinPopupStyles re-init.
    const oldStyle = document.getElementById("win-popup-styles");
    if (oldStyle) oldStyle.remove();
    parent = container();
    popup = new WinPopup(parent);
  });

  afterEach(() => {
    popup.destroy();
    parent.remove();
  });

  /**
   * Hazard #1 — `backdrop-filter: blur(4px)` over Pixi-canvas re-blur-
   * computer hver frame canvas oppdaterer. Erstattet med solid rgba.
   * Identisk fix som PR #672 (Spillvett pause-modal).
   */
  it("hazard #1: backdrop bruker IKKE backdrop-filter", () => {
    popup.show({ rows: 1, amount: 100 });
    const backdrop = parent.firstElementChild as HTMLElement | null;
    expect(backdrop).not.toBeNull();

    // Sjekk både camelCase (Object.assign) og kebab-case (CSS-properties).
    const inlineStyle = backdrop!.getAttribute("style") ?? "";
    expect(
      inlineStyle.toLowerCase(),
      `backdrop-filter er paint-hazard. Inline-style: "${inlineStyle}"`,
    ).not.toContain("backdrop-filter");
    expect(inlineStyle).not.toMatch(/backdropFilter/i);

    // Sjekk computed style som ekstra sikkerhet.
    expect(backdrop!.style.backdropFilter ?? "").toBe("");
  });

  /**
   * Hazard #2 — `transition: all 180ms ease` på Lukk-knappen. `all`
   * inkluderer paint-properties (background, box-shadow). Hover trigger
   * paint-kaskade. Identisk pattern som PR #530 (Game1BuyPopup).
   */
  it("hazard #2: Lukk-knapp har IKKE transition på paint-properties", () => {
    popup.show({ rows: 1, amount: 100 });
    const lukkBtn = Array.from(parent.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Lukk",
    );
    expect(lukkBtn).toBeDefined();

    const transition = lukkBtn!.style.transition ?? "";

    // `transition: all` inkluderer paint-properties — forbudt.
    expect(
      transition,
      `transition="${transition}" må ikke bruke 'all' (inkluderer background, box-shadow)`,
    ).not.toMatch(/\ball\b/);

    // Eksplisitte paint-properties i transition er forbudt.
    const forbiddenProps = [
      "background",
      "background-color",
      "box-shadow",
      "text-shadow",
      "filter",
      "backdrop-filter",
      "color",
    ];
    for (const prop of forbiddenProps) {
      expect(
        transition,
        `transition="${transition}" må ikke inneholde paint-property "${prop}"`,
      ).not.toContain(prop);
    }
  });

  /**
   * Verifiser at stylesheetet ikke inneholder paint-property-animasjoner i
   * `@keyframes` med `infinite` (vedvarende composite-trafikk over Pixi).
   * Begrensede paint-keyframes (wp-amount-glow er begrenset til 2 iterasjoner
   * — se WinPopup.test.ts) er greit fordi de stopper.
   */
  it("ingen @keyframes med infinite paint-property-animasjon", () => {
    popup.show({ rows: 1, amount: 100 });
    const styleEl = document.getElementById("win-popup-styles") as HTMLStyleElement | null;
    expect(styleEl).not.toBeNull();
    const css = styleEl!.textContent ?? "";

    // Sjekk at ingen wp-* animation-deklarasjon kombinerer paint-property
    // keyframes med infinite-iteration. Dette er det vi virkelig vil unngå.
    // Floating clovers (wp-float) animerer kun transform/opacity → safe.
    // Shimmer (wp-shimmer) animerer kun transform → safe.
    // Amount-glow (wp-amount-glow) animerer text-shadow → må IKKE være infinite.
    const ampersandGlowAnimDecl = /animation:\s*wp-amount-glow[^;]*infinite/i;
    expect(
      css.match(ampersandGlowAnimDecl),
      "wp-amount-glow må ikke kombineres med infinite",
    ).toBeNull();

    // Sjekk også elementenes inline-style.
    const allEls = parent.querySelectorAll("*");
    for (const el of Array.from(allEls)) {
      const style = (el as HTMLElement).style;
      const animation = style.animation ?? "";
      if (animation.includes("wp-amount-glow")) {
        expect(
          animation.toLowerCase(),
          `Element med wp-amount-glow må ikke ha infinite. Animation: "${animation}"`,
        ).not.toContain("infinite");
      }
    }
  });

  /**
   * Verifiser at popup-card og wrap kun bruker `transform`/`opacity` i
   * transitions — paint-properties (filter, background, box-shadow,
   * text-shadow) er forbudt fordi de tvinger Chrome til å re-paint i stedet
   * for å GPU-kompositere.
   */
  it("kun transform/opacity i transitions på popup-elementer", () => {
    popup.show({ rows: 1, amount: 100 });
    const allEls = parent.querySelectorAll("*");
    const forbiddenInTransition = [
      "filter",
      "backdrop-filter",
      "background",
      "background-color",
      "box-shadow",
      "text-shadow",
      "color",
    ];

    for (const el of Array.from(allEls)) {
      const transition = (el as HTMLElement).style.transition ?? "";
      if (transition === "" || transition === "none") continue;

      // `all` er forbudt fordi det implisitt inkluderer paint-properties.
      expect(
        transition,
        `Element ${(el as HTMLElement).tagName} har transition="${transition}" — 'all' er forbudt`,
      ).not.toMatch(/\ball\b/);

      for (const prop of forbiddenInTransition) {
        expect(
          transition,
          `Element ${(el as HTMLElement).tagName} har transition="${transition}" som inneholder forbudt paint-property "${prop}"`,
        ).not.toContain(prop);
      }
    }
  });

  /**
   * Verifiser at `will-change` ikke er satt til paint-properties. `will-
   * change: filter` (eller andre paint-properties) tvinger Chrome til å
   * promotere elementet og re-paint hver frame. Allerede fjernet i runde 3,
   * regresjons-vakt.
   */
  it("ingen will-change på paint-properties", () => {
    popup.show({ rows: 1, amount: 100 });
    const allEls = parent.querySelectorAll("*");
    const forbiddenInWillChange = [
      "filter",
      "backdrop-filter",
      "background",
      "background-color",
      "box-shadow",
      "text-shadow",
      "color",
    ];

    for (const el of Array.from(allEls)) {
      const willChange = (el as HTMLElement).style.willChange ?? "";
      if (willChange === "" || willChange === "auto") continue;

      for (const prop of forbiddenInWillChange) {
        expect(
          willChange,
          `Element ${(el as HTMLElement).tagName} har will-change="${willChange}" som inneholder paint-property "${prop}"`,
        ).not.toContain(prop);
      }
    }
  });
});
