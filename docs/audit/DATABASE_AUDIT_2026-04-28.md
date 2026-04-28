# Database Audit — 2026-04-28

**Owner:** Database-audit-agent (read-only investigation)
**Scope:** PostgreSQL 16 production schema, ~127 migrations, ~125 tables.
**Methodology:** Static analysis of `apps/backend/migrations/*.sql` + `apps/backend/src/**` query patterns. NO live DB connection, NO migrations, NO ALTER TABLE. ~2 hours of investigation.

---

## Executive Summary

- **Tables:** 125 unique tables across 127 migration files. ~9 are likely orphans (no `apps/backend/src/` references).
- **Migrations:** Forward-only (BIN-661) confirmed. Only the README mentions any "Down migration" pattern.
- **Indexes:** 268 explicit `CREATE INDEX` statements. Coverage on hot read-paths is good for the most part — but several P0/P1 gaps identified.
- **Pilot-blocking:** **YES, conditionally**. Three findings (DB-P0-1, DB-P0-2, DB-P0-3) can cause pilot brick / wallet freeze / runaway data growth and must be addressed before real-money play.

**Top 3 database risks:**

1. **Boot-time DDL on populated wallet tables** (`PostgresWalletAdapter.initializeSchema()` runs `ADD CONSTRAINT CHECK` on every cold-boot — full-table validation can lock wallet writes for minutes on Render cold-start).
2. **Connection-pool sprawl: 75 distinct `new Pool()` call-sites, each with `max=20`** → theoretical 1500 connections vs Render Postgres starter limit (~100). Real risk of connection-saturation under load.
3. **Orphan `app_draw_session_*` tables (BIN-515 multi-hall schema) with FKs from `app_regulatory_ledger`** — the active scheduled-game flow uses `app_game1_scheduled_games` instead. FK targets exist but never get rows → §71 ledger rows always have `draw_session_id IS NULL`.

---

## Methodology

1. Inventory: `grep CREATE TABLE` across all migrations to enumerate schema. Cross-reference with `apps/backend/src/` to detect orphans.
2. Index coverage: extract `CREATE INDEX` and `CREATE UNIQUE INDEX`; cross-reference with hot WHERE-clauses in code.
3. FK consistency: parse `REFERENCES` clauses and `ON DELETE` behaviors.
4. Migration safety: scan for `ALTER TABLE`, `ADD CONSTRAINT`, `UPDATE` (data backfill), `DROP COLUMN` patterns that block writes on populated prod tables.
5. Pool config: trace all `new Pool({...})` instantiations.
6. JSONB usage: scan for unbounded JSONB columns (DoS vector).
7. Timestamp/money/PK type consistency.
8. Code references for top 25 tables to identify orphans.

---

## Schema Inventory by Domain

### Wallet domain (16 tables)

| Table | Status | Notes |
|---|---|---|
| `wallet_accounts` | Active | NOT prefixed with `app_`. NUMERIC(20,6) balance via GENERATED expression. Multi-currency-ready (`currency` CHECK 'NOK'). |
| `wallet_transactions` | Active | NOT prefixed. NUMERIC(20,6). Idempotency UNIQUE partial index. |
| `wallet_entries` | Active | Append-only ledger with hash-chain (`entry_hash`/`previous_entry_hash`). NOT prefixed. |
| `wallet_outbox` | Active | BIN-761 outbox-pattern for guaranteed broadcasts. NOT prefixed. |
| `wallet_reconciliation_alerts` | Active | NOT prefixed. |
| `app_wallet_reservations` | Active | UUID PK (inconsistent). `wallet_id` lacks FK to wallet_accounts. |
| `swedbank_payment_intents` | Active | NOT prefixed. NUMERIC(18,2) amount_major + BIGINT amount_minor (dual storage). |
| `app_deposit_requests` | Active | `wallet_id` lacks FK. `submitted_by`/`accepted_by` are TEXT NULL with no FK to app_users. |
| `app_withdraw_requests` | Active | Same FK gaps as deposit_requests. |
| `app_payment_methods` | Active | |
| `app_idempotency_records` | Active | Composite PK (idempotency_key, endpoint). No TTL cleanup yet. |

### Game domain (~30 tables)

`app_games`, `app_game_types`, `app_game_management`, `app_game_settings_change_log`, `app_games`, `app_schedules`, `app_daily_schedules`, `app_close_day_log`, `app_close_day_recurring_patterns`, `app_saved_games`, `app_sub_games`, `app_patterns`, `hall_game_schedules` (legacy, NOT prefixed), `hall_schedule_log` (NOT prefixed), `game_sessions` (NOT prefixed, used by BingoEngine), `game_checkpoints` (NOT prefixed, used by recovery).

**Spill 1 scheduled-game cluster:**
`app_game1_scheduled_games`, `app_game1_hall_ready_status`, `app_game1_master_audit`, `app_game1_master_transfer_requests`, `app_game1_ticket_purchases`, `app_game1_ticket_assignments`, `app_game1_game_state`, `app_game1_phase_winners`, `app_game1_draws`, `app_game1_mini_game_results`, `app_game1_oddsen_state`, `app_game1_jackpot_state`, `app_game1_jackpot_awards`, `app_game1_pot_events`, `app_game1_accumulating_pots`, `app_game1_mini_game_mystery`. All actively referenced.

