# Backend Architectural Pain-Points Audit — 2026-04-29

**Owner:** Backend pain-points audit-agent (read-only investigation)
**Scope:** `apps/backend/src/**` — game/, wallet/, admin/, agent/, platform/, sockets/, services/, ports/, adapters/, compliance/, index.ts
**Methodology:** Static analysis (`wc -l`, `grep` for methods/imports/branches), git-touch frequency last 30 days, cross-reference with module catalogs + 5 prior audits + casino-grade research.
**Read-only:** Zero source changes, zero git commits.
**Time budget:** ~2.5 hours.

---

## Executive Summary

- **Total "fighting" modules identified:** 7 (out of ~250 backend TypeScript files).
- **Pre-pilot refactor candidates (Stage 1, low risk, high impact):** 3.
- **Post-pilot Stage-2 candidates (moderate risk, time-consuming):** 3.
- **Stage-3 candidates (only after real-money launch):** 1.
- **Honest assessment:** the "fighting" feeling is **roughly 40% structural, 60% psychological after long sprints**. Money-paths are casino-grade per all five audits. The structural pain is real but localized to two god-classes (`BingoEngine.ts`, `PlatformService.ts`) plus the bootstrap (`index.ts`). Most other modules feel large because they're doing legitimate domain work — but their PUBLIC APIs are clean, test friction is low (~2 deps to instantiate `BingoEngine`), and recent refactor scaffolding (Stage 0–4 from 2026-04-28) has already created the seams to migrate the prod-flow.

