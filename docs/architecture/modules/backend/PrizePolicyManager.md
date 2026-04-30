# PrizePolicyManager

**Files:**
- `apps/backend/src/game/PrizePolicyManager.ts` (423 LOC) — versioned policy store + caps
- `apps/backend/src/adapters/PrizePolicyPort.ts` (62 LOC) — narrow port re-exposed to non-engine call-sites

**Owner-area:** compliance
**Last reviewed:** 2026-04-30

## Purpose

Holds active and historical prize policies per `(gameType, hallId, linkId)` scope, enforces the single-prize cap (§ 11 — max 2500 kr per enkeltpremie), tracks daily extra-prize accrual against a per-hall cap, and audits any extra-draw purchase attempts (`EXTRA_DRAW_NOT_ALLOWED` — extra-draw is forbidden for databingo).

Policies are versioned by `effectiveFromMs` so a hall's caps can be changed at a future point without losing history. `resolvePrizePolicy` walks scope keys from most-specific (`gameType::hallId::linkId`) to wildcards (`gameType::*::*`), choosing the latest version with `effectiveFromMs ≤ atMs`. A default `DATABINGO::*::*` wildcard policy with `singlePrizeCap=2500` and `dailyExtraPrizeCap=12000` is seeded in the constructor so a missing per-hall config never silently bypasses the cap.

## Public API

```ts
// Hydration
hydrateFromSnapshot(snapshot: PrizePolicyHydrationSnapshot): void
getDefaultPolicies(): PrizePolicyVersion[]                   // for persistence seeding when DB empty

// Read
getActivePrizePolicy({ hallId, linkId?, gameType?, at? }): PrizePolicySnapshot
resolvePrizePolicy({ hallId, linkId, gameType, atMs }): PrizePolicyVersion  // throws PRIZE_POLICY_MISSING

// Write
upsertPrizePolicy({ gameType?, hallId?, linkId?, effectiveFrom, singlePrizeCap?, dailyExtraPrizeCap? }): Promise<PrizePolicySnapshot>

// Caps
applySinglePrizeCap({ hallId, gameType, amount, atMs? }): { cappedAmount, wasCapped, policy }

// Extra prize ledger
getExtraPrizeEntriesForScope(scopeKey): ExtraPrizeEntry[]
setExtraPrizeEntriesForScope(scopeKey, entries): void
persistExtraPrizeEntry(entry: PersistedExtraPrizeEntry): Promise<void>

// Extra-draw denial audit
rejectExtraDrawPurchase({ source?, roomCode?, playerId?, walletId?, hallId?, metadata? }): never  // throws EXTRA_DRAW_NOT_ALLOWED
listExtraDrawDenials(limit?: number): ExtraDrawDenialAudit[]                                    // most-recent first

// Scope keys
makePrizePolicyScopeKey(gameType, hallId, linkId): string
makeExtraPrizeScopeKey(hallId, linkId): string
toPersistedPrizePolicy(policy): PersistedPrizePolicy
```

## Dependencies

**Calls (downstream):**
- `ResponsibleGamingPersistenceAdapter` (`game/ResponsibleGamingPersistence.ts`) — `upsertPrizePolicy`, `insertExtraPrizeEntry`
- `DomainError` (`errors/DomainError.ts`) — `PRIZE_POLICY_MISSING`, `EXTRA_DRAW_NOT_ALLOWED`, `INVALID_INPUT`, `INVALID_HALL_ID`
- `node:crypto.randomUUID` — fresh UUID per policy version + audit row