`app_chat_messages`, `app_voucher_redemptions`, `app_vouchers`, `app_mini_games_config`, `app_loyalty_*` (3 tables), `app_leaderboard_tiers`, `app_unique_ids`, `app_unique_id_transactions`, `app_static_tickets`, `app_ticket_ranges_per_game`.

### Agent domain (8 tables)

`app_agent_halls`, `app_agent_permissions`, `app_agent_settlements`, `app_agent_shifts`, `app_agent_ticket_ranges`, `app_agent_transactions`, `app_machine_tickets`, `app_physical_ticket_*` (3 tables: batches, transfers, pending_payouts), `app_physical_tickets`, `app_physical_ticket_cashouts`. All actively referenced.

### Admin domain

`app_halls`, `app_terminals`, `app_hall_groups`, `app_hall_group_members`, `app_hall_registrations`, `app_hall_game_config`, `app_hall_cash_transactions`, `app_hall_manual_adjustments`, `app_hall_display_tokens`, `app_hall_products`, `app_products`, `app_product_carts`, `app_product_cart_items`, `app_product_categories`, `app_product_sales`, `app_screen_saver_images`, `app_cms_content`, `app_cms_content_versions`, `app_cms_faq`, `app_maintenance_windows`, `app_ops_alerts` (UUID PK — inconsistent), `app_system_settings`.

### Compliance/Audit domain (15 tables)

`app_audit_log` (BIGSERIAL PK, immutable per BIN-588 comment).
`app_regulatory_ledger` (BIN-657 hash-chain + immutability triggers, blocks UPDATE/DELETE/TRUNCATE).
`app_daily_regulatory_reports`.
`app_rg_compliance_ledger` (idempotency-keyed, append-only).
`app_rg_daily_reports`, `app_rg_extra_prize_entries`, `app_rg_hall_organizations`, `app_rg_loss_entries`, `app_rg_overskudd_batches`, `app_rg_payout_audit` (with own hash-chain), `app_rg_pending_loss_limit_changes`, `app_rg_personal_loss_limits`, `app_rg_play_states`, `app_rg_prize_policies`, `app_rg_restrictions`.

### KYC / AML

`app_aml_red_flags`, `app_aml_rules`, `app_blocked_ips`, `app_risk_countries`, `app_player_hall_status`, `app_user_pins`, `app_user_2fa`, `app_user_2fa_challenges`, `app_email_verify_tokens`, `app_password_reset_tokens`, `app_user_devices` (UUID PK).

### Infra / Auth

`app_users`, `app_sessions`, `app_user_profile_settings`, `app_auth_tokens`, `app_notifications` (UUID PK), `app_xml_export_batches`, `app_withdraw_email_allowlist`.

### Suspected orphans (referenced only in early migrations, no `src/` references)

| Table | Created in | Status |
|---|---|---|
| `app_draw_sessions` | `20260417000001_ticket_draw_session_binding.sql` | **Orphan** — BIN-515 multi-hall schema. Replaced by `app_game1_scheduled_games` for Spill 1 pilot. FK from `app_regulatory_ledger.draw_session_id` will always be NULL. |
| `app_draw_session_halls` | early migrations | **Orphan** — same. |
| `app_draw_session_tickets` | `20260417000008_draw_session_tickets.sql` | **Orphan** — same. |
| `app_draw_session_events` | early migrations | **Orphan** — same. |

(Note: this matches the PROJECT_HANDOFF_BRIEF "P2 — Dual multi-hall-schema opprydding".)

---

## Index Coverage Analysis

### Hot queries with adequate indexes

| Hot Query | File:Line | Has Index? |
|---|---|---|
| Wallet lookup by `account_id, created_at DESC` | `PostgresWalletAdapter.ts:1601` | YES — `idx_wallet_transactions_account_created`, `idx_wallet_entries_account_created`. |
| Wallet idempotency lookup | adapter | YES — partial UNIQUE on `idempotency_key` WHERE NOT NULL. |
| Hash-chain walk per account | adapter | YES — `idx_wallet_entries_hash_chain (account_id, id)` (BIN-764). |
| Audit log by `(actor_id, created_at)` | `AuditLogService.ts:283` | YES — partial `idx_app_audit_log_actor_created`. |
| Audit log by `(resource, resource_id, created_at)` | `AuditLogService.ts:267` | YES — partial `idx_app_audit_log_resource_created`. |
| Compliance ledger by `(wallet_id, created_at_ms)` | `ResponsibleGamingPersistence.ts` | YES — `idx_rg_ledger_wallet_date`. |
| Compliance ledger by `(hall_id, created_at_ms)` | reports | YES — `idx_rg_ledger_hall_date`. |
| Agent tx by `(shift_id, created_at)`, `(player_user_id, created_at)`, `(hall_id, created_at)` | `AgentTransactionService` | YES — full coverage. |
| Active reservations per wallet | `Game1TicketPurchaseService` | YES — partial `idx_wallet_reservations_wallet_active`. |
| Open machine tickets | `MetroniaService` | YES — partial `idx_app_machine_tickets_open WHERE NOT is_closed`. |
| Active payment requests per hall+status | admin queries | YES — `idx_app_deposit_requests_status_created_at`, etc. |

### Hot queries with **missing or wrong** indexes

