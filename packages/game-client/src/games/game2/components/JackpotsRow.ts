/**
 * Spill 2 — 6 jackpot/gain-slots i en horisontal rad.
 *
 * 2026-05-06 (Tobias-direktiv — handoff redesign): byttet fra ETT samlet
 * `jackpots.png` (1672×398 med alle 6 baller + 6 amount-rektangler innebygd)
 * til SEKS individuelle ball-PNG-er + image-baserte labels + dynamisk
 * CSS-stylet amount-tekst.
 *
 * **Rendering-arkitektur:**
 *   - Pixi Sprite per slot (jackpot-1.png ... jackpot-6.png) — ball-grafikk
 *     med tall (9, 10, 11, 12, 13, 14-21) ferdig-bakt inn i hver PNG.
 *   - HTML-overlay per slot (via `HtmlOverlayManager`):
 *       • Topp: <img> med label-jackpot.png ELLER label-gain.png
 *       • Bunn: dynamisk CSS-stylet amount-tekst (5000 / 100 % / etc)
 *   - Active-glow-ring (Graphics) rundt current slot.
 *
 * **Hvorfor HTML-amount-tekst i stedet for ferdig-rendrete amount-PNG-er
 * fra mockup?** Admin kan sette ALLE jackpot-verdier fritt via
 * GameManagement (PR #971-#973). Statiske amount-bilder ville låse oss
 * til 5000/2500/1000/100/0. CSS-tekst gir full fleksibilitet og kan
 * styles for å matche mockupens visuelle stil.
 *
 * **Slot-mapping:**
 *   Index 0 = "9"     → jackpot-1.png + label-jackpot.png
 *   Index 1 = "10"    → jackpot-2.png + label-jackpot.png
 *   Index 2 = "11"    → jackpot-3.png + label-jackpot.png
 *   Index 3 = "12"    → jackpot-4.png + label-jackpot.png
 *   Index 4 = "13"    → jackpot-5.png + label-gain.png
 *   Index 5 = "14-21" → jackpot-6.png + label-gain.png
 *
 * Tobias-direktiv 2026-05-06: KUN slot 0-3 har "Jackpot"-label;
 * slot 4-5 har "Gain"-label.
 */

import { Container, Graphics, Sprite, Assets, type Texture } from "pixi.js";
import type { HtmlOverlayManager } from "../../game1/components/HtmlOverlayManager.js";

export interface JackpotSlotData {
  /** Slot-nøkkel: "9" | "10" | "11" | "12" | "13" | "14-21". */
  number: string;
  /** Premie i kroner (kommer ferdig-beregnet fra backend). */
  prize: number;
  /** Visuell label: "Jackpot" eller "Gain". */
  type: "gain" | "jackpot";
}

const SLOT_KEYS = ["9", "10", "11", "12", "13", "14-21"] as const;

/** Hvilken label-PNG som brukes per slot (Jackpot vs Gain). */
const SLOT_IS_JACKPOT = [true, true, true, true, false, false] as const;

/** Asset-URLer for de 6 ball-PNG-ene (jackpot-1 til jackpot-6). */
const JACKPOT_PNG_URLS = [
  "/web/games/assets/game2/design/jackpot-1.png",
  "/web/games/assets/game2/design/jackpot-2.png",
  "/web/games/assets/game2/design/jackpot-3.png",
  "/web/games/assets/game2/design/jackpot-4.png",
  "/web/games/assets/game2/design/jackpot-5.png",
  "/web/games/assets/game2/design/jackpot-6.png",
] as const;

/** Asset-URLer for de 2 label-PNG-ene. */
const LABEL_JACKPOT_URL = "/web/games/assets/game2/design/label-jackpot.png";
const LABEL_GAIN_URL = "/web/games/assets/game2/design/label-gain.png";

/** Naturlig PNG-aspect (alle 6 jackpot-N.png er 278×240). */
const SLOT_PNG_ASPECT = 278 / 240;

/**
 * Tile-størrelse: bredde + høyde + total-høyde for slot (inkl. label + amount).
 *
 * Layout per slot (top to bottom):
 *   - Label-image:  ~26px høy
 *   - Gap:           4px
 *   - Ball-sprite:  ~78px aspect-justert (78 × 67 ved aspect 278/240)
 *   - Gap:           8px
 *   - Amount-tekst: ~28px høy
 *
 * Total slot-høyde: ~145px ved BALL_WIDTH=78. ComboPanel.panelH må være
 * minst dette + padding for å unngå klipping.
 */
