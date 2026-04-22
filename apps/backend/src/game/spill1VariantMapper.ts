/**
 * Spill 1 admin-UI-config → GameVariantConfig mapper.
 *
 * Oversetter `GameManagement.config.spill1` (produsert av admin-web
 * `Spill1Config.ts`) til den struktur BingoEngine forventer. Kjernen i
 * variantConfig-admin-koblingen:
 *
 *   admin-UI → GameManagement.config_json.spill1 → [denne mapperen] → GameVariantConfig
 *   → bindVariantConfigForRoom → BingoEngine.evaluateActivePhase
 *
 * PM-vedtak 2026-04-21 (Option X):
 *   - Hver farge har egen premie-matrise (`patternsByColor[color]`).
 *   - Multi-winner-split skjer innen én farges vinnere.
 *   - `__default__`-nøkkel er safety-net for legacy-games og konfig-feil;
 *     matcher DEFAULT_NORSK_BINGO_CONFIG.patterns (100/200/200/200/1000 kr).
 *
 * Bakoverkompat:
 *   - Manglende `prizePerPattern`-entries → fase-default brukes.
 *   - Plain number (legacy, pre-PR-A) tolkes som `{mode: "percent", amount: n}`.
 *   - `config.spill1` undefined → hele fallback returneres.
 *
 * Design-dok: docs/architecture/spill1-variantconfig-admin-coupling.md
 */

import type { GameVariantConfig, PatternConfig, TicketTypeConfig } from "./variantConfig.js";
import {
  DEFAULT_NORSK_BINGO_CONFIG,
  DEFAULT_QUICKBINGO_CONFIG,
  PATTERNS_BY_COLOR_DEFAULT_KEY,
} from "./variantConfig.js";

// ── Public input-type (defensive shape) ─────────────────────────────────────

/**
 * Shape-speil av admin-web `Spill1Config.ts`. Alle felt er optional fordi
 * denne JSON-en kommer fra DB og kan være delvis utfylt eller følge
 * legacy-format. Feltene vi ikke trenger her (timing, elvis, etc.) er
 * utelatt — de konsumeres av andre systemer.
 */
export interface Spill1ConfigInput {
  /**
   * BIN-689: Sub-variant-valg fra admin-UI. "norsk-bingo" (default/undefined)
   * = standard 5-fase; "kvikkis" = hurtig-bingo med kun Fullt Hus-fase.
   * Tolket av mapperen for å velge riktig default-patterns-liste.
   */
  subVariant?: "norsk-bingo" | "kvikkis";
  ticketColors?: ReadonlyArray<Spill1TicketColorInput>;
  jackpot?: {
    prizeByColor?: Record<string, number>;
    draw?: number;
  };
  luckyNumberPrizeNok?: number;
  elvis?: { replaceTicketPriceNok?: number };
  // Andre felter tillates men ignoreres.
  [key: string]: unknown;
}

interface Spill1TicketColorInput {
  color?: string;
  priceNok?: number;
  /**
   * Per-fase premie. Verdien er enten `PatternPrizeInput` (PR A-format)
   * eller et tall (legacy pre-PR-A, tolkes som percent).
   */
  prizePerPattern?: Record<string, PatternPrizeInput | number | undefined>;
  minimumPrizeNok?: number;
}

interface PatternPrizeInput {
  mode?: "percent" | "fixed";
  amount?: number;
}

// ── Slug → name mappings ────────────────────────────────────────────────────

/**
 * Admin-UI farge-slug → engine-side `TicketTypeConfig.name`.
 *
 * Må holdes i synk med `apps/admin-web/src/pages/games/gameManagement/
 * Spill1Config.ts:SPILL1_TICKET_COLORS`. Testet via symmetri-unit-test i
 * `spill1VariantMapper.test.ts`.
 */