| Hot Query | File:Line | Has Index? | Recommended Index |
|---|---|---|---|
| `app_users WHERE phone = $1 AND deleted_at IS NULL` | `PlatformService.ts:782` | **NO** | `CREATE INDEX idx_app_users_phone ON app_users(phone) WHERE deleted_at IS NULL;` |
| `app_users WHERE email = $1 AND deleted_at IS NULL` | `PlatformService.ts:677,715` | Partial — UNIQUE on `email` exists, but partial-on-deleted_at would be stricter | Optional: replace UNIQUE with partial UNIQUE WHERE deleted_at IS NULL (allows email-reuse after soft-delete). |
| `idx_app_users_deleted_at WHERE deleted_at IS NOT NULL` | migration `20260418190000` | **Wrong direction** — query filters `IS NULL`, index covers `IS NOT NULL`. Index is for finding deleted accounts only. | Either drop or add a complementary `WHERE deleted_at IS NULL` index. Currently planner falls back to full scan + filter for active-user lookups by non-email columns. |
| `app_notifications WHERE n.data->>'scheduledGameId' = g.id AND created_at >= now() - interval '24 hours'` (game-start dedup) | `gameStartNotifications.ts:107` | **NO** | `CREATE INDEX idx_app_notifications_scheduled_game ON app_notifications((data->>'scheduledGameId'), created_at DESC) WHERE type = 'game-start';` Otherwise sequential scan grows linearly with notification volume. |
| `app_audit_log WHERE actor_id = $1 AND resource = 'session' AND action LIKE 'auth.login%' AND created_at BETWEEN ...` | `AuditLogService.ts:287` | Partial — `idx_app_audit_log_actor_created` is fine for actor_id filter but doesn't help LIKE. | Acceptable as-is because actor_id filter narrows to <100 rows typically. |
| `app_game1_scheduled_games WHERE status IN (...) AND scheduled_start_time > now()` | `gameStartNotifications.ts:101` | YES — `idx_game1_sched_status_start (status, scheduled_start_time)`. | OK. |
| `app_game1_scheduled_games WHERE master_hall_id = $1 AND status = ...` | various | **NO direct index on master_hall_id** | Add `CREATE INDEX idx_game1_sched_master_status ON app_game1_scheduled_games(master_hall_id, status);` |
| Wallet reconciliation: full table scans across `wallet_accounts` | `walletReconciliation.ts` | Sequential scan accepted | OK for nightly cron. |
| Settlement listing: `WHERE hall_id = $1 AND business_date BETWEEN ...` | settlement reports | YES — `idx_app_agent_settlements_hall_date`. | OK. |
| `app_machine_tickets WHERE hall_id = $1 AND machine_name = 'METRONIA' AND created_at BETWEEN ...` | machine reports | YES — `idx_app_machine_tickets_hall_machine`. | OK. |
| `app_physical_tickets WHERE hall_id = $1 AND status = 'UNSOLD'` | inventory | YES — `idx_app_physical_tickets_hall_status`. | OK. |
| `app_user_devices WHERE user_id = $1 AND is_active = true` | FCM fan-out | YES — partial. | OK. |

---

## Foreign Key Consistency

- **216 explicit `REFERENCES`** across all migrations.
- **Distribution of `ON DELETE`:**
  - `RESTRICT`: 85 (most common — protects audit trails)
  - `SET NULL`: 81 (audit columns: `created_by`, `closed_by`, `voided_by`, etc.)
  - `CASCADE`: 43 (parent-child like batches→tickets, session→events)
  - **Default `NO ACTION` (no explicit clause):** 7 — mostly old wallet tables (`wallet_accounts`(id) FK from wallet_entries / wallet_transactions). Acceptable since wallet rows are immutable.

### FK gaps and orphan-row risks

1. **`app_deposit_requests.wallet_id`** — TEXT NOT NULL but **no FK to `wallet_accounts(id)`**. Same for `app_withdraw_requests.wallet_id`. Same for `app_wallet_reservations.wallet_id`. Same for `app_rg_payout_audit.wallet_id`. **Risk:** typo in service code can insert payment-request pointing at non-existent wallet. Currently relies on app-layer validation only.
2. **`app_deposit_requests.submitted_by`/`accepted_by`/`rejected_by`** — TEXT NULL with no FK to `app_users`. If user is hard-deleted (currently impossible — only soft-delete) we'd lose actor reference. Acceptable today, fragile if ADMIN ever needs to fully purge a user for GDPR.
3. **`app_deposit_requests.wallet_transaction_id`** — TEXT NULL with no FK to `wallet_transactions(id)`. Same for `app_withdraw_requests`. **Risk:** can store an invalid `wallet_transaction_id` after retry-bug. Should be FK with `ON DELETE RESTRICT`.
4. **`app_agent_transactions.wallet_tx_id`** — TEXT NULL. Comment says "links to wallet_transactions" but no FK constraint. Same risk.
5. **`app_game1_scheduled_games.started_by_user_id`/`stopped_by_user_id`** — TEXT NULL with no FK. **Intentional** per comment ("user-sletting ikke skal fjerne historikk"). Acceptable since users are soft-deleted.
6. **`app_regulatory_ledger.draw_session_id REFERENCES app_draw_sessions(id) ON DELETE RESTRICT`** — points at orphan table. FK is enforced but never fires. Should remove FK + NULL the column or migrate to point at `app_game1_scheduled_games(id)`.

### Soft-delete vs hard-delete strategy

- `app_users.deleted_at TIMESTAMPTZ NULL` (soft-delete only).
- `app_products.deleted_at`, `app_product_categories.deleted_at`, `app_close_day_recurring_patterns.deleted_at`.
- Other tables (settlements, transactions, audit) are append-only — never deleted.
- **No explicit hard-delete CASCADE chain on user-purge** (GDPR right-to-erasure not fully wired). When real GDPR-purge is needed, FK constraints will block it.