const BALL_WIDTH_DEFAULT = 78;
const LABEL_HEIGHT = 26;
const LABEL_GAP = 4;
const AMOUNT_GAP = 8;
const AMOUNT_HEIGHT = 28;

/** Max høyde av hele tile (brukt av `barHeight`-getter for ComboPanel-layout). */
const MAX_RENDERED_HEIGHT =
  LABEL_HEIGHT + LABEL_GAP + Math.round(BALL_WIDTH_DEFAULT / SLOT_PNG_ASPECT) + AMOUNT_GAP + AMOUNT_HEIGHT;

/** Active-slot glow-ring stroke-farger (gull). */
const ACTIVE_GLOW_COLOR = 0xffd97a;
const ACTIVE_GLOW_ALPHA = 1.0;

/**
 * CSS-stil for amount-tekst (under hver ball). Tobias-direktiv 2026-05-06:
 * dynamisk tekst som matcher mockupens visuelle stil — gull-gradient på
 * mørk-rød rektangel-bg, bold sans-serif med drop-shadow.
 */
const AMOUNT_BASE_STYLES: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  fontFamily: "Inter, system-ui, sans-serif",
  fontWeight: "800",
  fontSize: "16px",
  letterSpacing: "0.02em",
  color: "#fff5d6",
  textShadow: "0 1px 2px rgba(0,0,0,0.7), 0 0 4px rgba(255,200,80,0.3)",
  background: "linear-gradient(180deg, #5a1010 0%, #3a0808 100%)",
  border: "1px solid #c98a3a",
  borderRadius: "4px",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.5)",
  padding: "2px 8px",
  textAlign: "center" as CSSStyleDeclaration["textAlign"],
  pointerEvents: "none",
  userSelect: "none",
  transform: "translate(-50%, 0)",
  whiteSpace: "nowrap",
  minWidth: "44px",
};

/** CSS-stil for label-image (over hver ball). */
const LABEL_IMG_BASE_STYLES: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  height: `${LABEL_HEIGHT}px`,
  width: "auto",
  pointerEvents: "none",
  userSelect: "none",
  transform: "translate(-50%, 0)",
  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
};

interface SlotVisual {
  /** Pixi Sprite for ball-PNG (jackpot-N.png). */
  sprite: Sprite | null;
  /** HTML-IMG for label-PNG (label-jackpot.png eller label-gain.png). */
  labelEl: HTMLImageElement | null;
  /** HTML-DIV for amount-tekst. */
  amountEl: HTMLDivElement | null;
}

export class JackpotsRow extends Container {
  private slots: Map<string, SlotVisual> = new Map();
  private latestData: Map<string, JackpotSlotData> = new Map();
  private activeSlotKey: string | null = null;
  private rowWidth: number;
  private rowHeight: number;
  private activeGlow: Graphics;
  private spritesLoadedCount = 0;

  // ── HTML-overlay-state (labels + amounts) ────────────────────────────────
  private labelCanvas: HTMLCanvasElement | null = null;
  private labelOverlay: HtmlOverlayManager | null = null;
  private windowResizeHandler: (() => void) | null = null;

  constructor() {
    super();
    // Default: ComboPanel kaller `setBarWidth` etter konstruksjon så slots
    // distribueres jevnt over tilgjengelig bredde.
    this.rowWidth = 540;
    this.rowHeight = MAX_RENDERED_HEIGHT;
    this.activeGlow = new Graphics();
    this.addChild(this.activeGlow);

    // Lazy-load alle 6 ball-sprites parallelt.
    this.loadAllSprites();

    // Initialiser slot-data-strukturer (sprites mountes asynkront).
    SLOT_KEYS.forEach((key) => {
      this.slots.set(key, { sprite: null, labelEl: null, amountEl: null });
    });
  }

  /** Bredde av hele raden (brukt av `ComboPanel` for layout). */
  get barWidth(): number {
    return this.rowWidth;
  }

  /** Høyde av hele raden — fast verdi (label + ball + amount + gaps). */
  get barHeight(): number {
    return this.rowHeight;
  }