const COLOR_SLUG_TO_NAME: Readonly<Record<string, string>> = {
  small_yellow: "Small Yellow",
  large_yellow: "Large Yellow",
  small_white: "Small White",
  large_white: "Large White",
  small_purple: "Small Purple",
  large_purple: "Large Purple",
  small_red: "Small Red",
  small_green: "Small Green",
  small_orange: "Small Orange",
  elvis1: "Elvis 1",
  elvis2: "Elvis 2",
  elvis3: "Elvis 3",
  elvis4: "Elvis 4",
  elvis5: "Elvis 5",
};

/**
 * Admin-UI pattern-slug → engine-side `PatternConfig.name`.
 *
 * Pattern-navnene må matche `DEFAULT_NORSK_BINGO_CONFIG.patterns[].name`
 * + regex i `classifyPhaseFromPatternName` (shared-types) så engine
 * kjenner igjen fasen.
 */
const PATTERN_SLUG_TO_NAME: Readonly<Record<string, string>> = {
  row_1: "1 Rad",
  row_2: "2 Rader",
  row_3: "3 Rader",
  row_4: "4 Rader",
  full_house: "Fullt Hus",
};

/** Fase-rekkefølge for norsk 5-fase = index i default-patterns-arrayen. */
const PATTERN_ORDER: readonly string[] = ["row_1", "row_2", "row_3", "row_4", "full_house"];

/** BIN-689: Fase-rekkefølge for Kvikkis = kun Fullt Hus. */
const PATTERN_ORDER_KVIKKIS: readonly string[] = ["full_house"];

// ── Helper: slug → TicketTypeConfig ─────────────────────────────────────────

/** Bygg én `TicketTypeConfig` fra admin-UI farge-slug. */
function ticketTypeFromSlug(slug: string): TicketTypeConfig | null {
  const name = COLOR_SLUG_TO_NAME[slug];
  if (!name) return null;

  if (slug.startsWith("large_")) {
    return { name, type: "large", priceMultiplier: 3, ticketCount: 3 };
  }
  if (slug.startsWith("elvis")) {
    return { name, type: "elvis", priceMultiplier: 2, ticketCount: 2 };
  }
  // Default: small_*
  return { name, type: "small", priceMultiplier: 1, ticketCount: 1 };
}

// ── Helper: fase-slug × prize → PatternConfig ───────────────────────────────

/**
 * Bygg en PatternConfig for én fase fra admin-UI prize-entry.
 *
 * @param patternSlug   f.eks. "row_1", "full_house"
 * @param order         0-indeksert fase-rekkefølge (for `design`)
 * @param rawPrize      PR A `{mode,amount}` eller legacy number (percent)
 * @param fallback      default-pattern hvis rawPrize mangler/invalid
 */
function patternConfigForPhase(
  patternSlug: string,
  order: number,
  rawPrize: PatternPrizeInput | number | undefined,
  fallback: PatternConfig,
): PatternConfig {
  const name = PATTERN_SLUG_TO_NAME[patternSlug] ?? fallback.name;
  const claimType = patternSlug === "full_house" ? "BINGO" : "LINE";
  const design = patternSlug === "full_house" ? 0 : order + 1;

  // Legacy number → percent-mode.
  if (typeof rawPrize === "number") {
    if (!Number.isFinite(rawPrize) || rawPrize < 0) {
      return { ...fallback, name, claimType, design };
    }
    return {
      name,
      claimType,
      design,
      prizePercent: rawPrize,
    };
  }

  // PR A-format `{mode, amount}`.
  if (rawPrize && typeof rawPrize === "object") {
    const amount = typeof rawPrize.amount === "number" ? rawPrize.amount : NaN;
    if (!Number.isFinite(amount) || amount < 0) {
      return { ...fallback, name, claimType, design };
    }
    if (rawPrize.mode === "fixed") {
      return {
        name,
        claimType,
        design,
        prizePercent: 0,
        winningType: "fixed",
        prize1: amount,
      };
    }
    // Default mode = percent (explicit or undefined).
    return {
      name,
      claimType,
      design,
      prizePercent: amount,
    };
  }

  // Ingen konfig for denne fasen → fallback med justerte navn/claim/design.
  return { ...fallback, name, claimType, design };
}

