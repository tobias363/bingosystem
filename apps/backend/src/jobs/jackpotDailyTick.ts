/**
 * MASTER_PLAN_SPILL1_PILOT_2026-04-24 §2.3 / Appendix B.9 — Daglig jackpot-
 * akkumulering cron-job.
 *
 * Kjøre-timing:
 *   * Polling-intervall (default 15 min) — jobben selv gater på klokkeslett
 *     og date-key for å sikre at selve påfyllet kjører én gang per dag.
 *   * Default kjøre-tidspunkt: 00:15 norsk tid (LOW-2-fix 2026-04-26 — var
 *     tidligere server-lokal tid, dvs UTC i Docker, som ga 1-2 timers
 *     drift fra ønsket Norge-midnatt).
 *
 * Idempotens:
 *   * Service-laget (Game1JackpotStateService.accumulateDaily) bruker en
 *     WHERE last_accumulation_date < today-guard slik at dobbelt-kjøring
 *     samme dag er no-op.
 *   * `lastRunDateKey` i dette tick-et skipper SQL-kall helt når vi vet
 *     at vi allerede har kjørt.
 *
 * Feature-flag: JOB_JACKPOT_DAILY_ENABLED — default false inntil PM
 * tester i staging.
 */

import type { JobResult } from "./JobScheduler.js";
import type { Game1JackpotStateService } from "../game/Game1JackpotStateService.js";
import { logger as rootLogger } from "../util/logger.js";
import { nowOsloHourMinute, todayOsloKey } from "../util/osloTimezone.js";

const log = rootLogger.child({ module: "job:jackpot-daily-tick" });

export interface JackpotDailyTickDeps {
  service: Game1JackpotStateService;
  /**
   * Default 0 (kjøres straks etter midnatt).
   *
   * LOW-2-fix 2026-04-26: navnet `runAtHourLocal` er beholdt for backwards-
   * compat, men semantikken er nå `Europe/Oslo`-tid (ikke server-lokal).
   * I Docker er server-lokal UTC, så cron-tick-et trigget 1-2 timer for
   * tidlig vs ønsket Norge-midnatt.
   */
  runAtHourLocal?: number;
  /** Default 15 (minutter etter `runAtHourLocal`). Appendix B.9. */
  runAtMinuteLocal?: number;
  /** For tester: ignorer time/date-key-guard. */
  alwaysRun?: boolean;
}

export function createJackpotDailyTickJob(deps: JackpotDailyTickDeps) {
  const runAtHour = deps.runAtHourLocal ?? 0;
  const runAtMinute = deps.runAtMinuteLocal ?? 15;
  let lastRunDateKey = "";

  return async function runJackpotDailyTick(nowMs: number): Promise<JobResult> {
    const now = new Date(nowMs);
    const todayKey = todayOsloKey(now);

    if (!deps.alwaysRun) {
      // Før konfigurert kjøre-tidspunkt (Oslo-tid) → skip.
      const oslo = nowOsloHourMinute(now);
      const currentMinutes = oslo.hour * 60 + oslo.minute;
      const scheduledMinutes = runAtHour * 60 + runAtMinute;
      if (currentMinutes < scheduledMinutes) {
        return {
          itemsProcessed: 0,
          note: `waiting for ${String(runAtHour).padStart(2, "0")}:${String(runAtMinute).padStart(2, "0")} Oslo`,
        };
      }
      if (todayKey === lastRunDateKey) {
        return { itemsProcessed: 0, note: "already ran today" };
      }
    }

    try {
      const result = await deps.service.accumulateDaily();
      lastRunDateKey = todayKey;
      const note =
        `updated=${result.updatedCount}` +
        ` alreadyCurrent=${result.alreadyCurrentCount}` +
        ` capped=${result.cappedCount}` +
        (result.errors ? ` errors=${result.errors}` : "");
      return { itemsProcessed: result.updatedCount, note };
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? "";
      if (code === "42P01") {
        // Tabell mangler (migrasjon ikke kjørt). Soft-no-op — matcher
        // pattern i game1AutoDrawTick og game1ScheduleTick.
        return {
          itemsProcessed: 0,
          note: "app_game1_jackpot_state tabell mangler (migrasjon ikke kjørt?)",
        };
      }
      log.error({ err }, "jackpot-daily-tick failed");
      throw err;
    }
  };
}
