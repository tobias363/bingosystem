# ComplianceLedger

**File:** `apps/backend/src/game/ComplianceLedger.ts` (612 LOC core; total ~1500 LOC across 5 split files)
**Owner-area:** compliance / regulatory
**Last reviewed:** 2026-04-30

## Purpose

Append-only regulatory ledger for §11 pengespillforskriften — owns every STAKE/PRIZE/EXTRA_PRIZE/ORG_DISTRIBUTION/HOUSE_RETAINED entry produced by the platform, plus daily rapport generation, time-series aggregation, top-players reports, and overskudd-fordeling (surplus distribution to organizations).

It exists because the platform is regulated by Lotteritilsynet under pengespillforskriften, which mandates an immutable audit trail of every cash movement, daily reports per hall × game-type × channel, and a documented surplus-distribution flow with §11-percent compliance (15% Hovedspill / 30% Databingo to organizations). The ledger is hydrated on boot from `app_rg_compliance_ledger` and persisted via `ResponsibleGamingPersistenceAdapter`.

The class itself is the public façade — internally it delegates to four split modules (PR-S3, PR #387):
- `ComplianceLedgerTypes` — shared contracts.
- `ComplianceLedgerValidators` — `assertHallId`, `assertIsoTimestampMs`, `dateKeyFromMs`, `makeHouseAccountId`, etc.
- `ComplianceLedgerAggregation` — `generateDailyReport`, `generateRangeReport`, `generateGameStatistics`, `generateRevenueSummary`, `generateTimeSeries`, `generateTopPlayers`, `generateGameSessions`, `exportDailyReportCsv`.
- `ComplianceLedgerOverskudd` — `createOverskuddDistributionBatch`, `previewOverskuddDistribution`.

## Public API

```typescript
export class ComplianceLedger {
  constructor(config: ComplianceLedgerConfig)

  // Hydration (called at boot)
  hydrateFromSnapshot(snapshot: ComplianceLedgerHydrationSnapshot): void

  // Write-path (PILOT-STOP-SHIP idempotency-key support)
  async recordComplianceLedgerEvent(input: {
    hallId; gameType; channel; eventType; amount;
    roomCode?; gameId?; claimId?; playerId?; walletId?;
    sourceAccountId?; targetAccountId?; policyVersion?; batchId?;
    metadata?; eventSubKey?
  }): Promise<void>

  async recordAccountingEvent(input: {
    hallId; gameType; channel;
    eventType: "STAKE" | "PRIZE" | "EXTRA_PRIZE";
    amount; metadata?;
  }): Promise<ComplianceLedgerEntry>

  // Read-path
  listComplianceLedgerEntries(input?): ComplianceLedgerEntry[]

  // Reports
  generateDailyReport(input): DailyComplianceReport
  generateRangeReport(input): RangeComplianceReport
  generateGameStatistics(input): GameStatisticsReport
  generateRevenueSummary(input): RevenueSummary
  generateTimeSeries(input): TimeSeriesReport
  generateTopPlayers(input): TopPlayersReport
  generateGameSessions(input): GameSessionsReport
  async runDailyReportJob(input?): Promise<DailyComplianceReport>
  getArchivedDailyReport(date): DailyComplianceReport | null
  exportDailyReportCsv(input): string

  // Overskudd-fordeling
  async createOverskuddDistributionBatch(input): Promise<OverskuddDistributionBatch>
  getOverskuddDistributionBatch(batchId): OverskuddDistributionBatch
  listOverskuddDistributionBatches(input?): OverskuddDistributionBatch[]
  previewOverskuddDistribution(input): OverskuddDistributionBatch

  // Public helpers (back-compat)
  makeHouseAccountId(hallId, gameType, channel): string
}

// Idempotency-key helpers (PILOT-STOP-SHIP 2026-04-28)
export function makeComplianceLedgerIdempotencyKey(input): string
export function stableEntryDiscriminatorHash(entry): string

// Re-exported types (back-compat)
export type {
  ComplianceLedgerConfig, ComplianceLedgerEntry, ComplianceLedgerHydrationSnapshot,
  DailyComplianceReport, DailyComplianceReportRow, GameSessionRow, GameSessionsReport,
  GameStatisticsReport, GameStatisticsRow, LedgerChannel, LedgerEventType, LedgerGameType,
  OrganizationAllocationInput, OverskuddDistributionBatch, OverskuddDistributionTransfer,
  RangeComplianceReport, RevenueSummary, TimeSeriesGranularity, TimeSeriesPoint,
  TimeSeriesReport, TopPlayerRow, TopPlayersReport,
}
```

## Dependencies

**Calls (downstream):**
- `WalletAdapter.transfer(...)` — used inside `createOverskuddDistributionBatch` for org payouts.
- `ResponsibleGamingPersistenceAdapter.insertComplianceLedgerEntry(entry & { idempotencyKey })` — Postgres write with `ON CONFLICT (idempotency_key) DO NOTHING` (UNIQUE-index added in `migrations/20260428080000_compliance_ledger_idempotency.sql`).
- `ResponsibleGamingPersistenceAdapter.upsertDailyReport` + `insertOverskuddBatch`.
- `currency.roundCurrency` — currency rounding to 2 decimals.
- Validators (`ComplianceLedgerValidators`): `assertHallId`, `assertIsoTimestampMs`, `assertDateKey`, `assertNonNegativeNumber`, `assertLedgerGameType`, `assertLedgerChannel`, `dateKeyFromMs`, `makeHouseAccountIdImpl`.
- Aggregation (`ComplianceLedgerAggregation`): all `generate*Impl` functions.
- Overskudd (`ComplianceLedgerOverskudd`): `createOverskuddBatchImpl`, `previewOverskuddImpl`.

**Called by (upstream):**
- `apps/backend/src/index.ts` — boot wiring + `hydrateFromSnapshot`.
- `apps/backend/src/game/BingoEngine.ts` — every `recordComplianceLedgerEvent` for STAKE/PRIZE/HOUSE_RETAINED + admin endpoints `awardExtraPrize`, `runDailyReportJob`, `createOverskuddDistributionBatch`.
- `apps/backend/src/game/Game1TicketPurchaseService.ts` — STAKE entries on ticket purchase (scheduled Spill 1).
- `apps/backend/src/game/Game1PayoutService.ts` — PRIZE entries on phase payout.
- `apps/backend/src/game/Game3Engine.ts` + `BingoEngineMiniGames.ts` — PRIZE entries for Game 3 + ad-hoc mini-games.
- `apps/backend/src/admin/PlayerGameManagementDetailService.ts` — read-path for player game-management view.
- `apps/backend/src/admin/reports/GameSpecificReport.ts` + `Game1ManagementReport.ts` + `HallSpecificReport.ts` + `RedFlagPlayersReport.ts` + `SubgameDrillDownReport.ts` — admin reports.
- `apps/backend/src/agent/AgentMiniGameWinningService.ts` — agent mini-game winnings audit.
- `apps/backend/src/game/ComplianceLedgerOverskudd.ts` — sibling module (re-imports types).
- `apps/backend/src/game/ComplianceLedgerAggregation.ts` — sibling module.

## Invariants

- Ledger is append-only — there is NO `update` or `delete` operation. Corrections are new entries with negative amounts (still > 0 in the schema; corrections use `metadata.correctionFor` field).
- Every entry is normalized at write: `hallId` validated, `gameType` + `channel` validated against enums, `amount` rounded to 2 decimals + asserted non-negative, currency hardcoded `"NOK"`.
- In-memory ledger is capped at 50 000 entries (FIFO eviction) — ensures bounded memory while Postgres remains source of truth.
- §11 invariants preserved byte-identical across PR-S3 split:
  - Net-tap formula: `STAKE - PRIZE` per (hallId, gameType, channel, date).
  - Single-prize cap: 2500 kr per claim (§11) — enforced at PrizePolicyManager BEFORE write; ledger trusts caller.
  - Distribution thresholds: §11 mandatory 15% Hovedspill / 30% Databingo to organizations; distribution-batch validator rejects below threshold.
  - 50 000 kr cap on max single overskudd-allocation.
- Idempotency-key is deterministic (`makeComplianceLedgerIdempotencyKey`):
  - Format: `${eventType}:${gameId ?? "no-game"}:${claimId ?? playerId ?? "no-actor"}:${eventSubKey ?? fallback-hash}`.
  - `stableEntryDiscriminatorHash(entry)` is a 32-char SHA-256 prefix over discriminating fields (`hallId`, `gameType`, `channel`, `amount`, `roomCode`, `walletId`, `sourceAccountId`, `targetAccountId`, `policyVersion`, `batchId`, `metadata`).
  - Persistence layer uses `ON CONFLICT (idempotency_key) DO NOTHING` — re-call same key never double-writes.
- Daily report archive is in-memory only — Postgres is canonical via `app_rg_compliance_daily_reports`.
- Hydration is read-only at boot — `hydrateFromSnapshot` clears + reloads, must NOT be called mid-run.
- HIGH-6 backwards-compat: hydrated reports default `houseRetained` and `houseRetainedCount` to 0 if missing (older persisted JSON).

## Test coverage

- `apps/backend/src/game/ComplianceLedger.test.ts` — main suite (record events, list, generate reports, overskudd-batch happy-path).
- `apps/backend/src/game/ComplianceLedger.idempotency.test.ts` — PILOT-STOP-SHIP idempotency-key + UNIQUE-conflict semantics (PR #685).
- Indirect coverage from every `BingoEngine.*.test.ts`, `Game1DrawEngineService.*.test.ts`, etc. that runs a full round and asserts ledger entries.

## Operational notes

Common failures + how to diagnose:
- `INVALID_INPUT: hallId mangler` from `recordComplianceLedgerEvent` — caller passed empty hallId. Defense-in-depth.
- `BATCH_NOT_FOUND` from `getOverskuddDistributionBatch` — passing an unknown batchId. Verify against `app_rg_compliance_overskudd_batches`.
- Duplicate idempotency-key conflict (silent `DO NOTHING`) — same logical event re-recorded. Verify caller is correctly passing `eventSubKey` when needed (purchases need `purchaseId`, HOUSE_RETAINED needs `phase`, etc.). Without `eventSubKey`, fallback hash discriminates by content — distinct content = distinct entry.
- `INVALID_AMOUNT` — negative amount or NaN — defense-in-depth, fix caller.
- Daily report missing rows — check `dateKeyFromMs` interpretation (UTC, not local timezone). Compare to `app_rg_compliance_ledger.created_at_ms`.
- Overskudd batch fails — check §11-percent threshold validator: 15% Hovedspill / 30% Databingo minimum. Allocations below threshold throw `INVALID_ALLOCATION`.
- 50 000-entry FIFO eviction — only affects in-memory cache; reports always re-aggregate from Postgres so safe.

## Recent significant changes

- PR #717 (`bea47642`): import `DomainError` from `errors/DomainError.ts`.
- PR #685 (`6738bd44`): UNIQUE idempotency_key on `app_rg_compliance_ledger` (PILOT-STOP-SHIP) — prevents duplicate writes.
- PR #576 (`497dad9a`): write `HOUSE_RETAINED` ledger entry for split-rounding rest (HIGH-6).
- PR #387 (`87048710`): split `ComplianceLedger.ts` per domain (PR-S3) — 1473 LOC → 612 LOC core + 4 sibling modules.
- PR #190 (`08c8e65d`): BIN-587 B3-report v2 + dashboard historical.
- PR #148 (`7afbfd29`): dashboard with live rooms, range reports, game statistics (BIN-517).

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- Ledger Map cap of 50 000 is arbitrary; should be configurable via `ComplianceLedgerConfig.maxInMemoryEntries`. At full hall production volumes (~1000 events/day × 4 halls × 30 days = 120k) the FIFO eviction WILL kick in.
- `recordComplianceLedgerEvent` does both in-memory append AND persistence write — should split into `appendToBuffer` + `persistAsync` so the buffer write is non-blocking. Tracked under casino-grade wallet redesign (BIN-761→764).
- The `eventSubKey` parameter is missing at most caller sites in `BingoEngine` (only `Game1DrawEngineService` uses it consistently). Audit all `recordComplianceLedgerEvent` callers and add explicit subkeys.
- The `__init__.ts` re-export pattern from `ComplianceLedgerTypes` is fragile — would benefit from a barrel module that re-exports + asserts type stability.