/** Build en hel fase-matrise for én farge fra admin-UI `prizePerPattern`. */
function buildPatternsForColor(
  prizePerPattern: Spill1TicketColorInput["prizePerPattern"] | undefined,
  fallbackPatterns: ReadonlyArray<PatternConfig>,
  patternOrder: readonly string[],
): PatternConfig[] {
  return patternOrder.map((slug, i) =>
    patternConfigForPhase(slug, i, prizePerPattern?.[slug], fallbackPatterns[i] ?? fallbackPatterns[fallbackPatterns.length - 1]),
  );
}

// ── Public mapper ───────────────────────────────────────────────────────────

/**
 * Hovedinngang: bygg `GameVariantConfig` fra admin-UI spill1-config.
 *
 * Returnerer alltid en komplett konfig — manglende eller ugyldige
 * input-felt faller tilbake til `fallback` (default: norsk-bingo-
 * defaulten).
 *
 * `patternsByColor` er alltid populated etter denne kall:
 *   - Én oppføring per aktiv farge i `spill1.ticketColors`
 *   - `__default__`-oppføring (kopi av `fallback.patterns`)
 *
 * @param spill1    Admin-UI-config (fra `GameManagement.config_json.spill1`).
 *                  Undefined/null → ren fallback.
 * @param fallback  Base-konfig brukt når felt mangler. Defaultes til
 *                  DEFAULT_NORSK_BINGO_CONFIG (100/200/200/200/1000 kr).
 */
export function buildVariantConfigFromSpill1Config(
  spill1: Spill1ConfigInput | null | undefined,
  fallback?: GameVariantConfig,
): GameVariantConfig {
  // BIN-689: Kvikkis-routing. Hvis `subVariant === "kvikkis"` og ingen
  // eksplisitt fallback er angitt, bruk DEFAULT_QUICKBINGO_CONFIG så
  // patterns-listen blir 1-entry (Fullt Hus) i stedet for 5-fase.
  // Eksplisitt fallback (brukt i tester) respekteres alltid.
  const resolvedFallback: GameVariantConfig =
    fallback ??
    (spill1?.subVariant === "kvikkis" ? DEFAULT_QUICKBINGO_CONFIG : DEFAULT_NORSK_BINGO_CONFIG);
  const fallbackPatterns = resolvedFallback.patterns;
  const patternOrder =
    spill1?.subVariant === "kvikkis" ? PATTERN_ORDER_KVIKKIS : PATTERN_ORDER;

  // Ingen admin-config → ren fallback, men med eksplisitt __default__
  // slik at engine alltid har en path for ukjente farger.
  if (!spill1 || typeof spill1 !== "object") {
    return {
      ...resolvedFallback,
      patternsByColor: { [PATTERNS_BY_COLOR_DEFAULT_KEY]: [...fallbackPatterns] },
    };
  }

  const inputColors = Array.isArray(spill1.ticketColors) ? spill1.ticketColors : [];

  // Bygg ticketTypes + patternsByColor parallelt.
  const ticketTypes: TicketTypeConfig[] = [];
  const patternsByColor: Record<string, PatternConfig[]> = {
    [PATTERNS_BY_COLOR_DEFAULT_KEY]: [...fallbackPatterns],
  };

  for (const tc of inputColors) {
    if (!tc || typeof tc.color !== "string") continue;
    const ticketType = ticketTypeFromSlug(tc.color);
    if (!ticketType) continue; // Ukjent slug → hopp over (defensive).
    // Unngå duplikater hvis admin-UI har sendt samme farge to ganger.
    if (ticketTypes.some((t) => t.name === ticketType.name)) continue;
    ticketTypes.push(ticketType);
    patternsByColor[ticketType.name] = buildPatternsForColor(
      tc.prizePerPattern,
      fallbackPatterns,
      patternOrder,
    );
  }

  // Hvis admin ikke har valgt noen farger → fall tilbake til fallback.ticketTypes.
  const finalTicketTypes = ticketTypes.length > 0 ? ticketTypes : resolvedFallback.ticketTypes;

  // Jackpot-felt: mapper til legacy single-prize-shape på GameVariantConfig.
  // Admin-UI støtter per-farge jackpot (Record<color, kr>). Engine har kun
  // én jackpot-pris. Enkleste løsning for PR B: bruk maks av per-farge —
  // per-farge jackpot-routing er egen scope (ikke i PR B).
  const jackpot = buildJackpotFromInput(spill1.jackpot);

  const luckyNumberPrize =
    typeof spill1.luckyNumberPrizeNok === "number" && spill1.luckyNumberPrizeNok > 0
      ? spill1.luckyNumberPrizeNok
      : resolvedFallback.luckyNumberPrize;

  const replaceAmount =
    typeof spill1.elvis?.replaceTicketPriceNok === "number" && spill1.elvis.replaceTicketPriceNok > 0
      ? spill1.elvis.replaceTicketPriceNok
      : resolvedFallback.replaceAmount;

  return {
    ...resolvedFallback,
    ticketTypes: finalTicketTypes,
    patterns: fallbackPatterns.map((p) => ({ ...p })), // flat fallback beholdes
    patternsByColor,
    ...(jackpot
      ? { jackpot }
      : resolvedFallback.jackpot
        ? { jackpot: resolvedFallback.jackpot }
        : {}),
    ...(typeof luckyNumberPrize === "number" ? { luckyNumberPrize } : {}),
    ...(typeof replaceAmount === "number" ? { replaceAmount } : {}),
  };
}