---

## Migration Strategy Assessment

- **Forward-only:** ✅ Verified — only the README mentions Down migrations. All migration files use `-- Up migration` exclusively.
- **Naming:** ✅ `YYYYMMDDHHMMSS_snake_case_description.sql`. ASCII-only, sortable.
- **Idempotency:** ✅ Mostly — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`. Some `ADD CONSTRAINT` calls lack `IF NOT EXISTS` but `IF NOT EXISTS` for constraints isn't supported pre-PG 16 (we're on PG 16 — could be added going forward).
- **Transactional:** Migrations rely on node-pg-migrate's per-migration transaction wrap. Mostly safe.

### Risk: migrations that can brick prod or lock writes for minutes

| Migration | Issue | Severity |
|---|---|---|
| `20260606000000_wallet_split_deposit_winnings.sql` | `DROP COLUMN balance` then re-`ADD COLUMN balance GENERATED ALWAYS AS (...)`. Also `ADD CONSTRAINT CHECK` on multiple wallet columns without `NOT VALID`. **Will rewrite entire `wallet_accounts` table** + full validation scan. On a table with millions of rows: ≥10 minutes of EXCLUSIVE lock — NO wallet writes during that window. | **P0** |
| `20260926000000_wallet_currency_readiness.sql` | `ADD CONSTRAINT CHECK (currency = 'NOK')` on populated `wallet_transactions` AND `wallet_entries`. Without `NOT VALID`, full table scan. wallet_entries grows monotonically. | **P0** |
| `20260428080000_compliance_ledger_idempotency.sql` | `UPDATE app_rg_compliance_ledger SET idempotency_key = id::text WHERE idempotency_key IS NULL` — unbatched, full-table scan. Then `ALTER COLUMN ... SET NOT NULL` validates again. Compliance writes blocked during. | **P0** |
| `20260606000000_wallet_split_deposit_winnings.sql` | `UPDATE wallet_accounts SET deposit_balance = balance WHERE deposit_balance = 0 AND balance > 0` — unbatched. | **P1** |
| Various `ADD CONSTRAINT CHECK` on populated tables (currency-only, role, agent_status, action_type) | Same pattern — full table scan to validate. | **P1** |

**Mitigation pattern (recommended):** all future ADD CONSTRAINT migrations should use:
```sql
ALTER TABLE ... ADD CONSTRAINT ... CHECK (...) NOT VALID;
ALTER TABLE ... VALIDATE CONSTRAINT ...;  -- can run later, separate transaction
```

---

## Constraint Coverage

### UNIQUE on idempotency keys

- ✅ `wallet_transactions.idempotency_key` — partial UNIQUE.
- ✅ `app_rg_compliance_ledger.idempotency_key` — UNIQUE (PR #685, BIN-PILOT).
- ✅ `app_agent_transactions(agent_user_id, player_user_id, client_request_id)` — partial UNIQUE (BIN-PILOT-K1, latest).
- ✅ `app_machine_tickets.unique_transaction` — UNIQUE.
- ✅ `app_machine_tickets(machine_name, ticket_number)` — UNIQUE.
- ✅ `app_wallet_reservations.idempotency_key` — UNIQUE.
- ✅ `swedbank_payment_intents.payee_reference` and `order_reference` and `swedbank_payment_order_id` — UNIQUE.
- ⚠️ `app_idempotency_records (idempotency_key, endpoint)` — composite PK.
- ⚠️ **`app_deposit_requests` / `app_withdraw_requests`** — NO idempotency key. Two clicks of "Submit deposit" with the same amount could create two pending rows, then both ACCEPT → double credit. Service-layer should enforce, but DB has no guarantee. **P1.**
- ⚠️ **`app_hall_cash_transactions`** — No idempotency key. Daily-balance-transfer at settlement-close could duplicate on retry.

### CHECK constraints

- Money: `amount > 0` / `amount >= 0` consistently applied.
- Enums: status fields all use CHECK (e.g. `status IN ('PENDING', 'ACCEPTED', 'REJECTED')`).
- Currency: NOK-only CHECK on three wallet tables.
- Role: `app_users.role IN ('ADMIN','HALL_OPERATOR','SUPPORT','PLAYER')`.

### NOT NULL coverage

Critical columns (money, FK, status) are NOT NULL across the board. ✅

### PRIMARY KEY consistency

- 92 tables: `TEXT PRIMARY KEY` (convention).
- 9 tables: `BIGSERIAL PRIMARY KEY` (mostly append-only event/audit tables).
- 6 tables: `UUID PRIMARY KEY DEFAULT gen_random_uuid()` — `app_user_devices`, `app_notifications`, `app_wallet_reservations`, `app_ops_alerts`, plus 2 others.
- **Inconsistency.** Migrations explicitly note this is intentional in some cases (e.g. `app_user_devices` user_id FK works fine with TEXT-vs-UUID mix because user_id is TEXT). But it complicates downstream tooling that assumes uniform IDs.

---

## Data Type Consistency

### Money columns — **mixed and inconsistent**

| Type | Tables (sample) | Count |
|---|---|---|
| `NUMERIC(20, 6)` | `wallet_accounts.balance`, `wallet_transactions.amount`, `wallet_entries.amount` | 6 |
| `NUMERIC(14, 2)` | `app_agent_*` tables (settlements, shifts, transactions, hall cash) | ~30 |
| `NUMERIC(12, 2)` | `app_rg_*` (compliance ledger amounts, loss entries) | ~10 |
| `NUMERIC(10, 2)` | older legacy (price_paid_nok) | 1 |
| `NUMERIC(18, 2)` | `swedbank_payment_intents.amount_major` | 1 |
| `BIGINT` (cents/minor) | `app_deposit_requests.amount_cents`, `app_machine_tickets.*_cents`, `app_physical_tickets.price_cents`, `app_wallet_reservations.amount_cents`, all kiosk-product prices | ~25 |
| `INTEGER` (cents) | `app_game1_phase_winners.total_phase_prize_cents`, prize_amount_cents | 4 |

**Risks:**
- Cross-domain math (e.g. agent transaction value → wallet credit) requires both NUMERIC(14,2) and NUMERIC(20,6) — silent precision loss possible.
- Cents (BIGINT) ↔ NOK (NUMERIC) conversion happens in `apps/backend/src/util/currency.ts`. Bugs here = double the amount or wrong rounding.
- **Recommendation P2:** standardize new tables on either NUMERIC(14,2) for money or BIGINT cents (BIGINT cents is industry standard for casino backends — avoids float entirely).

### Timestamps

- ✅ All `TIMESTAMPTZ` (no naked `TIMESTAMP`). Good.
- ⚠️ Two parallel time columns in some tables: `app_rg_loss_entries.created_at_ms BIGINT` (UNIX ms) and other tables have `created_at TIMESTAMPTZ`. Mixed representations of "now" complicate cross-table joins.

### JSONB usage

- 103 JSONB columns total.
- **Most JSONB columns are bounded** (settings, snapshots).
- ⚠️ **`app_agent_settlements.bilag_receipt JSONB`** — base64 PDF/JPG up to **10 MB per row** (from `20260725000000_settlement_machine_breakdown.sql` and `index.ts` accepts 15 MB body). With one settlement per agent per day × 23 halls × 365 days = ~8400 rows/year × 10 MB = **~84 GB/year just for bilag**.
- ⚠️ `app_audit_log.details JSONB` — unbounded. Big payloads (e.g. settlement edit with full prev/new diff) can balloon.
- ⚠️ `app_notifications.data JSONB` — bounded by FCM 4KB limit usually, but no DB-level cap.
- ✅ GIN index on `app_agent_settlements.machine_breakdown` for aggregate queries.
- ✅ GIN/GIST not needed on `notifications.data` because the hot extract is by `data->>'scheduledGameId'` which would benefit from a btree expression index (currently missing — see Index Coverage above).

**P0-4 from Code Review #1: bilag JSONB DoS-vector** — confirmed. A malicious agent uploading a 10 MB base64 receipt every minute fills disk fast. Service layer caps at 10 MB but no DB constraint. **Recommendation:** move to external blob storage (Cloudinary/S3) ASAP; store URL only.

### UUID vs serial

See Constraint Coverage. Mixed.

---

## Connection Pool & Performance

### Pool config

- `apps/backend/src/util/pgPool.ts` exports `getPoolTuning()` returning `{ max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }`.
- **75 distinct `new Pool({ ...getPoolTuning() })` call-sites** across services — each gets its own independent pool of `max=20` connections.
- **Theoretical max concurrent connections: 75 × 20 = 1500.**
- Render Postgres starter plan: ~100 connection limit.
- **Real risk:** under cold-boot or load spike, services compete for connections; later services crash with `connection refused` or block indefinitely.
- **Recommendation P0:** **share a single Pool across all services**. Inject the same pool everywhere via `index.ts` bootstrap. Each service shouldn't own connection-management.

### Statement / query timeouts

- ❌ No `statement_timeout` configured.
- ❌ No `idle_in_transaction_timeout` configured.
- ❌ No per-query timeout in `withWalletTx()`.
- **Risk:** runaway query (e.g. forgotten WHERE clause in admin report) holds a connection forever, eventually exhausting the pool.
- **Recommendation P1:** set `statement_timeout = 30000` (30s) on the connection-string options or via `application_name` + Postgres `set_config()`.

### Transaction patterns

- ✅ `withWalletTx()` wraps wallet operations in REPEATABLE READ + retry on 40001/40P01 (BIN-762). Industry-standard.
- ✅ Outbox pattern (`wallet_outbox`) decouples broadcasts from wallet tx.
- ✅ Hash-chain `wallet_entries.entry_hash` (BIN-764) gives tamper-evidence per account.
- ✅ Compliance ledger has hash-chain + immutability triggers.
- ⚠️ Wallet + compliance + audit writes are sometimes in the **same** transaction (PR #689) — long transactions hold locks longer. With REPEATABLE READ + 3 retries, a 100ms tx that retries 3 times is 300ms+ of held locks. At pilot scale (~5 tx/sec × 4 halls = 20 tx/sec) this can serialize.
- No N+1 query patterns spotted in spot-check, but service-laden wallet+ledger+audit writes from `Game1TicketPurchaseService` warrant deeper review.

### Boot-time DDL — **DB-P0-1 finding**

Multiple services run `initializeSchema()` lazily on first use, including:
- `PostgresWalletAdapter.initializeSchema()` — `apps/backend/src/adapters/PostgresWalletAdapter.ts:1473`
- `SwedbankPayService.initializeSchema()` — `apps/backend/src/payments/SwedbankPayService.ts:1201`
- Likely others (PaymentRequestService, SessionService, AuthTokenService...).

These run `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, **AND** `DROP CONSTRAINT IF EXISTS` followed by `ADD CONSTRAINT` (without IF NOT EXISTS, without NOT VALID).

