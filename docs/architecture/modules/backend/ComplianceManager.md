# ComplianceManager

**File:** `apps/backend/src/game/ComplianceManager.ts` (1186 LOC)
**Owner-area:** compliance
**Last reviewed:** 2026-04-30

## Purpose

Single in-process source of truth for player-side responsible-gaming state per pengespillforskriften: net-loss tracking with per-hall scope, voluntary timed pause, mandatory 60-min pause (§ 66), 1-year self-exclusion (§ 22), regulatory-vs-personal loss-limits, and gameplay-block resolution.

The manager keeps an in-memory cache (`Map<scopeKey, ...>`) of loss entries, restrictions, play sessions, and pending limit changes. Mutations are **persist-first** (refactor stage 2A, PR #718): the DB write must succeed before the in-memory cache is mutated, so a DB failure can never leave the cache in a state that disagrees with the §71 hovedbok. Reads serve straight from the cache for performance.

## Public API

```ts
// Hydration (boot)
hydrateFromSnapshot(snapshot: ComplianceHydrationSnapshot): void

// Read
getPlayerCompliance(walletId, hallId?): PlayerComplianceSnapshot
calculateNetLoss(walletId, nowMs, hallId?): LossLimits           // daily + monthly net loss
wouldExceedLossLimit(walletId, entryFee, nowMs, hallId): boolean // pre-flight check
calculateMaxAffordableTickets(...): { count, limited }           // bet:arm partial-buy support (PR #725)
assertWalletAllowedForGameplay(walletId, nowMs?): void           // throws PLAYER_TIMED_PAUSE / PLAYER_REQUIRED_PAUSE / PLAYER_SELF_EXCLUDED
makeLossScopeKey(walletId, hallId): string                       // canonical scope key

// Loss limits — sets / pending changes
setPlayerLossLimits({ walletId, hallId, daily?, monthly? }): Promise<PlayerComplianceSnapshot>
setPlayerLossLimitsWithEffectiveAt({ walletId, hallId, daily?, monthly?, dailyDecrease?, monthlyDecrease? }): Promise<PlayerComplianceSnapshot>
promotePendingLossLimitIfDue(walletId, hallId, nowMs): Promise<boolean>

// Restrictions
setTimedPause({ walletId, durationMs?, durationMinutes? }): Promise<PlayerComplianceSnapshot>
clearTimedPause(walletId): Promise<PlayerComplianceSnapshot>      // throws TIMED_PAUSE_LOCKED if still active
setSelfExclusion(walletId): Promise<PlayerComplianceSnapshot>     // 1-year minimum (§ 22)
clearSelfExclusion(walletId): Promise<PlayerComplianceSnapshot>   // throws SELF_EXCLUSION_LOCKED before minimum

// Loss ledger writes (called from BingoEngine / payout / refund)
recordLossEntry(walletId, hallId, entry: LossLedgerEntry): Promise<void>

// Mandatory-pause § 66 mechanics
incrementSessionGameCount(walletId): Promise<void>
startPlaySession(walletId, nowMs): Promise<void>
finishPlaySession(walletId, hallId, endedAtMs): Promise<void>     // triggers MANDATORY_PAUSE if ≥ 60min
```

## Dependencies

**Calls (downstream):**
- `ResponsibleGamingPersistenceAdapter` (`game/ResponsibleGamingPersistence.ts`) — Postgres persistence; called for every mutation (`insertLossEntry`, `upsertLossLimits`, `upsertPendingLossLimit`, `upsertPlaySessionState`, `upsertRestrictionState`)
- `ComplianceMappers` — to-persisted-row converters (`toPersistedLossEntry`, `toPersistedRestrictionState`, etc.)
- `ComplianceDateHelpers` — `startOfLocalDayMs` / `startOfLocalMonthMs` for Oslo-tz day/month boundaries (Norwegian retention)
- `roundCurrency` (`util/currency.ts`) — fractional-NOK protection for net-loss accumulation
- `DomainError` (`errors/DomainError.ts`) — typed error codes consumed by REST + Socket layers

**Called by (upstream):**
- `BingoEngine` (`game/BingoEngine.ts`) — `assertWalletAllowedForGameplay` before each room-join; `recordLossEntry` after stake/payout
- `Game1TicketPurchaseService` — `wouldExceedLossLimit` + `calculateMaxAffordableTickets` for bet:arm partial-buy
- `Game1PayoutService` — `recordLossEntry` with `type: "PAYOUT"` when crediting winnings
- `routes/spillevett.ts` — `setPlayerLossLimits`, `setTimedPause`, `setSelfExclusion`
- `routes/wallet/me/compliance.ts` — `getPlayerCompliance` (player-side compliance fetch, fail-closed in shell)
- `PlatformService.assertUserEligibleForGameplay` — composite gate (delegates to `assertWalletAllowedForGameplay`)
- `ComplianceLedger` / `ComplianceLedgerOverskudd` — daily aggregation reads loss entries via the persistence layer (separate read path)

## Invariants

- **Persist-first ordering (Stage 2A, PR #718).** Every mutation writes to DB first; the in-memory cache is only mutated after the DB write succeeds. If `insertLossEntry` throws, `lossEntriesByScope` does not gain the entry — `calculateNetLoss` cannot ever return a value that disagrees with the §71 hovedbok. Documented at `ComplianceManager.ts:563-576`. Verified by the `persistFirst.test.ts` suite (10+ bug-fix scenarios).
- **Per-hall loss scope (`makeLossScopeKey`).** Loss limits and net-loss are tracked per `(walletId, hallId)` pair — pengespillforskriften § 71 requires per-hall accounting because each hall has its own settlement to its bingoringsforening. The bug fixed in PR #443 (compliance multi-hall fix) ensured this scope key is the kjøpe-hall (purchase hall), not the master-hall.
- **Loss-limit ceiling = regulatory limit.** Setters reject any value > `regulatoryLossLimits.daily` / `.monthly`. Defaults: 900 kr/dag and 4 400 kr/mnd (overridable via env `BINGO_DAILY_LOSS_LIMIT` / `BINGO_MONTHLY_LOSS_LIMIT`). Increase = pending with `effectiveFromMs`; decrease = immediate (fail-closed for player). Test: `ComplianceManager.limits.test.ts` line 82 ("REGULATORY GUARD").
- **Mandatory pause (§ 66) on 60 min play.** `finishPlaySession` totals `accumulatedMs + (endedAtMs - activeFromMs)`. If sum ≥ `playSessionLimitMs` (default 60 min), the manager schedules `pauseUntilMs = endedAtMs + pauseDurationMs` (default 5 min) and stores a `lastMandatoryBreak` summary on the play state. `assertWalletAllowedForGameplay` throws `PLAYER_REQUIRED_PAUSE` until that pauseUntil expires.
- **1-year self-exclusion minimum (§ 22).** `setSelfExclusion` records `selfExcludedAtMs` and `selfExclusionMinimumUntilMs = now + selfExclusionMinMs` (default 365 days). `clearSelfExclusion` throws `SELF_EXCLUSION_LOCKED` if called before the minimum.
- **Voluntary pause is immutable until expiry.** `clearTimedPause` throws `TIMED_PAUSE_LOCKED` while `timedPauseUntilMs > nowMs`. Re-calling `setTimedPause` only extends (`Math.max(currentUntil, newUntil)`) — never shortens.
- **Net-loss retention.** `calculateNetLoss` only sums entries within `monthStart - 35 days` (`retentionCutoffMs`) — older entries are never re-aggregated even if the cache holds them. This bounds memory + matches the regulatory retention horizon.
- **Hydration is a full reset.** `hydrateFromSnapshot` clears all maps before re-inserting from the persisted snapshot. Boot-time consistency: the cache exactly mirrors DB at startup; subsequent persist-first mutations preserve that property.

## Test coverage

- `apps/backend/src/game/ComplianceManager.test.ts` — `calculateNetLoss` PAYOUT semantics (PAYOUT reduserer daglig + månedlig telleren), floor-at-zero, `wouldExceedLossLimit` does not reject when winnings could fund the buyin
- `apps/backend/src/game/ComplianceManager.limits.test.ts` — every input-validation + regulatory-guard branch in `setPlayerLossLimits` (boundary at regulatory limit, lower-than-default starts immediately, 0 accepted = self-lock-out)
- `apps/backend/src/game/ComplianceManager.restrictions.test.ts` — pause / self-exclusion lifecycles + `assertWalletAllowedForGameplay` resolves the right error code
- `apps/backend/src/game/ComplianceManager.persistFirst.test.ts` — Stage 2A bug-fix coverage: every mutate-before-persist scenario shows that DB-write throws → cache stays old (lines 170, 234, 268, 320, 355, 397) + restart-semantics (line 426) + concurrent mutations (line 487)
- `apps/backend/src/game/ComplianceManager.hydration.test.ts` — full-reset semantics, partial fields, restriction-state edge cases
- `apps/backend/src/game/ComplianceManager.calculateMaxAffordableTickets.test.ts` — bet:arm partial-buy ceiling math (PR #725)

## Operational notes

**Common production failures:**
- `PLAYER_SELF_EXCLUDED` / `PLAYER_TIMED_PAUSE` / `PLAYER_REQUIRED_PAUSE`: not bugs — these are regulated UX gates surfaced to the shell. Shell shows correct copy in `spillvett.js`.
- `TIMED_PAUSE_LOCKED` / `SELF_EXCLUSION_LOCKED`: player tried to clear a still-active block. Confirm `getPlayerCompliance` returns the right `pauseUntil` / `minimumUntil` in the response and check shell-side display.
- DB error during `recordLossEntry` (after Stage 2A): cache stays empty, error propagates. The buyin/payout caller must handle it and either retry or roll back its own work — `BingoEngine` re-tries via the `walletTxRetry` path; agent flows surface `COMPLIANCE_LEDGER_FAILURE`.
- "Loss limit appears wrong after restart": always check whether hydration ran. Boot logs show `module=compliance` with a hydrated-rows count. If 0, the persistence adapter wasn't wired — re-check `index.ts` boot order.
- `PRIZE_POLICY_MISSING` is **not** raised here — it lives in `PrizePolicyManager`. The two are sibling regulatory modules.
- Search for `logger.error` and `logger.warn` in this module: there are very few — the module deliberately throws typed `DomainError`s and lets callers handle them. Most diagnostics come from `module=compliance` info-logs at hydration + Stage 2A debug points.

## Recent significant changes

- **#725** (2026-04) — `bet:arm` enforces loss-limit with partial-buy + delayed-render UX (`calculateMaxAffordableTickets` arrives)
- **#718** — Stage 2A persist-first refactor. Fixed 4 mutate-before-persist bugs that could have left the §71 hovedbok inconsistent with the cache
- **#717** — DomainError extracted from BingoEngine into shared module
- **#478** — BIN-720 Profile Settings API + 48h-queue
- **#398** — Split ComplianceManager per domene (extracted ResponsibleGamingPersistence types into `ComplianceManagerTypes.ts`)
- **#443** — KRITISK fix: compliance multi-hall-binding (hookups now use kjøpe-hall, not master-hall)

## Refactor status

ComplianceManager is in good shape after Stage 2A. Remaining items in `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md`: pull `ComplianceLedger` and `ComplianceLedgerOverskudd` (sibling modules in same dir) into a unified `compliance/` subtree to make the §11/§71 reporting story easier to navigate.