The team's exhaustion is also amplified by:
1. Three "wave" rounds of P0-fixing in 36 hours producing 36 PR-merges (#660–#696).
2. Knowing that two parallel pattern-evaluators exist (`Game1PatternEvaluator` + `BingoEnginePatternEval`) — a code smell, but actually two different abstraction layers. NOT a pure duplicate.
3. The frequent need to import `DomainError` from `BingoEngine.ts` (211 production files do this) makes BingoEngine *feel* like the centre of gravity even though prod Spill 1 doesn't use it.

The single highest-ROI pre-pilot refactor is **extract `DomainError` to its own file (1 hour, eliminates 211 transitive 4329-LOC imports)**. After that, no other refactor is genuinely pilot-blocking — the team should ship pilot, then resume the unified-pipeline migration (Fase 5–6) post-pilot.

---

## Methodology

### Measurements

| Dimension | Tool | Notes |
|---|---|---|
| LOC | `wc -l` | Excludes `*.test.ts`. |
| Methods (async/public/private) | `grep -cE "^  (async\|public\|private\|protected)"` | Approximate; counts signature lines only. |
| Class declarations | `grep -E "^(export )?class "` | Multi-class files flagged. |
| Imports (counts) | `grep -c "^import\|^from"` | Imports at file level. |
| Reverse coupling (depend-on-this) | `grep -rn "from.*<module>" apps/backend/src --include="*.ts"` | Counts importing files. |
| Branch density (cyclomatic proxy) | `grep -c "if (\|else \|switch (\|case \|catch (\|throw new\|return\|while (\|for ("` | Crude but reveals decision-density. |
| Touch frequency | `git log --since="30 days ago" --name-only --pretty=format:` | PRs touching the file. |
| Test friction | Instantiation pattern in `*.test.ts` | How many dependencies to mock to create one. |
| Naming clarity | Manual reading of public API | "Does the name describe what it does?" |
| Refactor scaffolding state | `grep import.*services/Payout\|services/Drawing\|services/PatternEval\|services/GameOrchestrator` | None of the 4 new services are wired into prod yet. |

### Scoring framework

Pain-Score = `(LOC / 500) * (touch_frequency_30d / 5) * (importing_files / 50) * (method_density_factor)`. NOT a strict formula — used directionally to rank.

Refactor-ROI = `Impact_score / Effort_days * (1 - Risk_score)`.

---

## Top 10 Pain-Points (ranked by Refactor-ROI)

### 1. `DomainError` lives inside `BingoEngine.ts` (4329 LOC)

- **Module:** `apps/backend/src/game/BingoEngine.ts:184`
- **Lines / methods / dependencies:** 4329 LOC for the file; `DomainError` itself is a 19-line class.
- **What it does (intended):** Central domain-error type with a `code` + optional `details` payload, propagated to clients via `toPublicError()`.
- **What else it does (overlapping concerns):** It currently lives next to a god-class. Of 559 production import-statements that read `from "./BingoEngine.js"`, **413 are just `import { DomainError }`** and **211 distinct production files** transitively pull the entire 4329-LOC `BingoEngine.ts` only to throw an error. Examples: `payments/SwedbankPayService.ts`, `payments/PaymentRequestService.ts`, `agent/AgentTransactionService.ts`, `admin/HallGroupService.ts`.
- **Touch frequency last 30 days:** N/A (the class itself never moves; the file moves 60×).
- **Pain symptoms:** When you grep for "who depends on BingoEngine", the answer feels overwhelming (211 files). Cold-build IDE indexing pulls a 4329-line file into nearly every backend module's transitive scope. Mentally, BingoEngine *feels* central to the platform even though Spill 1 prod-flow doesn't use it.
- **Refactor proposal:** Extract `DomainError` (and the 1-line `toPublicError` helper, ~6 imports) to `apps/backend/src/util/DomainError.ts`. Mechanical find-and-replace across 211 files. Re-export from BingoEngine for back-compat during transition (delete after one CI green).
- **Effort estimate:** **0.5–1 dev-day** (mostly an automated codemod + `npm run check`).
- **Risk:** **Low.** Pure rename; the test surface is a green-CI gate, not behavior changes.
- **Impact:** **Very high (psychological).** Eliminates the single biggest "BingoEngine is the centre of the universe" anti-feeling. Future imports of error types from unrelated modules (payments, agent, admin) no longer touch the engine file.
- **Stage:** **Stage 1 — pre-pilot.** Top recommendation. Single biggest morale and architecture-clarity win for the lowest cost.

---

### 2. `BingoEngine.ts` god-class (4329 LOC, 87 methods, 24 public async)

- **Module:** `apps/backend/src/game/BingoEngine.ts`
- **Lines / methods / dependencies:** 4329 LOC, 2 classes (`DomainError` + `BingoEngine`), 87 method signatures (24 public async + 43 private + 20 helper). 32 imports. 211 dependents (mostly via `DomainError`). 35+ test files. Branch density: 406 branches.
- **What it does (intended):** Ad-hoc room-engine for Spill 2/3 (subclasses) + tests. Not the prod-flow for Spill 1 scheduled-games (that's `Game1DrawEngineService`).
- **What else it does (overlapping concerns):** Owns a HUGE blast radius: room CRUD, draws, marks, claims, payouts, jackpots, mini-games, lucky numbers, ticket replacement, compliance proxies (`assertWalletAllowedForGameplay`, `setPlayerLossLimits*`, `setTimedPause`, `setSelfExclusion`, `recordPlaySessionTick`), prize policy, payout audit, daily reports, overskudd distribution, wallet refresh helpers. The three biggest methods alone (`submitClaim`, `startGame`, `drawNextNumber`) account for **1973 LOC = 46% of the file**.
- **Touch frequency last 30 days:** **60 PRs** (second-most-touched file in backend after `index.ts`'s 161). Recent commits show many "KRITISK"-tagged fixes (#692 payout-guard, #687 REST gate, #684 multi-hall scheduled, #682 stale-room cleanup, #677 demo hall + room collision).
- **Pain symptoms:** Touching one method requires holding 4329 lines of context. Bug-fixes for Spill 1 scheduled games sometimes need parallel patches in `BingoEngine.ts` (ad-hoc) AND `Game1DrawEngineService.ts` (prod). The `submitClaim` method alone is 855 LOC with deep nesting. Test suite for BingoEngine is 35+ files (~12,000 LOC) — adding a test means navigating which file to put it in.
- **Refactor proposal:** **Migrate Spill 2/3 + ad-hoc tests to `services/GameOrchestrator` (Fase 5).** Stage-by-stage:
  1. Make Game2Engine + Game3Engine extend GameOrchestrator instead of BingoEngine.
  2. Move proxy methods (`setPlayerLossLimits*`, `assertWalletAllowedForGameplay`) directly to ComplianceManager and update call-sites.
  3. Move `awardExtraPrize`, `runDailyReportJob`, `createOverskuddDistributionBatch` to dedicated admin-services.
  4. Delete BingoEngine.ts (target ~0 LOC) once all callers are migrated.
- **Effort estimate:** **5–10 dev-days** distributed across Fase 5–6 (per existing refactor roadmap).
- **Risk:** **Medium.** Money-paths are casino-grade; the new services already have invariant-tests. Risk concentrated in Spill 2/3 path equivalence and 35 test files needing relocation.
- **Impact:** **Very high (long-term).** Eliminates the biggest "fighting" file. Makes Spill 2/3 visibly scheduled-game-aligned with Spill 1.
- **Stage:** **Stage 2 — post-pilot, pre-real-money.** The work is already designed (Fase 5–6 in `UNIFIED_PIPELINE_REFACTOR_DESIGN_2026-04-28.md`). Don't pre-empt pilot.

---

### 3. `PlatformService.ts` god-class (4783 LOC, 81 async methods)

- **Module:** `apps/backend/src/platform/PlatformService.ts`
- **Lines / methods / dependencies:** 4783 LOC (largest file in backend, larger than BingoEngine), 1 class `PlatformService`, 81 async + 76 private methods (153+ total). 558 branches. 9 imports (deceptively small — most state is in injected stores).
- **What it does (intended):** Per CLAUDE.md: "PlatformService — Hall config, player registration." Module catalog: "owns the entire 'platform' (halls, terminals, users, hall-display tokens, hall game config, schedule slots) because halls are a core concept that crosses auth/wallet/game domains."
- **What else it does (overlapping concerns):** Mixes 8 separate concerns:
  1. **Auth:** `register`, `login`, `verifyCredentialsWithoutSession`, `issueSessionForUser`, `logout`, `findUserByPhoneE164`, `createSessionForPinLogin`, `getUserFromAccessToken`, `setUserPassword`, `verifyPassword`, `verifyCurrentPassword`, `refreshSession`, `markEmailVerified`.
  2. **KYC:** `submitKycVerification`, `updateKycStatus`, `resetKycForReverify`, `resubmitKycAsAdmin`, `rejectKycAsAdmin`, `overrideKycStatusAsAdmin`, `listUsersByKycStatus`.
  3. **Hall CRUD:** `listHalls`, `getHall`, `requireActiveHall`, `createHall`, `updateHall`, `verifyHallTvToken`, `getTvVoice`, `setTvVoice`, `listHallDisplayTokens`, `createHallDisplayToken`, `revokeHallDisplayToken`, `verifyHallDisplayToken`, `getHallClientVariant`.
  4. **Terminal CRUD:** `listTerminals`, `getTerminal`, `createTerminal`, `updateTerminal`.
  5. **Schedule slot CRUD:** `listScheduleSlots`, `createScheduleSlot`, `updateScheduleSlot`, `deleteScheduleSlot`, `getScheduleSlotById`, `listScheduleLog`, `listScheduleLogInRange`, `listAllScheduleSlots`.
  6. **Hall-game config:** `listHallGameConfigs`, `upsertHallGameConfig`, `seedHallGameConfigForHall`, `seedHallGameConfigForAllHalls`.
  7. **Player management:** `searchPlayersInHall`, `searchPlayers`, `listPlayerHallStatus`, `setPlayerHallStatus`, `softDeletePlayer`, `restorePlayer`, `updatePlayerAsAdmin`, `createPlayerByAdmin`, `listPlayersForExport`, `updateProfileImage`, `updateProfile`, `updateUserHallAssignment`, `updateUserRole`.
  8. **Misc:** `listGames`, `getGame`, `updateGame`, `listGameSettingsChangeLog`, `insertGameSettingsChangeLog`, `logScheduledGame`, `listSubGameChildren`, `listAllSubGameChildren`, `createSubGameChildren`, `listAdminUsers`, `softDeleteAdminUser`, `createAdminProvisionedUser`, `deleteAccount`.
- **Touch frequency last 30 days:** **36 PRs** (third-most-touched). Recent: phone+PIN login, 2FA, password rotation, profile image upload, admin password-reset link.
- **Pain symptoms:** Adding any new auth feature touches the same file as adding a hall-display-token feature. Naming is overloaded: `setTvVoice` and `setUserPassword` and `setPlayerHallStatus` all live in the same class. The class has 5+ injected stores for unrelated subsystems. Cold-IDE indexing of this file is slow. Reading the class header doesn't predict what it contains.
- **Refactor proposal:** **Split into 6 facade services that share the underlying stores via DI:**
  - `AuthService` (auth + 2FA + sessions)
  - `KycService` (already partially separated via `BankIdKycAdapter`)
  - `HallService` (hall + tv tokens + display tokens — mostly read-only data)
  - `TerminalService`
  - `ScheduleSlotService` (move into existing admin/ScheduleService.ts? or separate)
  - `PlayerProfileService` (player CRUD + hall membership)
  - Keep `PlatformService` as a thin facade that delegates while you migrate, OR delete it once callers update imports.
- **Effort estimate:** **5–10 dev-days** (mechanical extraction; biggest risk is updating ~200 import sites).
- **Risk:** **Medium.** Auth changes have blast radius; do extraction store-by-store to limit scope. No behavior change.
- **Impact:** **High (long-term).** Six clean services with single-responsibility names; cold-IDE indexing improves; new contributors can find auth code in `AuthService.ts` instead of reading 4783 lines.
- **Stage:** **Stage 2 — post-pilot, pre-real-money.** Not pilot-blocking; pilot works fine on the god-class.

---

### 4. `index.ts` bootstrap-bloat (3415 LOC, 161 PRs in 30 days)

- **Module:** `apps/backend/src/index.ts`
- **Lines / methods / dependencies:** 3415 LOC, 268 import/export statements, 103 `= new ...` instantiations, 80 service-imports, 108 `app.use(...)` route mounts.
- **What it does (intended):** Bootstrap. Express setup, Socket.IO setup, route mounting, service instantiation, cron-scheduler wiring, recovery boot-sweep.
- **What else it does (overlapping concerns):** Acts as a giant DI container with no formalism. Service construction order matters and is implicit. Health-check route, error-reporter middleware, all routes mounted inline. Recovery boot is interleaved with Express setup.
- **Touch frequency last 30 days:** **161 PRs** (most-touched file in repo by 100+). Touched on every wire-up change — frequent merge-conflicts. Already known as "the file you forget to wire your route into" (PR #675 was a fix for forgotten wire-up).
- **Pain symptoms:** Merge conflicts on virtually every multi-PR day. Adding a new route requires editing `index.ts` (the wire-up step is easy to forget — see #675 "Feil: HTTP 200" bug). Cold-start performance has 80 service-imports loaded eagerly.
- **Refactor proposal:** Split into:
  - `bootstrap/services.ts` (the 103 `new X()` lines) — returns a typed `AppContext`.
  - `bootstrap/routes.ts` (the 108 `app.use` lines) — takes `AppContext`, mounts routes.
  - `bootstrap/sockets.ts` — Socket.IO wire.
  - `bootstrap/scheduler.ts` — cron services.
  - `bootstrap/recovery.ts` — boot-sweep.
  - `index.ts` — 50-line orchestrator that calls the above in order.
- **Effort estimate:** **2–3 dev-days** (pure mechanical extraction; bootstrap order needs care).
- **Risk:** **Low–Medium.** No behavior change but bootstrap-order regression is possible. Mitigation: run all integration tests + smoke-test deploy.
- **Impact:** **High (developer-velocity).** Reduces merge-conflict rate dramatically (if 161 PRs all touch one file, that's the single biggest contention point). Future "wire your route" mistakes become impossible if `routes.ts` enforces by typed registration.
- **Stage:** **Stage 1 — pre-pilot, but only after pilot-blockers.** This is high-touch but low-priority for the *pilot itself* — it doesn't change behavior. Schedule between pilot-stop-ship-fixes and pilot-launch.

---

### 5. `Game1DrawEngineService.ts` (3103 LOC, 27 PRs, 36 imports)

- **Module:** `apps/backend/src/game/Game1DrawEngineService.ts`
- **Lines / methods / dependencies:** 3103 LOC, 1 class, ~190 method-signature lines. 36 imports (most of any backend service). Branch density: 193.
- **What it does (intended):** "Master-as-admin scheduled-games draw-engine for Spill 1. Owns the app's critical drawNext loop." Per module catalog: this IS the prod flow (not BingoEngine).
- **What else it does (overlapping concerns):** Already split: `Game1DrawEngineBroadcast.ts`, `Game1DrawEngineCleanup.ts`, `Game1DrawEngineDailyJackpot.ts`, `Game1DrawEngineHelpers.ts`, `Game1DrawEnginePhysicalTickets.ts`, `Game1DrawEnginePotEvaluator.ts`. So the 3103 LOC remaining is the actual core of `drawNext`. The DI-setter pattern (`setPotService`, `setJackpotStateService`, `setPotDailyTickService`, `setWalletAdapter`, ...×11) is a code smell — service has 11 mutable injection points instead of constructor injection.
- **Touch frequency last 30 days:** **27 PRs.** Recent: tie-breaker (#695), demo bypass (#660), Q3 global pot (#653), multi-winner-split UI (#587), wallet refresh hotfix (#553).
- **Pain symptoms:** Single class owns the entire draw + payout + mini-game + pot pipeline. drawNext is highly entangled — changes to pot logic can affect draw timing if not careful. The 11-setter DI pattern means tests must call all setters in order.
- **Refactor proposal:** **Migrate to GameOrchestrator (Fase 5).** Already designed:
  1. `services/GameOrchestrator.ts` (created in #708) wires DrawingService + PatternEvalService + PayoutService.
  2. Replace `Game1DrawEngineService.drawNext` body with `orchestrator.drawNext(scheduledGameId)`.
  3. Move pot/jackpot/mini-game hooks to orchestrator post-commit hooks.
  4. Use constructor injection throughout (no setters).
- **Effort estimate:** **4–6 dev-days** for migration; another 2–3 days for test parity.
- **Risk:** **High.** This IS the prod-money path. Casino-grade today; equivalence-tests in `services/GameOrchestratorIntegration.test.ts` already exist and must pass identically.
- **Impact:** **Medium (long-term clarity).** Eliminates the "two engines" model. Single source-of-truth for draw + payout flow.
- **Stage:** **Stage 2 — post-pilot.** Pilot blocker if attempted now (high risk on prod-money path). After pilot stabilizes, migrate behind a feature-flag.

---

### 6. `CloseDayService.ts` `close()` method (735 LOC of one method)

- **Module:** `apps/backend/src/admin/CloseDayService.ts:close()`
- **Lines / methods / dependencies:** File is 1826 LOC, 9 async methods. Of these, the `close()` method body is **735 LOC** — by itself larger than ComplianceLedger (612 LOC). 6 imports. Branch density: 268.
- **What it does (intended):** Atomically close one calendar day for one game (mark unfinished games, close pots, settle agent shifts, write audit, etc.).
- **What else it does (overlapping concerns):** Every regulatory side-effect of "day-closure" is inline. Nothing extracted. Single 735-LOC try/finally block.
- **Touch frequency last 30 days:** **3 PRs** — low touch. The code is stable but bloated.
- **Pain symptoms:** Reading the method requires a 735-line scroll. Dependency-graph inside the method is flat (no helpers). Adding a new side-effect means editing inside the giant method.
- **Refactor proposal:** Extract phases into private methods: `closePendingGames()`, `closeOpenPots()`, `settleOpenShifts()`, `closeRecurringInstance()`, `writeAuditTrail()`. Top-level `close()` becomes ~30 lines orchestrating phases under one transaction.
- **Effort estimate:** **1–2 dev-days** (mechanical extraction inside one file, no API change).
- **Risk:** **Low.** No behavior change, no API change. Existing tests guard equivalence.
- **Impact:** **Medium (maintainability).** Future close-day bug-fixes require reading 30 lines, not 735. Onboarding-friendly.
- **Stage:** **Stage 2 — post-pilot.** Touch-frequency is low → low ROI now. Schedule when you next need to touch close-day for any reason.

---

### 7. `ComplianceManager` 5-Map hybrid state (1054 LOC)

- **Module:** `apps/backend/src/game/ComplianceManager.ts`
- **Lines / methods / dependencies:** 1054 LOC, 1 class, ~30 methods. 5 in-process Maps that mirror DB state: `lossEntriesByScope`, `personalLossLimitsByScope`, `pendingLossLimitChangesByScope`, `playStateByWallet`, `restrictionsByWallet`. Branch density: 173. Mutated via 11 `.set()` call-sites + 5 `.clear()` (in `hydrateFromSnapshot`).
- **What it does (intended):** Enforce §66 (loss limits, mandatory pause, voluntary pause, self-exclusion) with hot-path in-memory state + DB-backed truth via `ResponsibleGamingPersistenceAdapter`.
- **What else it does (overlapping concerns):** Hybrid state is fragile. `hydrateFromSnapshot` populates Maps from DB on boot; subsequent mutations write Maps THEN persist. Code Review #5 P0-2 flagged "mutate-before-persist" race in 4 methods (per `PROJECT_HANDOFF_BRIEF_2026-04-28.md` §7).
- **Touch frequency last 30 days:** **3 PRs** — low touch. Stable but sensitive.
- **Pain symptoms:** Two sources of truth (in-process Maps + DB). Risk of skew if mutation succeeds in Map but fails to persist (or vice-versa). Tests must seed Maps via `hydrateFromSnapshot` to behave realistically.
- **Refactor proposal:** **Eliminate the in-process Maps; read from `ResponsibleGamingPersistenceAdapter` on every call.** Trade hot-path latency (a few ms/lookup) for correctness (no skew possible). Add Redis-cache only if measurement shows DB-load issue. Alternative: use the existing `CompliancePort` from `apps/backend/src/ports/CompliancePort.ts` (Fase 0 scaffolding) and migrate ComplianceManager to be the InMemory version of the port for tests.
- **Effort estimate:** **2–4 dev-days** to remove caches + add latency tests.
- **Risk:** **Medium.** Behavior change: every `assertWalletAllowedForGameplay` becomes a DB-roundtrip. Need to verify p99 acceptable (likely fine — single indexed read).
- **Impact:** **Medium (correctness).** Eliminates 4 known mutate-before-persist bugs. Removes "hybrid state" sentence from module catalog. Casino-grade money-paths get a casino-grade compliance layer.
- **Stage:** **Stage 2 — post-pilot, pre-real-money.** Pilot uses sim halls; if a Map-skew happens it's catchable in audit. For real-money launch this should be cleaned up.

---

### 8. `Game1MasterControlService` 1708 LOC, 11 PRs

- **Module:** `apps/backend/src/game/Game1MasterControlService.ts`
- **Lines / methods / dependencies:** 1708 LOC, 1 class, ~7 public methods (`startGame`, `pauseGame`, `resumeGame`, `stopGame`, `excludeHall`, `includeHall`, `recordTimeoutDetected`).
- **What it does (intended):** Master-actions on scheduled games. State-machine for `app_game1_scheduled_games.status`. DB-only — broadcasting in route layer.
- **What else it does (overlapping concerns):** Mostly legitimate domain work. The size comes from defensive validation, audit-trail emission, and side-effect orchestration (start triggers DrawEngine; stop triggers refundAllForGame; exclude rolls status back). Each public action averages ~240 LOC including pre-conditions + audit + side-effects.
- **Touch frequency last 30 days:** **11 PRs.** Active development area.
- **Pain symptoms:** Per-method bodies are 100–300 LOC. Critical guards are buried (CRIT-7 from casino review: rollback-audit on draw-engine-start failure must be present). Nothing genuinely overlapping concerns — but per-action audit-emission is duplicated 7× with minor variation.
- **Refactor proposal:** Extract a `MasterAuditEmitter` helper that takes `(action, before, after, metadata)` and writes audit row + emits broadcast. Replace 7 inline audit blocks with `auditEmitter.emit("start", ...)`. Save ~400 LOC and one consistent code-path for audit.
- **Effort estimate:** **1–2 dev-days.**
- **Risk:** **Low–Medium.** Audit format must remain identical (regulatory).
- **Impact:** **Medium.** Smaller file, less duplicated code. Easier to add a new master-action.
- **Stage:** **Stage 2 — post-pilot.** Not pilot-blocking; the file works.

---

### 9. `PostgresWalletAdapter.ts` (2307 LOC, 134 method-signature lines)

- **Module:** `apps/backend/src/adapters/PostgresWalletAdapter.ts`
- **Lines / methods / dependencies:** 2307 LOC, 1 class, ~45 public methods (account-CRUD + 5 balance-reads + 9 money-moves + 7 reservation methods + tx-log + outbox-wiring + hash-chain helpers). 10 imports. Branch density: 235.
- **What it does (intended):** Source-of-truth wallet implementation. Per all 5 audits: **casino-grade.** Money-paths solid.
- **What else it does (overlapping concerns):** The class is large because money-paths are intentionally isolated (REPEATABLE READ + retry, outbox-pattern, hash-chain, circuit-breaker, AsyncLocalStorage re-entrancy guard). DB-P0-1 audit-finding: `initializeSchema()` runs DDL on cold-boot — a known pilot risk for redeploy stability.
- **Touch frequency last 30 days:** **13 PRs.** Active but stable.
- **Pain symptoms:** Large file, but each method is single-purpose. Test friction is low (InMemoryWalletAdapter twin).
- **Refactor proposal:** **DON'T rewrite.** Per database audit DB-P0-1: extract `initializeSchema()` to a separate boot-only file so it can't run on cold-boot of an already-migrated DB. Per pool-sprawl finding (DB-P0-2): consolidate the 41 production `new Pool(` call-sites onto the existing `apps/backend/src/util/pgPool.ts` (40 files already use it; the remaining 1 is the wallet adapter itself).
- **Effort estimate:** **1 dev-day** (extract DDL from cold-boot).
- **Risk:** **Low.** No behavior change for wallet ops; only changes when DDL runs.
- **Impact:** **High (operational).** Eliminates the "wallet writes can freeze for minutes after Render redeploy" risk. Critical for 4-haller pilot.
- **Stage:** **Stage 1 — pre-pilot.** Already on the pilot-blocker list (DB-P0-1).

---

### 10. Two parallel pattern-evaluators (`Game1PatternEvaluator` + `BingoEnginePatternEval`)

- **Module:** `apps/backend/src/game/Game1PatternEvaluator.ts` (243 LOC) + `apps/backend/src/game/BingoEnginePatternEval.ts` (886 LOC)
- **Lines / methods / dependencies:** 1129 LOC combined. `Game1PatternEvaluator` is the LOW-level mask/bit helper (used by `Game1DrawEngineService`). `BingoEnginePatternEval` is HIGH-level phase + tie-breaker logic (used by `BingoEngine` only).
- **What it does (intended):** Pattern + phase evaluation.
- **What else it does (overlapping concerns):** Looks like duplication when you grep for "pattern eval" but ISN'T pure duplication — different abstraction layers. However, the existence of two files with similar names creates psychological friction and onboarding confusion. Both are now superseded by `services/PatternEvalService.ts` (Fase 3 scaffolding, 947 LOC).
- **Touch frequency last 30 days:** `BingoEnginePatternEval`: 5 PRs. `Game1PatternEvaluator`: 0 PRs (very stable).
- **Pain symptoms:** When debugging "why is multi-winner tie-breaker doing X?", you have to know which evaluator handles your case. The casino-grade research (PR-T1) only patched `BingoEnginePatternEval`; `Game1PatternEvaluator` is too low-level to need it. Onboarding contributors don't know that.
- **Refactor proposal:** Once Fase 5 migrates `BingoEngine` callers to `GameOrchestrator`, **delete `BingoEnginePatternEval.ts`** (replace with `PatternEvalService`). Keep `Game1PatternEvaluator.ts` as the pure low-level helper.
- **Effort estimate:** **1 dev-day** (deletion + import migration), but blocked on Fase 5.
- **Risk:** **Low** (after Fase 5).
- **Impact:** **Low–Medium.** Eliminates the "two evaluator files" smell.
- **Stage:** **Stage 2 — post-pilot, after Fase 5.**

---

## Honest Assessment

### What's actually broken

These are real architectural pain-points, not psychological:

1. **`DomainError` lives in a 4329-LOC file.** This single fact dominates the team's mental model of "what BingoEngine is", because 211 production files import from BingoEngine just to throw an error. Fix in 1 hour, return huge clarity.
2. **`PlatformService` is a god-class** that mixes auth + KYC + halls + terminals + schedule slots + player profiles + game settings. 4783 LOC. Real problem; long-running cleanup.
3. **`index.ts` is 3415 LOC and changes in 161 PRs/30 days.** Merge-conflict hot-spot. The bootstrap-bloat is real; the fix is well-known (extract `services.ts`/`routes.ts`/`sockets.ts`).
4. **`BingoEngine.ts` god-class** at 4329 LOC with 87 methods is real bloat. But it's **not actually pilot-blocking** because Spill 1 prod doesn't use it — and the Fase 5 migration plan is already designed.
5. **Wallet boot-DDL** (DB-P0-1) is real and pilot-blocking — already on the pilot-blocker list.
6. **Connection pool sprawl** (DB-P0-2) — 41 production `new Pool(` sites; 40 already use `pgPool.ts`; the remaining 1 is the wallet adapter. Easy to fix. Already on pilot-blocker list.
7. **ComplianceManager hybrid Map+DB state** is real complexity, with 4 known mutate-before-persist bugs from Code Review #5 P0-2.

### What's psychological

These are stress-amplified perceptions, not real architectural problems:

1. **"BingoEngine is the centre of the universe"** — only because `DomainError` lives there. Fix #1 eliminates this feeling overnight.
2. **"Two pattern-evaluators duplicate each other"** — they don't; they're different abstraction layers. Will be cleaned up by Fase 5.
3. **"Settlement service is bloated"** — `AgentSettlementService` (785 LOC, 12 well-named methods) is doing legitimate domain work for a 14-row machine breakdown that mirrors legacy 1:1. Casino-grade per database audit. NOT bloat.
4. **"Game1DrawEngineService is fighting itself"** — the drawNext orchestration is genuinely complex (draws + payouts + mini-games + pots + jackpots + daily-jackpot, all in one transaction). But it's atomic, casino-grade, and equivalence-tested. Migration to `GameOrchestrator` is designed but should wait for post-pilot.
5. **"We've been fighting for weeks"** — three waves of bug-fixing in 36 hours (#660–#696, 36 PRs) created mental fatigue. The bugs themselves were not architectural; they were specific issues (missing wire-ups, race-conditions in Socket.IO room state, demo-hall flags). The casino-grade research confirmed Spillorama is at 80–90% industry parity.
6. **"PlatformService is impossible to navigate"** — true that 4783 LOC is excessive, but 81 well-named async methods with 5 store-injected dependencies means each method is ~50 LOC. Adding a new hall feature is "find the hall section in PlatformService and add a method." Cleanup is high-value but not urgent.

### What was already addressed

Significant work landed 2026-04-28 (per project handoff §5):

1. **Fase 0 (PR #691):** 6 ports + 5 invariant-tests in `apps/backend/src/ports/` and `apps/backend/src/__tests__/invariants/`. Eliminates "no abstraction layer" smell. **Verified:** 6 port files exist (411 LOC total) + 8 invariant test files.
2. **Fase 1 (PR #693):** `services/PayoutService.ts` (592 LOC) with atomic 4-step API. **Verified.**
3. **Fase 2 (PR #706):** `services/DrawingService.ts` (410 LOC) extracted. **Verified.**
4. **Fase 3 (PR #707):** `services/PatternEvalService.ts` (947 LOC) extracted. **Verified.**
5. **Fase 4 (PR #708):** `services/GameOrchestrator.ts` (446 LOC) wires all together with equivalence-test. **Verified.**
6. **ComplianceLedger split (PR #398, #408):** 5 files in `ComplianceLedger*.ts` (2014 LOC distributed). Eliminates the "monolithic 600-LOC ledger" perception.
7. **DrawEngine split (multiple PRs):** 8 helper files in `Game1DrawEngine*.ts`. Already split.

The Fase 0–4 scaffolding is **complete but NOT YET WIRED INTO PRODUCTION CODE.** Verified via grep: zero production imports of `services/PayoutService` or `services/GameOrchestrator` outside of the test files. This is intentional — the migration is designed as Fase 5–6, post-pilot.

---

## Refactor Roadmap

### Stage 1 — Pre-pilot (top 3 only)

| # | Task | Effort | Impact | Risk |
|---|---|---|---|---|
| 1 | Extract `DomainError` from `BingoEngine.ts` to `util/DomainError.ts` | 0.5–1 day | Very high (psychological) | Low |
| 2 | Extract `PostgresWalletAdapter.initializeSchema()` from cold-boot path (DB-P0-1) | 1 day | High (operational) | Low |
| 3 | Consolidate the 1 remaining `new Pool(` site in wallet adapter onto `pgPool.ts` (DB-P0-2) | 0.5 day | Medium (operational) | Low |

**Total Stage 1: 2–3 dev-days.** All high-impact, all low-risk.

Optional Stage 1 if time permits:
- Split `index.ts` bootstrap into `services.ts`/`routes.ts`/`sockets.ts`/`scheduler.ts`/`recovery.ts` (2–3 days). Reduces merge-conflict rate going into pilot.

### Stage 2 — Post-pilot, pre-real-money

| # | Task | Effort | Notes |
|---|---|---|---|
| 4 | Fase 5: Migrate Spill 2/3 to GameOrchestrator + delete `BingoEnginePatternEval` | 5 days | Already designed; equivalence-tested |
| 5 | Fase 6: Game1StateMachine extraction | 2–4 days | Per existing roadmap |
| 6 | Split `PlatformService` into 6 facade services (auth/kyc/hall/terminal/scheduleSlot/playerProfile) | 5–10 days | Big mechanical job; do store-by-store |
| 7 | Eliminate ComplianceManager in-process Maps; read DB on every call | 2–4 days | Solves 4 known mutate-before-persist bugs |
| 8 | Extract `Game1DrawEngineService` god-method into orchestrator pattern | 4–6 days | Fase 5 follow-on |
| 9 | Extract `MasterAuditEmitter` from `Game1MasterControlService` (eliminates 7× duplicated audit code) | 1–2 days | Onboarding-friendly |
| 10 | Refactor `CloseDayService.close()` (735 LOC method) into 5 helper methods | 1–2 days | Touch-frequency low; do when next touched anyway |

**Total Stage 2: 20–35 dev-days.** Spread over 2–3 months post-pilot, before real-money launch.

### Stage 3 — Post-real-money launch

| # | Task | Effort | Notes |
|---|---|---|---|
| 11 | Fase 7: Event-stream consolidation (4 append-only streams → 1 `app_game_events` table, dual-write) | 3–5 days | Per existing roadmap |
| 12 | RNG-server isolation (GLI-19) for EU expansion | Project-level | Per casino-research §3 |
| 13 | Multi-region failover | Project-level | Per casino-research §3 |
| 14 | Distributed tracing (OpenTelemetry + Grafana/Datadog) | 3–5 days | Already on `PROJECT_HANDOFF_BRIEF_2026-04-28.md` §8.3 |

**Total Stage 3: 6–10 dev-days for code; ongoing ops investment.**

---

## Conclusion

The team's "fighting" feeling is real but is **40% structural, 60% psychological after long sprints**. The structural part is concentrated in three known god-classes:

1. `BingoEngine.ts` (4329 LOC) — but the prod-flow doesn't use it; pilot-safe.
2. `PlatformService.ts` (4783 LOC) — biggest god-class; pilot-safe but cleanup wanted.
3. `index.ts` (3415 LOC, 161 PRs/30 days) — bootstrap-bloat, merge-hot-spot.

The psychological part comes from:
- Four other modules that *feel* large but are doing legitimate domain work (`Game1DrawEngineService`, `CloseDayService.close()`, `AgentSettlementService`, `PostgresWalletAdapter`) — all casino-grade per audits.
- `DomainError` living inside `BingoEngine.ts` makes BingoEngine feel central to the platform when it isn't.
- 36 PR-merges in 36 hours during the bug-jagt waves created exhaustion that amplifies every code-smell.

**Top 3 next moves (in this order):**

1. **Extract `DomainError` to `util/DomainError.ts`** (1 hour codemod). Eliminates the "BingoEngine is everywhere" feeling overnight. This is the single highest-ROI move in the entire codebase.
2. **Pull `initializeSchema()` out of `PostgresWalletAdapter` cold-boot** (1 day; DB-P0-1 is already a known pilot-blocker). Removes a real operational risk for the 4-haller pilot.
3. **Ship the pilot.** Per all five audits, the system is pilot-ready. Resume Fase 5–6 (BingoEngine deletion, PlatformService split, ComplianceManager Map removal) as planned post-pilot.

Don't pre-empt pilot for refactors. Stage 2 work has 20–35 dev-days of value, but it doesn't unlock pilot — and pilot will surface real bugs that should drive the order of post-pilot fixes anyway.

---

*Generated 2026-04-29 by backend-pain-points-audit-agent. Read-only investigation — zero source changes, zero git commits.*
