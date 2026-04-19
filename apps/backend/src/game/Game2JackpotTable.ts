/**
 * BIN-615 / PR-C2: Game 2 (Rocket/Tallspill) jackpot-number-table.
 *
 * Pure compute helpers — no I/O, no side effects. Consumed by Game2Engine
 * for payout calculation and by gameEvents for the per-draw
 * `g2:jackpot:list-update` broadcast.
 *
 * Legacy references:
 *   - Game/Common/Controllers/GameController.js:28-35 (createGame2JackpotDefinition)
 *     Defines the raw shape `[{9: {price, isCash}, ..., 1421: {...}}]`.
 *   - gamehelper/game2.js:1466-1506 (normalizeGame2JackpotData + processJackpotNumbers)
 *     Normalises array-wrap vs flat-object shapes, scalar-vs-object values.
 *   - gamehelper/game2.js:1508-1625 (checkJackPot) — payout + multi-winner split.
 *
 * Key semantics:
 *   - "9".."13" → match the exact total draws at which the round ended.
 *   - "1421"    → special bucket matching any draw count in [14..21] (legacy
 *     special-case, see game2.js:1538-1540).
 *   - isCash === true  → price is a flat kr amount.
 *   - isCash === false → price is a percentage of (ticketCount × ticketPrice).
 *   - Multi-winner split: prize / winnerCount, rounded with Math.round
 *     (game2.js:1550-1556).
 */

export interface RawJackpotEntry {
  price: number;
  isCash: boolean;
}

export type RawJackpotTable = Record<string, RawJackpotEntry>;

/**
 * Shape emitted to clients via `g2:jackpot:list-update` — mirrors legacy
 * processJackpotNumbers output (game2.js:1489-1506):
 *   { number: "9" | "10" | ... | "14-21", prize, type: "gain" | "jackpot" }
 *
 * "number" is stringly-typed to preserve legacy "14-21" display form.
 * "type" mirrors legacy: "13" and "1421" → "gain", else "jackpot".
 */
export interface JackpotListEntry {
  number: string;
  prize: number;
  type: "gain" | "jackpot";
}

/**
 * Raw bucket key that represents "any draw count in 14..21".
 * Legacy key form is literal "1421". Display form (sent to clients) is "14-21".
 */
export const JACKPOT_BUCKET_14_21 = "1421";
const GAIN_BUCKETS = new Set(["13", JACKPOT_BUCKET_14_21]);

/**
 * Normalize legacy-shaped jackpot data into a flat table keyed by draw-count.
 *
 * Legacy input may be:
 *   - An array wrap: `[{9: {price, isCash}, ...}]` (createGame2JackpotDefinition)
 *   - A flat object: `{9: {price, isCash}, ...}`
 *   - Scalar values:  `{9: 25000, ...}`    → treated as `{price: 25000, isCash: true}`
 *
 * Invalid inputs return an empty table — never throws (matches legacy
 * game2.js:1466-1487 resilient parsing).
 */
export function normalizeJackpotTable(raw: unknown): RawJackpotTable {
  if (raw == null) return {};
  const source: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (!source || typeof source !== "object") return {};

  const out: RawJackpotTable = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      const price = Number.parseFloat(String(v.price ?? 0));
      const isCash = v.isCash !== false;
      if (Number.isFinite(price)) out[key] = { price, isCash };
    } else {
      const price = Number.parseFloat(String(value ?? 0));
      if (Number.isFinite(price)) out[key] = { price, isCash: true };
    }
  }
  return out;
}

/**
 * Compute the display list used by `g2:jackpot:list-update`.
 *
 * Legacy ref: gamehelper/game2.js:1489-1506 (processJackpotNumbers).
 * Each entry's prize is computed once at broadcast time:
 *   - isCash: true  → prize = price (kr)
 *   - isCash: false → prize = (price * ticketCount * ticketPrice) / 100
 *
 * @param table         Normalized or raw jackpot table — auto-normalized if needed.
 * @param ticketCount   Total purchased tickets this round (for percent-based prizes).
 * @param ticketPrice   Ticket price in kr.
 */
export function computeJackpotList(
  table: RawJackpotTable | unknown,
  ticketCount: number,
  ticketPrice: number,
): JackpotListEntry[] {
  const normalized = isRawJackpotTable(table) ? table : normalizeJackpotTable(table);
  const entries: JackpotListEntry[] = [];
  for (const [key, entry] of Object.entries(normalized)) {
    const rawPrize = entry.isCash
      ? entry.price
      : (entry.price * Math.max(0, ticketCount) * Math.max(0, ticketPrice)) / 100;
    const prize = Math.round(rawPrize);
    entries.push({
      number: key === JACKPOT_BUCKET_14_21 ? "14-21" : key,
      prize,
      type: GAIN_BUCKETS.has(key) ? "gain" : "jackpot",
    });
  }
  return entries;
}

/**
 * Resolve the prize amount for a specific total-draw-count.
 *
 * Legacy ref: gamehelper/game2.js:1533-1556 (checkJackPot inner loop).
 *
 * Matching rules:
 *   - drawCount 9..13 → matches key "9".."13" exactly.
 *   - drawCount 14..21 → matches the "1421" bucket.
 *   - drawCount outside 9..21 → no match (returns null).
 *
 * If matched, the returned prize is `price / winnerCount`, rounded with
 * Math.round (legacy uses Math.round at game2.js:1556). Caller is responsible
 * for enforcing `maxPayoutBudget` via PrizePolicyManager.
 *
 * Returns null when no entry matches or winnerCount < 1.
 */
export function resolveJackpotPrize(
  table: RawJackpotTable | unknown,
  drawCount: number,
  winnerCount: number,
  ticketCount: number,
  ticketPrice: number,
): { key: string; pricePerWinner: number; totalPrice: number; isCash: boolean } | null {
  if (!Number.isFinite(drawCount) || drawCount < 9 || drawCount > 21) return null;
  if (!Number.isFinite(winnerCount) || winnerCount < 1) return null;

  const normalized = isRawJackpotTable(table) ? table : normalizeJackpotTable(table);
  const key = drawCount >= 14 ? JACKPOT_BUCKET_14_21 : String(drawCount);
  const entry = normalized[key];
  if (!entry) return null;

  const totalPrice = entry.isCash
    ? entry.price
    : (entry.price * Math.max(0, ticketCount) * Math.max(0, ticketPrice)) / 100;
  const pricePerWinner = Math.round(totalPrice / winnerCount);

  return { key, pricePerWinner, totalPrice: Math.round(totalPrice), isCash: entry.isCash };
}

function isRawJackpotTable(value: unknown): value is RawJackpotTable {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (!v || typeof v !== "object") return false;
    const entry = v as Record<string, unknown>;
    if (typeof entry.price !== "number" || typeof entry.isCash !== "boolean") return false;
  }
  return true;
}
