# Game1DrawEngineService

**File:** `apps/backend/src/game/Game1DrawEngineService.ts` (3103 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Postgres-backed scheduled-engine for Spill 1 multi-hall games — owns scheduled-game state, draw bag, ticket assignments, phase-progression payouts, jackpot evaluation, mini-game triggers, and broadcaster wiring. Parallel to `BingoEngine` but used for master-as-admin scheduled flows that span multiple halls in a group.

It exists because `BingoEngine` is host-player-room-scoped and cannot represent a scheduled multi-hall game where the master hall drives the round and other halls join via `app_game1_hall_ready_status`. Instead of forcing two semantics into one class, scheduled Spill 1 runs on this entirely separate engine that uses Postgres rows (`app_game1_scheduled_games`, `app_game1_game_state`, `app_game1_draws`, `app_game1_ticket_assignments`) as the source of truth and rebuilds room-state per draw via SQL.

## Public API

```typescript
export class Game1DrawEngineService {
  constructor(opts: Game1DrawEngineServiceOptions)

  // Round lifecycle
  async startGame(scheduledGameId, actorUserId): Promise<Game1GameStateView>
  async drawNext(scheduledGameId): Promise<Game1GameStateView>
  async pauseGame(scheduledGameId, actorUserId, reason?): Promise<Game1GameStateView>
  async resumeGame(scheduledGameId, actorUserId): Promise<Game1GameStateView>
  async stopGame(scheduledGameId, actorUserId, reason): Promise<Game1GameStateView>
  async destroyRoomForScheduledGameSafe(scheduledGameId, roomCode): Promise<void>

  // Read-helpers
  async getState(scheduledGameId): Promise<Game1GameStateView>
  async listDraws(scheduledGameId): Promise<Game1DrawRecord[]>
  async getRoomCodeForScheduledGame(scheduledGameId): Promise<string | null>
  async assignRoomCode(scheduledGameId, roomCode): Promise<void>

  // Late-binding setters (avoid circular wiring)
  setPotService(svc: Game1PotService): void
  setJackpotStateService(svc: Game1JackpotStateService): void
  setPotDailyTickService(svc: PotDailyAccumulationTickService): void
  setWalletAdapter(adapter: WalletAdapter): void
  setPhysicalTicketPayoutService(svc: PhysicalTicketPayoutService): void
  setMiniGameOrchestrator(orchestrator: Game1MiniGameOrchestrator): void
  setOddsenEngine(engine: MiniGameOddsenEngine): void
  setBingoEngine(engine: BingoEngine): void
  setAdminBroadcaster(broadcaster: AdminGame1Broadcaster): void
  setPlayerBroadcaster(broadcaster: Game1PlayerBroadcaster): void
}

// Public types
export interface Game1GameStateView {
  scheduledGameId; currentPhase; drawsCompleted; lastDrawnBall;
  lastDrawnAt; isFinished; isPaused; pausedAtPhase;
  pausedAutomatically?; drawnBalls;
}
export interface Game1DrawRecord { sequence; ball; drawnAt; }
export const DEFAULT_GAME1_MAX_DRAWS = 52;

// Standalone helper
export function generateGridForTicket(...): number[][]
```

## Dependencies

**Calls (downstream):**
- `Game1TicketPurchaseService` — `loadPurchasesForGame`, `loadAssignmentsForGame`, `loadAssignmentsByGameAndPhase`.
- `Game1PayoutService` — `payoutPhase` (per-color phase splits).
- `Game1JackpotService` (per-color fixed jackpot) + `Game1JackpotStateService` (daily accumulating jackpot).
- `Game1LuckyBonusService` — Lucky Number Bonus on Fullt Hus (PR #442).
- `Game1PotService` + `Game1DrawEnginePotEvaluator.runAccumulatingPotEvaluation` — Innsatsen + Jackpott pots (PR-T2/T3, PR-C2).
- `Game1DrawEngineDailyJackpot.runDailyJackpotEvaluation` — daily-jackpot debit-and-reset on Fullt Hus.
- `PotDailyAccumulationTickService` — daily +4000 boost before tryWin.
- `Game1MiniGameOrchestrator.maybeTriggerFor` — fire-and-forget post-commit trigger after Fullt Hus.
- `MiniGameOddsenEngine.resolveForGame` — atomic Oddsen resolve at threshold-draw (in same TX as draw).
- `PhysicalTicketPayoutService` — physical-ticket auto-cashout on phase-win.
- `WalletAdapter` — pot/jackpot/lucky-bonus credits (`to: "winnings"`).
- `ComplianceLedgerPort` (K2-A CRIT-2) — EXTRA_PRIZE entries for pot/jackpot/lucky.
- `PrizePolicyPort` (K2-A CRIT-3) — single-prize-cap (2500 kr) enforcement.
- `AuditLogService` — fire-and-forget engine events (`game1_engine.*`).
- `Game1DrawEngineCleanup.destroyBingoEngineRoomIfPresent` — cross-engine cleanup at completion/cancellation.
- `Game1DrawEngineBroadcast.*` — `emitPlayerDrawNew`, `emitPlayerPatternWon`, `emitAdminDrawProgressed`, `emitAdminPhaseWon`, `emitAdminPhysicalTicketWon`, `emitAdminAutoPaused`.
- `Game1DrawEnginePhysicalTickets.evaluatePhysicalTicketsForPhase` + `loadDrawnBallsSetHelper`.
- `Game1DrawEngineHelpers` — config parsing, phase resolution, jackpot resolution.
- `Game1PatternEvaluator.evaluatePhase` (DB-backed pattern matcher per phase).
- `DrawBagStrategy.buildDrawBag` + `resolveDrawBagConfig` — draw-bag construction.
- `BingoEngine` — late-bound, used only for room cleanup at termination.
- Postgres `pg.Pool` directly for transactional draw-step + state mutations.

**Called by (upstream):**
- `apps/backend/src/index.ts` — boot wiring + late-binding cycle.
- `apps/backend/src/sockets/game1ScheduledEvents.ts` — Socket.IO scheduled-namespace handlers.
- `apps/backend/src/jobs/game1AutoDrawTick.ts` — global 1s tick (via `Game1AutoDrawTickService`).
- `apps/backend/src/jobs/game1ScheduleTick.ts` — schedule tick (start, auto-escalation).
- `apps/backend/src/routes/adminGame1Master.ts` (via `Game1MasterControlService`) — master pause/resume/stop.
- `apps/backend/src/game/Game1AutoDrawTickService.ts` — calls `drawNext` for ready games.

## Invariants

- All write-ops run in a Postgres transaction (`runInTransaction`); rollback on any failure leaves no partial state.
- `app_game1_scheduled_games.status` transitions are monotonic: `purchase_open → ready_to_start → running → completed | cancelled`. Transitions enforced via `loadScheduledGameForUpdate` + status guards.
- `drawNext` is idempotent against retry — `FOR UPDATE` row-lock + `draws_completed` increment ensures each ball is drawn exactly once.
- Pattern-evaluation order is deterministic: `(purchased_at ASC, assignmentId ASC)` for tie-breaker (matches BIN-694 spec; differs from ad-hoc engine which uses lex-on-playerId).
- Phase auto-pause: when phase is won, engine sets `app_game1_game_state.paused = true` + `pausedAtPhase = N` so master must explicitly resume (Master-plan §2.3, Task 1.1, Gap #1).
- Single-prize-cap (2500 kr §11) enforced via `PrizePolicyPort` BEFORE every phase payout — capped amount logged to audit + ledger.
- Daily jackpot debit-and-reset is atomic via `Game1JackpotStateService.awardJackpot` (own pool connection); subsequent wallet credits are idempotent per `g1-jackpot-credit-{awardId}-{assignmentId}`.
- Mini-game trigger is post-commit fire-and-forget — orchestrator failure does NOT roll back the draw.
- Oddsen resolve is in-transaction with the threshold-draw — `resolveForGame` runs inside the same `client` and rolls back on draw failure.

## Test coverage

- `apps/backend/src/game/Game1DrawEngineService.test.ts` — main suite (start/draw/end happy-path, idempotency, paused, completed).
- `apps/backend/src/game/Game1DrawEngineService.autoPause.test.ts` — phase-won auto-pause (Task 1.1).
- `apps/backend/src/game/Game1DrawEngineService.demoHallBypass.test.ts` — Demo Hall bypass for scheduled.
- `apps/backend/src/game/Game1DrawEngineService.featureCoverage.test.ts` — full feature matrix coverage.
- `apps/backend/src/game/Game1DrawEngineService.luckyBonus.test.ts` — Lucky Number Bonus payout.
- `apps/backend/src/game/Game1DrawEngineService.payoutWire.test.ts` — payout wire format + admin/player broadcasts.
- `apps/backend/src/game/Game1DrawEngineService.perColorConfig.test.ts` — per-color matrix + variant-config resolution.
- `apps/backend/src/game/Game1DrawEngineService.physicalTicket.test.ts` — physical-ticket auto-cashout per phase.
- `apps/backend/src/game/Game1DrawEngineService.destroyRoom.test.ts` — cross-engine room cleanup.
- `apps/backend/src/game/Game1DrawEngineService.roomCode.test.ts` — room-code assign/lookup.

## Operational notes

Common failures + how to diagnose:
- `INVALID_CONFIG: Ugyldig schema-navn` at construction — `schema` option not matching `^[a-z_][a-z0-9_]*$`. Fix env wiring.
- Game stuck in `purchase_open` despite all halls ready — check `app_game1_hall_ready_status` rows; auto-escalation runs in `game1ScheduleTick` cron, not engine.
- Draw stops mid-round — check `app_game1_game_state.paused` flag (manual pause vs auto-pause; `pausedAtPhase` differentiates).
- `INVALID_CONFIG: potService krever også walletAdapter` — late-binding order violated; caller must set walletAdapter BEFORE potService.
- `MACHINE_TICKET_NOT_FOUND` chain from drawNext — Oddsen state mismatch; check `app_game1_oddsen_state` for active row.
- Jackpot debit succeeded but credits failed — partial-failure documented in `Game1DrawEngineDailyJackpot.ts` docstring; state rolled back via outer TX, but `app_game1_jackpot_awards` row committed in own connection. Operator must rebalance via admin tooling.
- `runDailyJackpotEvaluation` skipReason — values: `NO_HALL_GROUP`, `ABOVE_THRESHOLD` (drawSequenceAtWin > drawThresholds[0]), `ZERO_BALANCE`, `NO_WINNERS`, `STATE_MISSING`. Check audit-event metadata.
- Stale broadcast — `adminBroadcaster` / `playerBroadcaster` are late-bound; if null at draw time the engine drops broadcasts silently. Verify boot order in `index.ts`.

## Recent significant changes

- PR #727 (`b697215e`): trigger mini-game in auto-claim phase for Fullt Hus.
- PR #695 (`358e8df2`): PR-T1 — deterministic multi-winner tie-breaker.
- PR #660 (`05baf614`): Demo Hall bypass for scheduled engine.
- PR #653 (`564dc6b3`): Spill 1 Q3 — global pot per phase (regulatorisk pilot-fix).
- PR #587 (`d6b8a174`): UI Gevinst-display counts actual credit at multi-winner-split.
- PR #553 (`41ed85de`): W1-hotfix — refresh `Player.balance` + bridge dedup-removal + cache-control for 2nd-win bug.
- PR #550 (`fcb4cb43`): K2-A regulatorisk — `MAIN_GAME` gameType + ledger on pot/lucky/mini-game + single-prize-cap.
- PR #546 (`f790095a`): jackpot award-pathen — atomic debit-and-reset + auto-trigger on Fullt Hus.
- PR #450 (`f4bebda8`): auto-pause on phase-won + manual resume (Task 1.1).
- PR #442 (`5fd92cb9`): Lucky Number Bonus payout on Fullt Hus on chosen number.
- PR #434 (`d591a61b`): Innsatsen legacy total-cap semantics (ordinær + pot ≤ 2000).
- PR #395 (`2dc12263`): extract `Game1DrawEngineHelpers` (pure helpers + constants).
- PR #394 (`5d6925e1`): split `Game1DrawEngineService` (2955 → 2593 LOC).
- PR #386 (`2ac8245c`): PR-C4 — broadcast draws to player-client.
- PR #385 (`ef805646`): PR-C2 — consolidated PotEvaluator (T2 + T3).

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- HV-3 candidate: at 3103 LOC after PR #394 split, the service still mixes (a) lifecycle (start/pause/stop), (b) draw orchestration, (c) phase payout coordination, (d) broadcaster wire-up. Audit recommends extracting `drawNext`'s phase-evaluation+payout block (~600 LOC) into a `Game1PhasePipeline` and lifting all `setX()` late-binding into a `Game1DrawEngineWiring` builder.
- 16 late-binding setters indicate a circular-dependency smell that a typed DI container would eliminate.