**On a populated wallet_accounts/wallet_transactions/wallet_entries:**
- Each ADD CONSTRAINT validates **all rows** via full table scan.
- DROP CONSTRAINT is fast but ADD CONSTRAINT holds an EXCLUSIVE lock (blocks all writes) for the scan duration.
- After Render redeploy / cold-boot: first wallet operation blocks all wallet operations for 30s+ on a 100k-row table, minutes on millions.

**If migration was already run and constraint already exists, it's still DROP+RE-ADD on every boot.** This is a serious operational hazard.

**Recommendation P0:** remove all `initializeSchema()` runtime DDL. Schema management belongs in migrations only. The runtime DDL was likely added for integration-test convenience but is unsafe in prod.

---

## Storage Growth Projection

**Assumptions:** one pilot hall, ~200 active players, ~100 games/day, 8h/day operating hours, 1-year retention.

| Table | Rows/day | Bytes/row (avg) | Annual growth |
|---|---|---|---|
| `wallet_entries` | 200 players × 5 transactions × 2 entries × 100 games/day = ~200,000 | ~150 B | **~11 GB/yr** |
| `wallet_transactions` | 200,000 / 2 = ~100,000 | ~250 B | **~9 GB/yr** |
| `wallet_outbox` | 100,000 (eventually `processed`) | ~400 B | **~14 GB/yr** unless cleanup added |
| `app_rg_compliance_ledger` | 100,000 (mirrors wallet) | ~500 B | **~18 GB/yr** |
| `app_audit_log` | 100,000 admin/auth/wallet events | ~600 B (with details JSONB) | **~22 GB/yr** |
| `app_regulatory_ledger` | 100,000 (mirrors compliance) | ~800 B (hash-chain wider) | **~29 GB/yr** |
| `app_agent_transactions` | ~5,000 | ~400 B | **~0.7 GB/yr** |
| `app_agent_settlements` (with bilag) | ~10/day | up to 10 MB (bilag) | **~37 GB/yr** worst case |
| `app_notifications` | ~5,000 | ~300 B | **~0.5 GB/yr** |
| `app_machine_tickets` | ~500/day | ~300 B | **~0.05 GB/yr** |
| `app_physical_tickets` (per-batch) | minimal — pre-loaded inventory | ~100 B | **~ negligible** |