  /**
   * Sett tilgjengelig bredde. 6 slots distribueres jevnt — ball-bredden
   * skaleres slik at de fyller raden uten å overlappe.
   *
   * Idempotent — gjør ingenting hvis bredden ikke endret.
   */
  setBarWidth(width: number): void {
    if (width === this.rowWidth) return;
    this.rowWidth = width;
    this.applyLayout();
  }

  /**
   * Backend-driver: oppdater prize-listen.
   *
   * Tobias-direktiv 2026-05-04: under nedtelling til ny runde sender
   * server prize=0 for alle slots — vi behold forrige rundes priser
   * gjennom countdown for bedre UX. Hvis vi aldri har hatt non-zero,
   * tillater vi 0-update.
   */
  update(list: JackpotSlotData[]): void {
    const allZero = list.every((entry) => !entry.prize || entry.prize <= 0);
    const haveExistingValues = Array.from(this.latestData.values()).some(
      (e) => e.prize > 0,
    );
    if (allZero && haveExistingValues) {
      return;
    }
    for (const entry of list) {
      this.latestData.set(entry.number, entry);
    }
    this.renderValues();
  }

  /**
   * Markér slot som matcher current draw count som aktiv.
   *   draws 1-8  → ingen aktiv slot
   *   draws 9-13 → slot "9".."13" aktiv
   *   draws 14-21 → slot "14-21" aktiv
   */
  setCurrentDrawCount(drawCount: number): void {
    let key: string | null = null;
    if (drawCount >= 9 && drawCount <= 13) {
      key = String(drawCount);
    } else if (drawCount >= 14 && drawCount <= 21) {
      key = "14-21";
    }
    if (key === this.activeSlotKey) return;
    this.activeSlotKey = key;
    this.renderActiveGlow();
  }

  /**
   * Mount HTML-elementer (label-img + amount-text) over Pixi-canvas.
   * Idempotent — kan kalles flere ganger.
   */
  attachLabels(canvas: HTMLCanvasElement, overlayManager: HtmlOverlayManager): void {
    if (!canvas || !overlayManager) return;
    if (typeof document === "undefined") return;

    this.labelCanvas = canvas;
    this.labelOverlay = overlayManager;

    const overlayRoot = overlayManager.getRoot();
    if (!overlayRoot) return;

    SLOT_KEYS.forEach((key, idx) => {
      const slot = this.slots.get(key);
      if (!slot) return;

      // Label-image (idempotent — opprett kun én gang per slot).
      if (!slot.labelEl) {
        const img = document.createElement("img");
        img.className = `g2-jackpot-label g2-jackpot-label-${idx}`;
        img.alt = SLOT_IS_JACKPOT[idx] ? "Jackpot" : "Gain";
        img.src = SLOT_IS_JACKPOT[idx] ? LABEL_JACKPOT_URL : LABEL_GAIN_URL;
        Object.assign(img.style, LABEL_IMG_BASE_STYLES);
        overlayRoot.appendChild(img);
        slot.labelEl = img;
      }

      // Amount-tekst (idempotent).
      if (!slot.amountEl) {
        const div = document.createElement("div");
        div.className = `g2-jackpot-amount g2-jackpot-amount-${idx}`;
        Object.assign(div.style, AMOUNT_BASE_STYLES);
        overlayRoot.appendChild(div);
        slot.amountEl = div;
      }
    });

    // Window-resize-handler: viewport-endring kan flytte canvas-rect.
    if (!this.windowResizeHandler) {
      this.windowResizeHandler = () => {
        if (this.destroyed) return;
        this.repositionOverlays();
      };
      window.addEventListener("resize", this.windowResizeHandler);
    }

    // Render verdier + reposisjoner umiddelbart.
    this.renderValues();
    this.repositionOverlays();
  }

