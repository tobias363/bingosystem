/**
 * BIN-615 / PR-C1: Config-driven draw-bag resolution.
 *
 * Replaces the hardcoded BINGO75_SLUGS switch in BingoEngine.startGame.
 * Ball range and bag size are now resolved from GameVariantConfig (with
 * a gameSlug-based fallback for legacy configs that pre-date PR-C1).
 *
 * Ranges:
 *   - G1 Standard / Elvis / Traffic-Light: 1..60
 *   - G1 Bingo75 / Game 3 Mønsterbingo: 1..75
 *   - G2 Rocket/Tallspill: 1..21 (implemented in PR-C2 via variantConfig)
 *
 * Legacy refs:
 *   - Helper/bingo.js:996-1012 (Game 2 3x3 ticket, 1..21)
 *   - Game/Game2/Controllers/GameProcess.js:167 (getAvailableBalls(..., 21))
 */

import type { GameVariantConfig } from "./variantConfig.js";
import { makeShuffledBallBag } from "./ticket.js";

export interface ResolvedDrawBagConfig {
  /** Maximum inclusive ball value (bag contains 1..maxBallValue). */
  maxBallValue: number;
  /** Actual number of balls shuffled into the bag. */
  drawBagSize: number;
}

export const DRAW_BAG_DEFAULT_STANDARD = 60;
export const DRAW_BAG_DEFAULT_BINGO75 = 75;

/** Slugs that historically use 1..75 (pre-variantConfig.maxBallValue). */
const SLUG_BINGO75 = new Set(["bingo", "game_1"]);

/**
 * Resolve draw-bag config for a game round.
 *
 * Priority:
 *   1. variantConfig.maxBallValue / drawBagSize (explicit per-schedule config)
 *   2. gameSlug heuristic (backward-compat for configs without maxBallValue)
 *
 * Never throws — invalid inputs fall through to the 60-ball default so legacy
 * G1 rooms without updated variant_config keep working.
 */
export function resolveDrawBagConfig(
  gameSlug: string | undefined,
  variantConfig: GameVariantConfig | undefined,
): ResolvedDrawBagConfig {
  const fromConfig = variantConfig?.maxBallValue;
  const maxBallValue = Number.isInteger(fromConfig) && (fromConfig as number) > 0
    ? (fromConfig as number)
    : SLUG_BINGO75.has(gameSlug ?? "") ? DRAW_BAG_DEFAULT_BINGO75 : DRAW_BAG_DEFAULT_STANDARD;

  const fromConfigSize = variantConfig?.drawBagSize;
  const drawBagSize = Number.isInteger(fromConfigSize) && (fromConfigSize as number) > 0
    ? Math.min(fromConfigSize as number, maxBallValue)
    : maxBallValue;

  return { maxBallValue, drawBagSize };
}

/**
 * Build a shuffled draw bag from a resolved config.
 *
 * If drawBagSize < maxBallValue, the bag contains a random subset of size
 * drawBagSize drawn from 1..maxBallValue (matches legacy G2 semantics where
 * the underlying universe is 1..21 and all 21 enter the bag).
 */
export function buildDrawBag(
  config: ResolvedDrawBagConfig,
  factory: (size: number) => number[] = makeShuffledBallBag,
): number[] {
  const full = factory(config.maxBallValue);
  if (config.drawBagSize >= config.maxBallValue) return full;
  return full.slice(0, config.drawBagSize);
}