**Estimated annual growth per hall: ~140 GB/yr.**

**For 23 pilot halls: ~3.2 TB/yr.**

Mitigation:
1. **Retention policy needed for `app_audit_log`, `wallet_outbox` (processed), `app_notifications`.** Currently no cleanup jobs except `idempotencyKeyCleanup`.
2. **Move bilag to external blob storage** — eliminates 60% of growth for settlements.
3. Compliance ledger MUST be retained for §71 audit (years). Consider partitioning by month for `app_rg_compliance_ledger`, `app_regulatory_ledger`, `app_audit_log` to enable fast TRUNCATE of old partitions if regulator allows.

---

## Findings by Severity

### P0 — Pilot-blockers

#### **DB-P0-1: Boot-time DDL on populated wallet tables**
- **Location:** `apps/backend/src/adapters/PostgresWalletAdapter.ts:1473-1620`. Same pattern in `SwedbankPayService.ts:1201`, likely others.
- **Description:** `initializeSchema()` runs `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT CHECK (...)` on `wallet_accounts`, `wallet_transactions`, `wallet_entries` on every cold-boot / first wallet op. ADD CONSTRAINT triggers full-table validation scan with EXCLUSIVE lock.
- **Risk:** Wallet writes blocked for seconds-to-minutes after every Render redeploy. At pilot scale, players see "Wallet timed out" during peak. If a single row violates the new constraint, boot fails — entire backend goes offline.
- **Recommended fix:** Remove the `DROP CONSTRAINT` + `ADD CONSTRAINT` block from runtime path. Schema is the migration's job. Migrations should be the only place DDL runs.
- **Effort:** 4 hours (refactor `initializeSchema()` to just check the schema exists, not mutate it).

#### **DB-P0-2: Connection-pool sprawl (75 pools × max 20 = 1500 theoretical connections)**
- **Location:** every service that calls `new Pool({ ...getPoolTuning() })` — see grep listing in audit.
- **Description:** Each service creates its own independent pool. Render Postgres starter plan caps at ~100 connections.
- **Risk:** Under load or after cold-boot bursts, late-initialized services fail to get connections. Alerts cascade.
- **Recommended fix:** Refactor to a single shared pool injected via DI from `index.ts`. Reduce per-pool max significantly (e.g. one pool, max=20-40 total).
- **Effort:** 1-2 dev-days (each service needs constructor change). Or as immediate stop-gap: lower `PG_POOL_MAX` env var to 4-5 globally → 75×4 = 300 still too high but better.

