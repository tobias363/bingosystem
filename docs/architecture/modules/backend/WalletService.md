# WalletService

**Files:**
- `apps/backend/src/adapters/WalletAdapter.ts` (347 LOC) — port/contract
- `apps/backend/src/adapters/PostgresWalletAdapter.ts` (2364 LOC) — production implementation
- `apps/backend/src/adapters/InMemoryWalletAdapter.ts` (605 LOC) — test/dev implementation
- `apps/backend/src/wallet/walletTxRetry.ts` — REPEATABLE READ + retry helper (BIN-762)
- `apps/backend/src/wallet/WalletOutboxRepo.ts` — outbox pattern repo (BIN-761)
- `apps/backend/src/wallet/WalletAuditVerifier.ts` — hash-chain verifier (BIN-764)

**Owner-area:** wallet
**Last reviewed:** 2026-04-30

## Purpose

Spillorama's wallet ports + adapters: the single authority for player money. Source of truth is Postgres (`app_wallet_accounts`, `app_wallet_transactions`, `app_wallet_entries`, `app_wallet_outbox`, `app_wallet_reservations`).

The adapter implements casino-grade safeguards required by Lotteritilsynet and matches the Evolution / Pragmatic Play industry baseline: split-account model (deposit + winnings), idempotency-key dedup, REPEATABLE READ + serialization-failure retry, double-entry ledger with hash-chain audit trail, outbox-pattern event publishing, circuit breaker around DB write paths, and pre-round wallet reservations (credit-card-authorisation pattern).

## Public API

The `WalletAdapter` interface (`WalletAdapter.ts:230-347`) is what the rest of the backend depends on. `PostgresWalletAdapter` implements every method.

```ts
// Account lifecycle
createAccount(input?: CreateWalletAccountInput): Promise<WalletAccount>
ensureAccount(accountId: string): Promise<WalletAccount>      // idempotent — never throws on existing
getAccount(accountId: string): Promise<WalletAccount>
listAccounts(): Promise<WalletAccount[]>

// Balance reads (split-aware after PR-W1)
getBalance(accountId): Promise<number>                        // total = deposit + winnings
getDepositBalance(accountId): Promise<number>                 // loss-limit teller kun denne siden
getWinningsBalance(accountId): Promise<number>
getBothBalances(accountId): Promise<WalletBalance>            // single round-trip
getAvailableBalance?(accountId): Promise<number>              // total - sum(active reservations)

// Mutations (each accepts optional idempotency-key)
debit(accountId, amount, reason, opts?): Promise<WalletTransaction>     // winnings-first policy
credit(accountId, amount, reason, opts?: CreditOptions): Promise<WalletTransaction>
creditWithClient?(accountId, amount, reason, opts: CreditWithClientOptions): Promise<WalletTransaction>  // joins caller's tx (CRIT-5)
topUp(accountId, amount, reason?, opts?): Promise<WalletTransaction>    // alltid deposit-side
withdraw(accountId, amount, reason?, opts?): Promise<WalletTransaction> // winnings-first
transfer(from, to, amount, reason?, opts?: TransferOptions): Promise<WalletTransferResult>  // dual entry

// History
listTransactions(accountId, limit?: number): Promise<WalletTransaction[]>

// BIN-693 reservation lifecycle (optional per adapter)
reserve?(accountId, amount, opts: ReserveOptions): Promise<WalletReservation>
increaseReservation?(reservationId, extraAmount): Promise<WalletReservation>
releaseReservation?(reservationId, amount?): Promise<WalletReservation>
commitReservation?(reservationId, toAccount, reason, opts?): Promise<WalletTransferResult>
listActiveReservations?(accountId): Promise<WalletReservation[]>
listReservationsByRoom?(roomCode): Promise<WalletReservation[]>
expireStaleReservations?(nowMs): Promise<number>
```

