/**
 * PR-T2 Spor 4: PotDailyAccumulationTickService — daglig boost for pot-er.
 *
 * Bakgrunn:
 *   Spor 4-pot-er (Jackpott, Innsatsen) har en daglig auto-påfyll
 *   (`dailyBoostCents`). Boost-en må kjøres en gang pr kalender-dag pr
 *   pot. Game1PotService.accumulateDaily er allerede idempotent per
 *   `(hallId, potKey, dateUtc)` — dette laget er et tynt orkestreringslag
 *   oppå som sikrer at pot-boost faktisk blir kjørt:
 *
 *   LOW-2-fix 2026-04-26: kalender-dag tolkes nå som `Europe/Oslo`-dag
 *   (var tidligere UTC). Variabel/parameter-navn `todayUtc`/`dateUtc` er
 *   beholdt for backwards-compat — semantisk er det nå Oslo-tid. Full
 *   rename krever DB-migrasjon (last_daily_boost_date) og er flagget for
 *   oppfølging.
 *
 *     * `runDailyTick(todayUtc)` — iterer ALLE pot-er og kall accumulateDaily.
 *       Brukes av daglig cron (eller ops-trigget manuelt). Fail-closed
 *       per pot: én pot-feil → logg warning og fortsett med neste.
 *
 *     * `ensureDailyAccumulatedForHall(hallId, todayUtc)` — lazy-eval variant.
 *       Brukes fra draw-engine / admin-flows rett før en pot skal vinnes
 *       eller vises: garanterer at dagens boost er applisert før lesing.
 *       Idempotent (T1 accumulateDaily er det).
 *
 * PM-beslutning 2026-04-22 (PR-T2-brief):
 *   "Velg enklest: sjekk last_accumulated_at i getOrInitPot — hvis > 24 timer
 *    siden, akkumuler automatisk ved neste getOrInitPot-call. Ingen ny cron."
 *
 *   Tjenesten lar begge modellene leve side om side: lazy-kall fra kritiske
 *   flows (MVP), cron-trigget batch når vi vil ha boost uavhengig av
 *   spiller-aktivitet (T2b).
 *
 * Fail-closed-prinsipp:
 *   - runDailyTick svelger feil per pot (logger warning + teller som failed).
 *   - ensureDailyAccumulatedForHall svelger feil per pot (samme regel).
 *     Draw-engine skal ALDRI krasje pga pot-daily-feil.
 */

import type { Pool } from "pg";
import { logger as rootLogger } from "../../util/logger.js";
import { todayOsloKey } from "../../util/osloTimezone.js";
import type { Game1PotService } from "./Game1PotService.js";

const log = rootLogger.child({ module: "pot-daily-accumulation-tick-service" });

// ── Public types ────────────────────────────────────────────────────────────

export interface PotDailyAccumulationTickServiceOptions {
  pool: Pool;
  schema?: string;
  potService: Game1PotService;
}

export interface RunDailyTickOptions {
  /** UTC-dato på formatet "YYYY-MM-DD". Default = dagens dato. */
  todayUtc?: string;
  /** Begrens kjøringen til én hall. Default = alle. */
  hallId?: string;
}

export interface RunDailyTickResult {
  todayUtc: string;
  totalPots: number;
  accumulated: number;
  skipped: number;
  failed: number;
  failures: Array<{
    hallId: string;
    potKey: string;
    errorMessage: string;
  }>;
}

interface PotIdentifierRow {
  hall_id: string;
  pot_key: string;
}

// ── Service ─────────────────────────────────────────────────────────────────

export class PotDailyAccumulationTickService {
  private readonly pool: Pool;
  private readonly schema: string;
  private readonly potService: Game1PotService;

