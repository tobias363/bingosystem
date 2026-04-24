/**
 * Klient-adapter for Spill 1 fase-regler. Kanonisk kilde ligger i
 * `@spillorama/shared-types/spill1-patterns` og deles med backend
 * `BingoEngine.meetsPhaseRequirement` — ingen drift-risiko mellom
 * server- og klient-klassifisering.
 *
 * Denne filen beholder tidligere klient-API (eksport-navn) som thin
 * wrapper over shared-types. Ny kode kan importere direkte fra
 * shared-types.
 */

import type { PatternDefinition, PatternResult } from "@spillorama/shared-types/game";
import { PATTERN_MASK_FULL, PATTERN_MASK_CENTER_BIT } from "@spillorama/shared-types/game";
import {
  ROW_MASKS,
  COLUMN_MASKS,
  PHASE_1_MASKS,
  PHASE_2_MASKS,
  PHASE_3_MASKS,
  PHASE_4_MASKS,
  PHASE_MASKS,
  classifyPhaseFromPatternName,
  buildTicketMaskFromGrid5x5,
  remainingBitsForPhase,
} from "@spillorama/shared-types/spill1-patterns";

export { ROW_MASKS, COLUMN_MASKS, PHASE_1_MASKS, PHASE_2_MASKS, PHASE_3_MASKS, PHASE_4_MASKS };

/** 25-bit heldekke-maske (alle celler). Re-eksport for klient-kompat. */
export const FULL_HOUSE_MASK = PATTERN_MASK_FULL;

/** Bit-indeks for free center (rad 2, kol 2). Re-eksport for klient-kompat. */
export const FREE_CENTER_BIT = PATTERN_MASK_CENTER_BIT;

/**
 * Velg maske-sett basert på pattern-navn. Delegeres til
 * `classifyPhaseFromPatternName` i shared-types — samme klassifisering
 * som backend-matchen i `BingoEngine.meetsPhaseRequirement`.
 * Returnerer `null` for ukjent navn.
 */
export function getBuiltInPatternMasks(name: string): readonly number[] | null {
  const phase = classifyPhaseFromPatternName(name);
  return phase === null ? null : PHASE_MASKS[phase];
}

/**
 * Bygg en 25-bit ticket-state-maske fra klientens grid-representasjon.
 * Delegeres til delt `buildTicketMaskFromGrid5x5` i shared-types.
 * Returnerer 0 for ikke-5×5 grids (tidligere klient-oppførsel).
 */
export function buildTicketMaskFromGrid(
  grid: ReadonlyArray<ReadonlyArray<number>>,
  marks: ReadonlySet<number>,
): number {
  return buildTicketMaskFromGrid5x5(grid, marks) ?? 0;
}

/**
 * Hvor mange celler mangler for å fullføre pattern `patternName`?
 * Returnerer minimum over alle kandidat-masker for fasen.
 * Returnerer `null` for ukjent pattern-navn.
 */
export function remainingForPattern(
  grid: ReadonlyArray<ReadonlyArray<number>>,
  marks: ReadonlySet<number>,
  patternName: string,
): number | null {
  const phase = classifyPhaseFromPatternName(patternName);
  if (phase === null) return null;
  const ticketMask = buildTicketMaskFromGrid(grid, marks);
  return remainingBitsForPhase(phase, ticketMask);
}

/**
 * Finn bit-indeksene for cellene som er "one-to-go" — celler som, hvis
 * de ble merket, ville fullføre en kandidat-maske for pattern-fasen.
 *
 * Brukes til å highlight'e nærmeste vinn-celle per bong med pulse-effekt
 * (Bong.jsx `bong-pulse`). Kan returnere flere celler hvis flere kandidat-
 * masker har nøyaktig 1 manglende bit (f.eks. fase 1 hvor flere rader
 * samtidig har 4/5 markert).
 *
 * Returnerer:
 *   - tom liste = ingen celler er one-to-go (enten for få marks eller
 *     allerede vunnet)
 *   - null = ukjent pattern-navn
 */
export function oneToGoCellsForPattern(
  grid: ReadonlyArray<ReadonlyArray<number>>,
  marks: ReadonlySet<number>,
  patternName: string,
): number[] | null {
  const phase = classifyPhaseFromPatternName(patternName);
  if (phase === null) return null;
  const ticketMask = buildTicketMaskFromGrid(grid, marks);
  if (ticketMask === 0) return [];
  const candidates = PHASE_MASKS[phase];
  const hits = new Set<number>();
  for (const mask of candidates) {
    const missing = mask & ~ticketMask;
    if (missing === 0) continue;
    // Popcount = 1 → nøyaktig én bit mangler, det er en one-to-go-celle.
    if ((missing & (missing - 1)) === 0) {
      hits.add(Math.log2(missing));
    }
  }
  return Array.from(hits).sort((a, b) => a - b);
}

/**
 * Finn første fase som ikke er vunnet (sortert etter `order`). Returnerer
 * null når alle faser er vunnet eller lista er tom.
 */
export function activePatternFromState(
  patterns: readonly PatternDefinition[] | undefined,
  patternResults: readonly PatternResult[] | undefined,
): PatternDefinition | null {
  if (!patterns || patterns.length === 0) return null;
  const results = patternResults ?? [];
  const wonIds = new Set(results.filter((r) => r.isWon).map((r) => r.patternId));
  const sorted = [...patterns].sort((a, b) => a.order - b.order);
  for (const p of sorted) {
    if (!wonIds.has(p.id)) return p;
  }
  return null;
}