`PostgresWalletAdapter` exposes additional ops surface: `getCircuitState()`, `setOutboxRepo()`, `getPool()`, `getSchema()`.

## Dependencies

**Calls (downstream):**
- `pg.Pool` — DB connection (shared via DB-P0-002 since #715)
- `withWalletTx` — `wallet/walletTxRetry.ts` — wraps every write in REPEATABLE READ tx with retry on 40001/40P01 (BIN-762)
- `WalletOutboxRepo.enqueue` — same-tx event-row insert (BIN-761)
- `CircuitBreaker` — `util/CircuitBreaker.ts` — wraps DB write paths (HIGH-8)
- `metrics` — Prometheus counters per circuit-state transition
- `node:crypto` — `randomUUID`, `createHash` for hash-chain (BIN-764)

**Called by (upstream):**
- `Game1TicketPurchaseService` — bet:arm reserve + commit on round-start
- `Game1PayoutService` — credit winnings on bingo claim
- `BingoEngine` / `Game2Engine` / `Game3Engine` — payout-transfer at game-end
- `Game1MiniGameOrchestrator` — `creditWithClient` so wallet-credit + result-row update share one tx (CRIT-5)
- `PlatformService` — `register()` calls `createAccount` to provision wallet on signup
- `agentTransactions.ts` — agent cash-in/cash-out, ticket-sale, customer-unique-id (BIN-583 B3.2 + BIN-464)
- `routes/wallet.ts` + `routes/admin/wallet.ts` — REST surface
- `payments/swedbank.ts` — Swedbank Pay topup-confirm credits deposit-side
- `WalletReservationExpiryService` — periodic `expireStaleReservations` tick
- `WalletOutboxWorker` — picks dispatchable rows enqueued via `outboxRepo`
- `WalletAuditVerifier` — nightly hash-chain audit (BIN-764)

## Invariants

- **Double-entry ledger.** Every transaction inserts a balanced pair into `app_wallet_entries` (DEBIT + CREDIT) — sum of all entries per account equals current balance. Enforced by ledger SQL in `executeLedger` paths and verified nightly by `WalletAuditVerifier`.
- **Winnings-first debit policy.** `debit`, `withdraw`, `transfer` (sender) drain `winnings_balance` before `deposit_balance`. `splitDebitFromAccount` (`PostgresWalletAdapter.ts:161-169`) is the single source. Loss-limit (`ComplianceManager.recordLossEntry`) only counts entries where `account_side='deposit'`.
- **Topup always deposit-side; admin credits never winnings.** `topUp` hardcodes deposit; `credit` defaults to deposit and `to: "winnings"` is a regulatory-restricted code path used only by game-engine payout (per JSDoc on `CreditOptions` line 113-129; gate enforced in `routes/admin/wallet.ts`).
- **Idempotency.** Every mutation accepts an `idempotencyKey`; duplicate calls return the original transaction. Postgres uses `app_wallet_idempotency` keyed by `(operation_id, idempotency_key)`. 90-day TTL cleanup runs via `WalletIdempotencyCleanupService` (BIN-767).
- **REPEATABLE READ + retry.** Write paths execute under REPEATABLE READ via `withWalletTx`; SQLState `40001` (serialization_failure) and `40P01` (deadlock_detected) retry up to 3 times with exponential backoff (50/150/450ms). After 3 retries we throw `WALLET_SERIALIZATION_FAILURE` (BIN-762).
- **Hash-chain audit (BIN-764).** Each `wallet_entries`-row stores `entry_hash = SHA256(previous_entry_hash || canonical_json(entry_data))` per account-chain. Genesis = 64 hex zeros. `canonicalJsonForEntry` sorts keys alphabetically for cross-platform stability. `WalletAuditVerifier` walks the chain nightly and alarms on mismatch. Re-hash migration is the only safe way to change hash-input fields.
- **Outbox atomicity (BIN-761).** When `outboxRepo` is set, every successful ledger commit writes one outbox row per non-system transaction inside the **same** PoolClient tx as the ledger INSERT. No wallet-tx can exist without its event row. Worker uses `FOR UPDATE SKIP LOCKED` for safe multi-worker dispatch; row goes `pending → processed` or `pending → dead_letter` after 5 failed attempts.
- **Circuit breaker (HIGH-8).** DB write paths are wrapped in a 3-failure → OPEN → 30s cooldown → HALF_OPEN breaker named `postgres-wallet`. `breakerContext` (AsyncLocalStorage) bypasses re-entrant inner calls so a single user-visible failure isn't double-counted.
- **System accounts cannot hold winnings.** `__system_house__` and `__system_external_cash__` have `is_system=true`. CHECK-constraint `winnings_balance = 0 for system accounts`; `transfer.targetSide` ignored for system targets (always lands on deposit).
- **Currency = NOK only (BIN-766).** `wallet_accounts.currency` CHECK-constraint enforces `'NOK'`. Field is exposed in the type for forward-compat but multi-currency is gated on a future migration.
- **Reservations are credit-card-authorisation semantics (BIN-693).** A reservation locks `amount` against `available_balance` without mutating `deposit_balance`/`winnings_balance`. Lifecycle: `active → committed` (commit converts to transfer in same tx), `active → released` (full or partial prorata refund), `active → expired` (TTL via `expireStaleReservations`). Idempotency-key required.

## Test coverage

**Unit + isolation tests (Postgres-required, skipped without `WALLET_PG_TEST_DSN`):**
- `apps/backend/src/adapters/PostgresWalletAdapter.isolation.test.ts` — REPEATABLE READ behavior, concurrent debit serialization, `40001` retry exhaustion path
- `apps/backend/src/adapters/PostgresWalletAdapter.hashChain.test.ts` — genesis hash, deterministic canonical JSON, chain-walking, partial-chain recovery
- `apps/backend/src/adapters/PostgresWalletAdapter.outbox.test.ts` — atomic enqueue with ledger, dispatch order, dead-letter after 5 attempts
- `apps/backend/src/adapters/PostgresWalletAdapter.reservation.test.ts` — full reserve→commit→release lifecycle, idempotency, partial-release prorata
- `apps/backend/src/adapters/PostgresWalletAdapter.walletSplit.test.ts` — winnings-first debit ordering, race protection, retro-migration
- `apps/backend/src/adapters/PostgresWalletAdapter.transferTargetSide.test.ts` — payout vs refund target-side semantics, system-account override
- `apps/backend/src/adapters/PostgresWalletAdapter.currency.test.ts` — NOK-only CHECK behavior
- `apps/backend/src/adapters/PostgresWalletAdapter.circuitBreaker.test.ts` — open/half-open/closed transitions, re-entrancy guard

**In-memory parity tests (no DB):**
- `apps/backend/src/adapters/InMemoryWalletAdapter.core.test.ts` — same contract surface as Postgres
- `apps/backend/src/adapters/InMemoryWalletAdapter.race.test.ts` — single-threaded JS race semantics
- `apps/backend/src/adapters/InMemoryWalletAdapter.reservation.test.ts` — Option B reservations

**Higher-level wallet machinery:**
- `apps/backend/src/wallet/walletTxRetry.test.ts` — `withWalletTx` 40001/40P01 retry classification, `BEGIN/SET ISOLATION/COMMIT/ROLLBACK` calls, `client.release` resource leak prevention
- `apps/backend/src/wallet/WalletAuditVerifier.test.ts` — chain integrity after normal use, manipulation detection (amount tamper → `hash_mismatch`), legacy-unhashed rows, 10k-entry perf
- `apps/backend/src/wallet/WalletOutboxRepo.test.ts` + `WalletOutboxWorker.test.ts` — `claimNextBatch` SKIP LOCKED, retry counter, dead-letter
- `apps/backend/src/wallet/WalletReservationExpiryService.test.ts` — periodic tick semantics

## Operational notes

**Common production failures:**
- `WALLET_SERIALIZATION_FAILURE` after 3 retries: contention spike (e.g. 100+ concurrent buyins on same hall house-account). Search logs for `module=walletTxRetry` + correlation-id. Resolution: usually transient; if persistent inspect `pg_stat_activity` for long-running tx blocking writes.
- `WALLET_CIRCUIT_BREAKER_OPEN`: Postgres write side has failed 3 times in a row. Breaker auto-recovers after 30s. Check `metrics{circuit="postgres-wallet"}` and DB connection. Re-check pool exhaustion (`getPoolTuning()` defaults).
- `INSUFFICIENT_FUNDS` on reserve/debit: not a system error — caller's UX must show "ikke nok penger". Inspect `getBothBalances` + `getAvailableBalance` (latter accounts for reservations).
- `IDEMPOTENCY_MISMATCH`: same `idempotency_key` used with different parameters. This is a CALLER bug (must include all variant inputs in the key). Search `app_wallet_idempotency` for the colliding key.
- Hash-chain `hash_mismatch` from `WalletAuditVerifier`: tamper-evidence triggered. **Stop deploys.** Treat as security incident — manual DB write, compromised migration, or hardware data-corruption. Compare last-good entry-hash against backup snapshot.
- Outbox stuck at `pending`: worker not running, or all dispatches failing. Check `WalletOutboxWorker` logs and `app_wallet_outbox.last_error`. Rows ≥ 5 attempts auto-flip to `dead_letter` for ops-replay.
- `INVALID_WALLET_RESPONSE` thrown from `asMoney`: DB returned non-numeric in numeric column. Almost always a schema-drift bug — verify `wallet_accounts.balance` is `numeric`.

**Idempotency-key contracts** (callers MUST provide unique keys per logical op):
- Bet purchase: `bet-arm:${roomCode}:${ticketRequestId}`
- Payout: `payout:${gameSessionId}:${ticketId}:${patternId}`
- Reservation commit (BIN-693): the original `idempotencyKey` from `reserve()` opts is reused for commit/release
- Topup: `topup:${swedbankIntentId}` (Swedbank webhook callback)
- Agent cash-in: `agent-cashin:${shiftId}:${clientRequestId}`
- Payment-request accept (BIN-586): `payment-request:${kind}:${id}`

## Recent significant changes

- **#715** (DB-P0-002, 2026-04) — boot-DDL + shared pool consolidation; adapter accepts `pool` directly, no longer creates own pool by default
- **#599** — customer unique-id prepaid kort: agent-side reserve+commit flows
- **#580** — BIN-764: hash-chain audit trail + `WalletAuditVerifier`
- **#566** — BIN-762: REPEATABLE READ + retry on 40001/40P01
- **#565** — BIN-761: outbox pattern + worker
- **#595** — KRITISK fix: faste premier hus-garantert (1700 kr utbetales selv ved liten pool)
- **#582** — HIGH-8: circuit breaker around DB write paths
- **#591** — BIN-766: multi-currency readiness in schema (NOK-only enforced for now)
- **#521** — fix: 4 critical issues from PR #513 review (fractional-NOK, TOCTOU race, deterministic idempotency, SecurityService alarm)
- **#458** — BIN-693 Option B: wallet reservations for pre-round bong purchase
- **#363** — PR-W3: `transfer()` `targetSide` parameter (winnings-first transfer for payouts)
- **#354** — PR-W1: wallet-split schema (`deposit_balance` + `winnings_balance`) + adapter

## Refactor status

WalletAdapter port + Postgres adapter are the most-reviewed and most-tested module in the backend. Casino-grade hardening (BIN-761/762/764) is complete. Remaining items in `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md`: extract idempotency-store into shared module so non-wallet code (e.g. agent-tx) can use the same pattern without copying SQL.