/**
 * Map admin-UI `jackpot.prizeByColor` til engine `jackpot`-feltet.
 * Tar maks-prisen (alle farger; 0 ignoreres) for å matche dagens
 * single-prize-shape. Per-farge jackpot-dispatch er egen scope.
 */
function buildJackpotFromInput(
  input: Spill1ConfigInput["jackpot"] | undefined,
): GameVariantConfig["jackpot"] | null {
  if (!input || typeof input !== "object") return null;
  const draw = typeof input.draw === "number" && input.draw > 0 ? input.draw : null;
  const pbc = input.prizeByColor;
  if (!pbc || typeof pbc !== "object" || !draw) return null;
  let max = 0;
  for (const v of Object.values(pbc)) {
    if (typeof v === "number" && Number.isFinite(v) && v > max) max = v;
  }
  if (max <= 0) return null;
  return { drawThreshold: draw, prize: max, isDisplay: true };
}

/**
 * Slå opp pattern-matrisen for en gitt ticket-color. Returnerer
 * `__default__`-matrisen hvis fargen ikke finnes i
 * `patternsByColor`. Logger warning når default brukes for en farge som
 * finnes i `ticketTypes[]` — det indikerer konfig-gap mellom admin-UI
 * og mapper-output.
 *
 * Brukes av `BingoEngine.evaluateActivePhase` for per-ticket-oppslag.
 */
export function resolvePatternsForColor(
  variantConfig: GameVariantConfig,
  color: string | undefined,
  onDefaultFallback?: (color: string) => void,
): ReadonlyArray<PatternConfig> {
  const map = variantConfig.patternsByColor;
  if (!map) return variantConfig.patterns;
  if (color && map[color]) return map[color];
  const defaultMatrix = map[PATTERNS_BY_COLOR_DEFAULT_KEY] ?? variantConfig.patterns;
  // Varsle bare hvis fargen eksisterer i ticketTypes (ellers er den
  // ukjent uansett og default er forventet).
  if (color && onDefaultFallback) {
    const configured = variantConfig.ticketTypes.some((t) => t.name === color);
    if (configured) onDefaultFallback(color);
  }
  return defaultMatrix;
}