  /** Fjern HTML-elementer + cleanup. Idempotent. */
  detachLabels(): void {
    SLOT_KEYS.forEach((key) => {
      const slot = this.slots.get(key);
      if (!slot) return;
      if (slot.labelEl) {
        slot.labelEl.remove();
        slot.labelEl = null;
      }
      if (slot.amountEl) {
        slot.amountEl.remove();
        slot.amountEl = null;
      }
    });
    if (this.windowResizeHandler) {
      window.removeEventListener("resize", this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
    this.labelCanvas = null;
    this.labelOverlay = null;
  }

  /**
   * Override Container.destroy så HTML-elementer ryddes før Pixi-destroy.
   * Pixi-Container.destroy fjerner ikke HTML-DOM-elementer.
   */
  destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.detachLabels();
    super.destroy(options);
  }

  // ── Interne tegne-rutiner ────────────────────────────────────────────────

  /**
   * Last alle 6 ball-sprites parallelt. Hver sprite mountes så snart
   * dens texture er klar. applyLayout kalles per mount så posisjoner
   * progressivt oppdateres etter hvert.
   */
  private loadAllSprites(): void {
    SLOT_KEYS.forEach((key, idx) => {
      const url = JACKPOT_PNG_URLS[idx];
      const cached = Assets.cache.get(url) as Texture | undefined;
      if (cached) {
        this.attachSprite(key, cached);
        return;
      }
      void Assets.load(url)
        .then((tex: Texture) => {
          if (this.destroyed) return;
          this.attachSprite(key, tex);
        })
        .catch(() => {
          // Stille fallback — testene kjører uten WebGL-renderer.
        });
    });
  }

  /**
   * Mount én sprite for en gitt slot. Triggrer applyLayout når alle 6
   * sprites er klare — først da kan vi distribuere dem jevnt.
   */
  private attachSprite(key: string, texture: Texture): void {
    enableMipmaps(texture);
    const sprite = new Sprite(texture);
    const slot = this.slots.get(key);
    if (!slot) return;
    slot.sprite = sprite;
    this.addChild(sprite);
    this.spritesLoadedCount++;
    // Re-layout etter hver sprite-mount så de allerede-lastet får riktig
    // posisjon umiddelbart, mens senere-laster bare faller i sin slot.
    this.applyLayout();
  }

  /**
   * Plasser alle 6 sprites + overlays. Kalles når:
   *   - Bredde endres (setBarWidth)
   *   - Ny sprite mountes (attachSprite)
   *   - Window resizes (via repositionOverlays)
   */
  private applyLayout(): void {
    // Distribuer 6 slots jevnt over rowWidth. Slot-bredde er rowWidth/6,
    // ball-bredde er litt mindre så det blir luft mellom slots.
    const slotWidth = this.rowWidth / 6;
    const ballWidth = Math.min(BALL_WIDTH_DEFAULT, slotWidth * 0.85);
    const ballHeight = ballWidth / SLOT_PNG_ASPECT;

    // Vertikal layout per slot (top to bottom):
    //   label (LABEL_HEIGHT) + LABEL_GAP + ball (ballHeight) + AMOUNT_GAP + amount (AMOUNT_HEIGHT)
    const ballY = LABEL_HEIGHT + LABEL_GAP;
    const amountY = ballY + ballHeight + AMOUNT_GAP;

    this.rowHeight = amountY + AMOUNT_HEIGHT;

    SLOT_KEYS.forEach((key, idx) => {
      const slot = this.slots.get(key);
      if (!slot) return;
      const slotCenterX = (idx + 0.5) * slotWidth;
      const ballX = slotCenterX - ballWidth / 2;

      if (slot.sprite) {
        slot.sprite.x = ballX;
        slot.sprite.y = ballY;
        slot.sprite.width = ballWidth;
        slot.sprite.height = ballHeight;
      }
    });

    this.renderActiveGlow();
    this.repositionOverlays();
  }

  /**
   * Re-posisjoner HTML-elementer (label-img + amount-text) til å følge
   * sin sprite. Beregner DOM-koordinater fra Pixi global-pos +
   * canvas-rect.
   */
  private repositionOverlays(): void {
    if (!this.labelCanvas) return;
    if (this.destroyed) return;

    const slotWidth = this.rowWidth / 6;
    const ballWidth = Math.min(BALL_WIDTH_DEFAULT, slotWidth * 0.85);
    const ballHeight = ballWidth / SLOT_PNG_ASPECT;

    const rect = this.labelCanvas.getBoundingClientRect();
    const pageOffsetX = rect.left + window.scrollX;
    const pageOffsetY = rect.top + window.scrollY;

    const globalPos = this.getGlobalPosition();

    // Label-image-bredde skaleres etter slot-bredde (max 80px for ikke å
    // overlappe nabo-slots ved svært små rader).
    const labelImgMaxW = Math.min(80, slotWidth * 0.85);

    SLOT_KEYS.forEach((key, idx) => {
      const slot = this.slots.get(key);
      if (!slot) return;
      const slotCenterX = (idx + 0.5) * slotWidth;
      const ballY = LABEL_HEIGHT + LABEL_GAP;
      const amountY = ballY + ballHeight + AMOUNT_GAP;

      const domX = pageOffsetX + globalPos.x + slotCenterX;
      const labelDomY = pageOffsetY + globalPos.y; // label sitter på top
      const amountDomY = pageOffsetY + globalPos.y + amountY;

      if (slot.labelEl) {
        slot.labelEl.style.left = `${domX}px`;
        slot.labelEl.style.top = `${labelDomY}px`;
        slot.labelEl.style.maxWidth = `${labelImgMaxW}px`;
      }
      if (slot.amountEl) {
        slot.amountEl.style.left = `${domX}px`;
        slot.amountEl.style.top = `${amountDomY}px`;
      }
    });
  }

  /** Tegn glow-ring rundt aktiv ball (eller skjul hvis ingen aktiv). */
  private renderActiveGlow(): void {
    this.activeGlow.clear();
    if (!this.activeSlotKey) return;
    const idx = SLOT_KEYS.indexOf(this.activeSlotKey as (typeof SLOT_KEYS)[number]);
    if (idx < 0) return;
    const slot = this.slots.get(this.activeSlotKey);
    if (!slot?.sprite) return;
    const sprite = slot.sprite;
    const cx = sprite.x + sprite.width / 2;
    const cy = sprite.y + sprite.height / 2;
    // Avrundet rektangel som matcher ball-aspect (jackpot-PNG-er er
    // 278×240 — litt høyere enn brede, ikke perfekt sirkel).
    const radiusX = sprite.width / 2 + 4;
    const radiusY = sprite.height / 2 + 4;
    this.activeGlow
      .ellipse(cx, cy, radiusX, radiusY)
      .stroke({ color: ACTIVE_GLOW_COLOR, alpha: ACTIVE_GLOW_ALPHA, width: 3 });
    this.activeGlow
      .ellipse(cx, cy, radiusX + 5, radiusY + 5)
      .stroke({ color: ACTIVE_GLOW_COLOR, alpha: 0.35, width: 4 });
  }

  /** Skriv premie-beløp inn i amount-overlay-divene. */
  private renderValues(): void {
    for (const key of SLOT_KEYS) {
      const slot = this.slots.get(key);
      if (!slot?.amountEl) continue;
      const data = this.latestData.get(key);
      slot.amountEl.textContent = formatPrize(data?.prize ?? 0, data?.type);
    }
  }
}

/**
 * Format premie for visning. Fast cash → "5000 kr". Prosent (rolle uklart
 * fra entry alone — sjekker type via JackpotSlotData.type) → samme som cash
 * format hvis backend leverer som kr-tall. Default 0 → "0 kr".
 *
 * NB: backend's resolveJackpotPrize konverterer prosent → kr ved utbetaling,
 * så `prize`-feltet i JackpotSlotData er ALLTID kr-tall (uansett om kilde-
 * konfigurasjonen var isCash:true eller isCash:false). Vi viser derfor
 * alltid "X kr".
 */
function formatPrize(prize: number, _type?: "gain" | "jackpot"): string {
  if (!Number.isFinite(prize) || prize <= 0) return "0 kr";
  if (Number.isInteger(prize)) return `${prize} kr`;
  return `${prize.toFixed(0)} kr`;
}

/**
 * Mipmaps-aktivering for skalerte sprites — uten dette får
 * skalering-ned aliasing-artifakter.
 */
function enableMipmaps(texture: Texture): void {
  const src = texture.source as unknown as {
    autoGenerateMipmaps?: boolean;
    scaleMode?: string;
    updateMipmaps?: () => void;
  };
  if (src && !src.autoGenerateMipmaps) {
    src.autoGenerateMipmaps = true;
    src.scaleMode = "linear";
    src.updateMipmaps?.();
  }
}