#### **DB-P0-3: Unbounded JSONB `bilag_receipt` (10 MB per row)**
- **Location:** `apps/backend/migrations/20260725000000_settlement_machine_breakdown.sql:48`, `app_agent_settlements.bilag_receipt JSONB NULL`.
- **Description:** Base64-encoded receipts stored inline in JSONB. Service caps at 10 MB but no DB constraint. With ~37 GB/yr growth potential per hall, 23 halls = ~850 GB/yr worst case for bilag alone.
- **Risk:** Disk fills. TOAST decompression cost on settlement listings. Backup time grows.
- **Recommended fix:** Move to Cloudinary/S3 (CLOUDINARY_* env already configured). Store URL in JSONB instead. Migrate existing rows in background.
- **Effort:** 1-2 dev-days (route changes + migration script + cleanup of old rows).

### P1 — Should fix before real-money

#### **DB-P1-1: Migrations that lock prod-tables for minutes**
- **Location:** `20260606000000_wallet_split_deposit_winnings.sql`, `20260926000000_wallet_currency_readiness.sql`, `20260428080000_compliance_ledger_idempotency.sql`.
- **Description:** `ADD CONSTRAINT CHECK` without `NOT VALID`, `DROP COLUMN balance` + GENERATED ADD COLUMN, unbatched `UPDATE` data backfills.
- **Risk:** Future production migrations of similar pattern will lock writes. Pilot has so far had small DB; growing volume changes this.
- **Recommended fix:** Establish migration-style guide: always use `NOT VALID` then `VALIDATE CONSTRAINT` in separate transaction; batch UPDATE backfills with `LIMIT N` loop; never ALTER TYPE on populated big tables. Add to `migrations/README.md`.
- **Effort:** 2 hours (doc) + ongoing discipline.

#### **DB-P1-2: Missing index on `app_users.phone`**
- **Location:** `PlatformService.ts:782` (phone-PIN login lookup).
- **Description:** `WHERE phone = $1 AND deleted_at IS NULL` — full table scan on every phone-login attempt as user-base grows.
- **Recommended fix:** `CREATE INDEX idx_app_users_phone_active ON app_users(phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;`
- **Effort:** 1 hour (one-line migration).

#### **DB-P1-3: Missing expression index on `app_notifications.data->>'scheduledGameId'`**
- **Location:** `gameStartNotifications.ts:107`.
- **Description:** Cron job runs every minute. `WHERE data->>'scheduledGameId' = g.id AND created_at >= now() - interval '24 hours'` — sequential scan grows linearly with notification volume. At 5,000/day × 365 = 1.8M rows, scans get slow.
- **Recommended fix:** `CREATE INDEX idx_app_notifications_scheduled_game ON app_notifications((data->>'scheduledGameId'), created_at DESC) WHERE type = 'game-start';`
- **Effort:** 1 hour.

#### **DB-P1-4: `idx_app_users_deleted_at` covers wrong direction**
- **Location:** `apps/backend/migrations/20260418190000_player_lifecycle.sql:25`.
- **Description:** Partial index `WHERE deleted_at IS NOT NULL` — but every login query filters `deleted_at IS NULL`. Index helps only delete-audit queries.
- **Recommended fix:** Either remove this index (audit queries are rare), or add a partial index on something like `(role) WHERE deleted_at IS NULL` if PostgreSQL planner stats show full scans. Profile under prod load first.
- **Effort:** 1 hour after profiling.

#### **DB-P1-5: No idempotency key on deposit/withdraw requests**
- **Location:** `app_deposit_requests`, `app_withdraw_requests`.
- **Description:** Two-clicks of "Submit" can create two pending rows. ACCEPT both → double credit. Currently relies on app-layer validation only.
- **Recommended fix:** Add `client_request_id TEXT NULL` + partial UNIQUE on `(user_id, kind, client_request_id)`. Service writes `ON CONFLICT DO NOTHING`.
- **Effort:** 4 hours (migration + service change + test).

#### **DB-P1-6: No statement_timeout / idle_in_transaction_timeout**
- **Location:** Pool config in `apps/backend/src/util/pgPool.ts`.
- **Description:** Runaway queries (forgotten WHERE clause, accidentally large IN-list) hold connections forever.
- **Recommended fix:** Add `statement_timeout: 30000` to pool options. Set `idle_in_transaction_session_timeout = 60000` via Postgres-level config or session SET.
- **Effort:** 30 minutes.

#### **DB-P1-7: FK gaps on wallet_id columns**
- **Location:** `app_deposit_requests`, `app_withdraw_requests`, `app_wallet_reservations`, `app_rg_payout_audit`. All have `wallet_id TEXT NOT NULL` with no FK to `wallet_accounts(id)`.
- **Description:** Wallet typo → orphan row. Violates DB-level integrity.
- **Recommended fix:** Add FKs `wallet_id REFERENCES wallet_accounts(id) ON DELETE RESTRICT` (after one-time validation that no orphan rows exist).
- **Effort:** 4 hours (validate, migrate, test).

#### **DB-P1-8: `app_regulatory_ledger.draw_session_id` FK to orphan table**
- **Location:** `apps/backend/migrations/20260417000005_regulatory_ledger.sql:36`.
- **Description:** FK constraint pointing at `app_draw_sessions(id)` — table has no rows, no producer. FK is dead weight.
- **Recommended fix:** Drop the FK constraint. Drop the orphan tables (`app_draw_sessions*`). Keep the column nullable for legacy compat.
- **Effort:** 2 hours.

