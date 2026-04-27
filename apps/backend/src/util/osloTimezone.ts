/**
 * Shared Europe/Oslo timezone helpers.
 *
 * Bakgrunn (LOW-2 fra Casino-review 2026-04-26):
 *   Spillorama opererer i Norge. Daglige akkumuleringer, daily-reports og
 *   reconciliation-cron må nullstille på Norge-midnatt — ikke UTC-midnatt.
 *
 *   I UTC slår dagskifte over kl 01:00 (vinter) eller 02:00 (sommer) norsk
 *   tid. Hvis en runde går over Norge-midnatt mellom 00:00 og 01/02 UTC,
 *   havner den i "feil" UTC-dag og jackpott-akkumulering får +4 000 kr
 *   tildelt feil dato — slik at en tirsdag-kveld-runde kan akkumulere som
 *   onsdag.
 *
 *   Med `Europe/Oslo`-nøkkel blir dato-skifte alltid kl 00:00 norsk tid,
 *   uavhengig av sommer-/vintertid (Intl.DateTimeFormat håndterer DST
 *   automatisk).
 *
 * Bruksregel:
 *   - All daglig akkumulering / cron-tick-er som er **forretningsmessig
 *     daglige** SKAL bruke `todayOsloKey()` for å bestemme "dagens dato".
 *   - For ren teknisk audit-tid (ISO-8601 timestamps) bruk vanlig
 *     `new Date().toISOString()` — UTC der.
 *   - For DB DATE-kolonner som lagrer "business-date" (f.eks.
 *     last_accumulation_date, last_daily_boost_date, business_date på
 *     settlement) er det Norge-dato vi vil lagre.
 *
 * Implementasjon:
 *   Bruker `Intl.DateTimeFormat` med `timeZone: "Europe/Oslo"`. Dette er
 *   standard Node 22+ API og krever ikke ekstra dependencies. ICU kommer
 *   med tidssoner inkludert i Node-distroen.
 */

/**
 * Returnér dagens dato i `Europe/Oslo`-tidssonen som "YYYY-MM-DD".
 *
 * Eksempler (vinter, UTC+1):
 *   2026-01-15T22:30:00Z (= 23:30 Oslo-tid 15. jan) → "2026-01-15"
 *   2026-01-15T23:30:00Z (= 00:30 Oslo-tid 16. jan) → "2026-01-16"
 *
 * Eksempler (sommer, UTC+2):
 *   2026-07-15T21:30:00Z (= 23:30 Oslo-tid 15. juli) → "2026-07-15"
 *   2026-07-15T22:30:00Z (= 00:30 Oslo-tid 16. juli) → "2026-07-16"
 */
export function todayOsloKey(now: Date = new Date()): string {
  return formatOsloDateKey(now);
}

/**
 * Format en gitt Date som "YYYY-MM-DD" i Oslo-tidssonen.
 * Eksposert separat for testbarhet (f.eks. fastsette nowMs eksplisitt).
 */
export function formatOsloDateKey(date: Date): string {
  // sv-SE locale gir "YYYY-MM-DD" som default short date format. Eneste
  // locale i ICU som gjør det uten manuell parts-bygging.
  // (Alternativ: bygge med formatToParts — gjør det her for deterministisk
  // sikker parsing uavhengig av framtidige locale-endringer.)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  let year = "";
  let month = "";
  let day = "";
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  if (!year || !month || !day) {
    // Skal aldri skje med en valid Date — defensivt fallback til UTC.
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Returnér timer + minutter i Oslo-tidssonen for en gitt Date.
 * Brukes av cron-jobber som har "kjør kl X:Y norsk tid"-logikk.
 *
 * Eksempel (sommer, UTC+2):
 *   2026-07-15T22:14:00Z → { hour: 0, minute: 14 } (Oslo: 00:14 16. juli)
 */
export function nowOsloHourMinute(date: Date = new Date()): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  let hour = NaN;
  let minute = NaN;
  for (const part of parts) {
    if (part.type === "hour") hour = Number(part.value);
    else if (part.type === "minute") minute = Number(part.value);
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return { hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
  return { hour, minute };
}

/**
 * Beregn "i går"-dato i Oslo-tidssonen som "YYYY-MM-DD".
 *
 * Brukes av daily-report-cron som genererer rapport for forrige
 * forretningsdag (kjøres kl 00:15 norsk tid og oppsummerer dagen før).
 *
 * Implementasjon:
 *   1) Format `now` som Oslo "YYYY-MM-DD".
 *   2) Parser Y/M/D som tall.
 *   3) Bruk `Date.UTC(...)` med dag-1 → trygg dato-aritmetikk over
 *      måneds- og årsskifter.
 *   4) Format resultatet tilbake til "YYYY-MM-DD" (rent tekstlig — vi
 *      bryr oss bare om kalender-dato, ikke time-of-day).
 *
 * Dette er DST-sikkert: vi gjør aritmetikken på UTC-millis av dag 00:00
 * (som ikke endres av DST), og henter ut Y/M/D direkte uten å gå om
 * timezone-formattering igjen for den endelige verdien.
 */
export function yesterdayOsloKey(now: Date = new Date()): string {
  const today = formatOsloDateKey(now);
  const [yearText, monthText, dayText] = today.split("-");
  const y = Number(yearText);
  const m = Number(monthText);
  const d = Number(dayText);
  // Date.UTC for "yesterday 00:00 UTC". Eksisterer alltid (regnes over
  // måned/år-skifter automatisk).
  const yesterdayMs = Date.UTC(y, m - 1, d - 1);
  const yd = new Date(yesterdayMs);
  const yy = yd.getUTCFullYear();
  const ym = String(yd.getUTCMonth() + 1).padStart(2, "0");
  const yday = String(yd.getUTCDate()).padStart(2, "0");
  return `${yy}-${ym}-${yday}`;
}