**Called by (upstream):**
- `BingoEngine` — owns the manager (`apps/backend/src/game/BingoEngine.ts:601`) and exposes `getPrizePolicyPort()` (line 758) so non-engine call-sites can apply the cap without coupling
- `Game1PayoutService` — caps every payout via `applySinglePrizeCap` before `walletAdapter.credit`/`transfer`
- `Game1LuckyBonusService` — caps Lucky-Number bonus payout (K2-A CRIT-3)
- `Game1MiniGameOrchestrator` — caps mini-game payouts
- `PotEvaluator` (`game/pot/PotEvaluator.ts`) — caps innsatsen-pot payouts (PR #532+)
- `BingoEngine.submitClaim` — direct caps inside the engine on line 1775-1779 + 1880-1884
- `routes/admin/prizePolicy.ts` — admin-CRUD over policy versions
- `routes/rooms/{roomCode}/game/extra-draw` — `rejectExtraDrawPurchase` is the only response (databingo cannot grant extra draws)

## Invariants

- **Single-prize cap is non-negotiable.** Every payout path must call `applySinglePrizeCap` before crediting the wallet. The narrow `PrizePolicyPort` (`adapters/PrizePolicyPort.ts`) exists so non-engine paths (Lucky bonus, mini-games, pot evaluator) can enforce the cap without taking a direct dependency on `BingoEngine`. `wasCapped=true` means the difference (`amount - cappedAmount`) is retained by the house and MUST be audited as `RTP_HOUSE_RETAINED` via `PayoutAuditTrail`.
- **Default cap = 2500 kr.** Constructor seeds `DATABINGO::*::*` with `singlePrizeCap=2500`, `dailyExtraPrizeCap=12000`. A missing per-hall override falls back to this, so caps are never bypassed by misconfiguration.
- **Versioned, never overwritten.** `applyPrizePolicy` filters out an existing entry with the same `effectiveFromMs` (idempotent edits at the same instant) but keeps every other historical version. `resolvePrizePolicy` selects the latest version where `effectiveFromMs ≤ atMs` — late-arriving policy edits cannot rewrite past payouts.
- **Scope-resolution order: most-specific wins.** `resolvePrizePolicy` tries `(gameType, hallId, linkId)` first, then `(gameType, hallId, *)`, then `(gameType, *, linkId)`, then `(gameType, *, *)`. Throws `PRIZE_POLICY_MISSING` if none of those four match — should be unreachable in production thanks to the seeded default but useful for tests with a clean fixture.
- **Extra-draw is forbidden for databingo.** `rejectExtraDrawPurchase` is the **only** entry point for `/api/rooms/:roomCode/game/extra-draw` and always throws. The denial is recorded in an in-memory ring (max 1000 entries) for compliance audit and exposed via `listExtraDrawDenials`. Source is one of `API` / `SOCKET` / `UNKNOWN` so reviewers can trace which surface caught the attempt.
- **Wildcard normalisation.** Empty / undefined `hallId` or `linkId` is normalised to `"*"` before scope-key building. Maximum 120 chars per dimension to prevent unbounded scope explosion.
- **Cap values are integer kroner.** `applyPrizePolicy` floors `singlePrizeCap` and `dailyExtraPrizeCap` so policies stored in DB can never carry sub-NOK precision.

## Test coverage

There is no dedicated `PrizePolicyManager.test.ts` — the manager is exercised through its single owner, `BingoEngine`:

- `apps/backend/src/game/BingoEngine.test.ts` line 394 — "rtp payout budget caps total payouts across line and bingo claims" (cap interaction with payout budget)
- `apps/backend/src/game/BingoEngine.test.ts` line 1169 — "prize policy caps single databingo payouts and stores policy reference"
- `apps/backend/src/game/BingoEngine.test.ts` line 1247 — "prize policy supports hall/link effective dates and extra-prize daily cap"
- `apps/backend/src/game/BingoEngine.test.ts` line 1159 — `EXTRA_DRAW_NOT_ALLOWED` denial path
- `apps/backend/src/game/Game2Engine.test.ts` — Game-2 payout cap surfacing
- `apps/backend/src/game/pot/PotEvaluator.k2a.test.ts` — K2-A CRIT-3: pot evaluator goes through `PrizePolicyPort`
- `apps/backend/src/game/minigames/Game1MiniGameOrchestrator.k2a.test.ts` — K2-A CRIT-3: mini-game orchestrator goes through `PrizePolicyPort`

Targeted tests should be added during pre-pilot polish (note in `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md`).

## Operational notes

**Common production failures:**
- `PRIZE_POLICY_MISSING`: should be impossible thanks to the seeded `DATABINGO::*::*` default. If raised in prod it means hydration corrupted the wildcard policy or the seed-step was skipped (verify boot logs `module=prize-policy`). Resolution: re-seed via `upsertPrizePolicy` with `gameType=DATABINGO, hallId="*", linkId="*"`.
- `EXTRA_DRAW_NOT_ALLOWED`: not a bug — this is the regulatory gate. Confirms a player attempted to extend a databingo round. Investigate the `metadata` blob to see what UI surface let the request through (should be impossible from the live shell).
- `wasCapped=true` repeatedly on a hall: someone configured a payout policy that exceeds 2500 kr or a game emitted a >2500 kr line/full-house. Inspect `app_payout_audit` for the run + check `RTP_HOUSE_RETAINED` events.
- Memory pressure from `extraDrawDenials`: hard-capped at 1000. If you see this triggering, review the rate of denials and whether to flush to DB instead.

## Recent significant changes

- **#717** — DomainError extracted from BingoEngine
- **K2-A CRIT-3 (no separate PR — landed inside #551)** — `PrizePolicyPort` introduced so non-engine payout paths (Lucky bonus, mini-games, pot evaluator) can enforce the cap without coupling to `BingoEngine`

## Refactor status

Stable. The seeded default + version history pattern is conservative-correct (regulators can replay any past payout against the policy that was active then). Pre-pilot polish item: write a dedicated `PrizePolicyManager.test.ts` so changes to scope-resolution semantics fail in isolation rather than buried in `BingoEngine.test.ts` (`REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` Test Coverage Gaps).