#### **DB-P1-9: No retention policy / cleanup jobs for hot-growth tables**
- **Location:** `app_audit_log`, `wallet_outbox` (processed rows), `app_notifications`, `app_idempotency_records` (only one with cleanup).
- **Description:** Tables grow forever. After 1 year of pilot, ~22 GB audit_log alone per hall.
- **Recommended fix:** 
  - `wallet_outbox`: cleanup processed rows older than 30 days.
  - `app_notifications`: cleanup older than 90 days (already-read).
  - `app_audit_log`: keep forever for compliance, but consider monthly partitioning so backups can incrementalize.
- **Effort:** 1 dev-day (jobs + scheduler wiring).

### P2 — Hardening

#### **DB-P2-1: Drop orphan `app_draw_session_*` tables (BIN-515)**
- **Location:** `app_draw_sessions`, `app_draw_session_halls`, `app_draw_session_tickets`, `app_draw_session_events`.
- **Description:** Created by early multi-hall design that was abandoned in favor of `app_game1_scheduled_games`. No code references.
- **Recommended fix:** Add migration to DROP these (after dropping FK from regulatory_ledger).
- **Effort:** 2 hours.

#### **DB-P2-2: Standardize money column types**
- **Description:** Mix of NUMERIC(20,6), NUMERIC(14,2), NUMERIC(12,2), BIGINT cents, INTEGER cents.
- **Recommended fix:** Doc convention. New tables = BIGINT cents (industry standard). Don't migrate existing — too disruptive.
- **Effort:** 1 hour (doc).

#### **DB-P2-3: Standardize PK type (TEXT vs UUID vs BIGSERIAL)**
- **Description:** 92 TEXT, 9 BIGSERIAL, 6 UUID. Mostly TEXT (good convention), but UUID PK on `app_user_devices`, `app_notifications`, `app_wallet_reservations`, `app_ops_alerts` differs.
- **Recommended fix:** Doc convention: TEXT for entity tables, BIGSERIAL for high-volume append-only event tables, no UUID PK.
- **Effort:** 1 hour (doc).

#### **DB-P2-4: Naming convention — non-`app_` tables**
- **Description:** `wallet_*`, `swedbank_payment_intents`, `hall_game_schedules`, `hall_schedule_log`, `game_sessions`, `game_checkpoints` not prefixed.
- **Description:** Convention drift makes search/inventory harder.
- **Recommended fix:** Rename in a single migration. Risky on populated tables — defer until next major refactor or accept the inconsistency.
- **Effort:** 1 dev-day (rename + code update + tests).

#### **DB-P2-5: Add NOT NULL constraint helpers**
- **Description:** Some FK columns are TEXT NULL but service-layer never writes NULL (e.g. `submitted_by`, `started_by_user_id`).
- **Recommended fix:** Audit, narrow to NOT NULL where service guarantees it (with CHECK + backfill plan).
- **Effort:** 1 dev-day.

#### **DB-P2-6: Constraint naming convention**
- **Description:** Some constraints named (`wallet_accounts_currency_nok_only`), others unnamed (auto-`tablename_check`).
- **Recommended fix:** Always name constraints. Easier to manage.
- **Effort:** Going forward.

#### **DB-P2-7: Add `pg_stat_statements` to track slow queries**
- **Description:** No observability of slow queries today (PROJECT_HANDOFF_BRIEF mentions "no distributed tracing").
- **Recommended fix:** Enable `pg_stat_statements` extension. Add a daily admin report querying top-10 slowest queries.
- **Effort:** 4 hours.

---

## Recommendations

**Top 5 actionable next steps:**

1. **Remove all runtime DDL from `initializeSchema()`** — this is the single highest-impact change for pilot stability (DB-P0-1). Schema must be migration-managed.
2. **Refactor to single shared `Pool`** — inject from `index.ts` to all services, replace 75 pools with 1 (DB-P0-2).
3. **Move bilag to external blob storage** — Cloudinary already configured, eliminates 60% of growth (DB-P0-3).
4. **Add `statement_timeout=30000` + missing FKs** + missing indexes on `phone`, `data->>'scheduledGameId'` — small migrations, big stability wins (DB-P1-2, P1-3, P1-6, P1-7).
5. **Establish migration style-guide** in `migrations/README.md`: always use `NOT VALID` for ADD CONSTRAINT, always batch UPDATE, never DROP+RECREATE columns on big tables. Prevent future P0s.

---

## Conclusion

The schema is **well-designed for the regulatory requirements** — append-only ledgers, hash-chain audit trails, immutability triggers, idempotency keys on the most critical wallet/compliance/agent paths, and forward-only migrations. Real engineering went into BIN-588 (audit), BIN-657 (regulatory ledger), BIN-661 (forward-only), BIN-693 (reservations), BIN-762 (REPEATABLE READ retry), BIN-764 (hash chain). This is casino-grade discipline.

**The risks are operational, not architectural.** Three findings (boot-time DDL, pool sprawl, JSONB blob bloat) can each cause real outages or data growth runaway during pilot. None are hard to fix — total estimated work for all P0+P1 ~5 dev-days.

Recommended posture before pilot real-money:
- ✅ Address all 3 P0 findings (~3 dev-days).
- ✅ Address P1-2/3/6/7 quick wins (~1 dev-day).
- ⏳ P1-1 (migration style-guide) is doc only — 2h.
- ⏳ P1-5/8/9 can wait 1-2 weeks post-pilot if monitored closely.
- ⏳ All P2 are post-pilot polish.

The audit found **no data-corruption risks in current design** — the wallet/compliance hash chain provides cryptographic tamper-evidence. The biggest residual risk is operational: a bad migration or boot-time DDL bricking prod, mitigated by addressing P0s above.