  constructor(options: PotDailyAccumulationTickServiceOptions) {
    if (!options?.pool) throw new Error("pool mangler.");
    if (!options?.potService) throw new Error("potService mangler.");
    this.pool = options.pool;
    const schema = (options.schema ?? "public").trim();
    if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
      throw new Error("Ugyldig schema-navn.");
    }
    this.schema = schema;
    this.potService = options.potService;
  }

  private potsTable(): string {
    return `"${this.schema}"."app_game1_accumulating_pots"`;
  }

  /**
   * Iterer alle aktive pot-er (eller filtrert per hallId) og kall
   * Game1PotService.accumulateDaily for hver. Fail-closed per pot.
   *
   * Returnerer sammendrag egnet for cron-logging og admin-rapportering.
   */
  async runDailyTick(options: RunDailyTickOptions = {}): Promise<RunDailyTickResult> {
    const todayUtc = options.todayUtc ?? todayUtcString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todayUtc)) {
      throw new Error("todayUtc må være på formatet YYYY-MM-DD.");
    }

    const pots = await this.listPotIdentifiers(options.hallId);
    const result: RunDailyTickResult = {
      todayUtc,
      totalPots: pots.length,
      accumulated: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    };

    for (const pot of pots) {
      try {
        const r = await this.potService.accumulateDaily({
          hallId: pot.hall_id,
          potKey: pot.pot_key,
          dateUtc: todayUtc,
        });
        if (r.applied) {
          result.accumulated += 1;
        } else {
          result.skipped += 1;
        }
      } catch (err) {
        result.failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        result.failures.push({
          hallId: pot.hall_id,
          potKey: pot.pot_key,
          errorMessage: msg,
        });
        log.warn(
          { err, hallId: pot.hall_id, potKey: pot.pot_key, todayUtc },
          "[PR-T2] runDailyTick: pot-feil — fortsetter med neste"
        );
      }
    }

    log.info(
      {
        todayUtc,
        totalPots: result.totalPots,
        accumulated: result.accumulated,
        skipped: result.skipped,
        failed: result.failed,
        hallFilter: options.hallId ?? null,
      },
      "[PR-T2] runDailyTick fullført"
    );
    return result;
  }

  /**
   * Lazy-eval for én hall: sikrer at alle pot-er for hallen har dagens
   * boost applisert. Trygt å kalle fra draw-engine rett før jackpot-
   * evaluering slik at pot-saldo er up-to-date.
   *
   * Fail-closed: per-pot-feil loggres men kastes ikke videre.
   */
  async ensureDailyAccumulatedForHall(
    hallId: string,
    todayUtc?: string
  ): Promise<RunDailyTickResult> {
    return this.runDailyTick({ hallId, todayUtc });
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async listPotIdentifiers(hallId?: string): Promise<PotIdentifierRow[]> {
    if (hallId) {
      const { rows } = await this.pool.query<PotIdentifierRow>(
        `SELECT hall_id, pot_key FROM ${this.potsTable()} WHERE hall_id = $1`,
        [hallId]
      );
      return rows;
    }
    const { rows } = await this.pool.query<PotIdentifierRow>(
      `SELECT hall_id, pot_key FROM ${this.potsTable()}`
    );
    return rows;
  }
}

// ── Pure helpers (eksportert for test) ──────────────────────────────────────

/**
 * Returnerer dagens dato på formatet "YYYY-MM-DD" i `Europe/Oslo`-tidssonen.
 *
 * LOW-2-fix 2026-04-26: tidligere `todayUtcString` brukte UTC, men
 * Spillorama opererer i Norge. UTC-midnatt er kl 01:00 (vinter) /
 * 02:00 (sommer) norsk tid, så en runde over Norge-midnatt akkumulerte
 * Innsatsen-pot på "feil" dag. Variabel- og parameter-navn beholder
 * `Utc`-suffiks for backwards-compat med kallsteder; semantikken er
 * Oslo-tid.
 *
 * @deprecated Bruk `todayUtcString` fortsatt, men semantikken er nå Oslo.
 *             Felt-/parameter-rename til `osloDate` kan gjøres i en
 *             oppfølgings-PR (cross-cutting; krever DB-kolonne-rename).
 */
export function todayUtcString(now: Date = new Date()): string {
  return todayOsloKey(now);
}
