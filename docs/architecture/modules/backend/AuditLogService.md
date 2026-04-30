# AuditLogService

**File:** `apps/backend/src/compliance/AuditLogService.ts` (442 LOC)
**Owner-area:** compliance
**Last reviewed:** 2026-04-30

## Purpose

Append-only, PII-redacted audit trail for every actor-initiated state change in the system (BIN-588). Replaces legacy `console.log` + scattered per-controller writes with a single immutable store keyed by `(actorType, actorId, action, resource, resourceId)` plus an optional `details` object that is auto-redacted at write time.

Two implementations behind one `AuditLogStore` interface: `PostgresAuditLogStore` (production, fire-and-forget — never blocks the domain operation on a DB outage) and `InMemoryAuditLogStore` (tests + when `APP_PG_CONNECTION_STRING` is unset). The `AuditLogService` facade is the only thing the rest of the backend touches; stores are wired at boot.

This is the §11 / §71 spor: every wallet-mutating action, every KYC moderator decision, every admin role change, every player profile edit lands here with a stable dotted action verb (`player.kyc.approve`, `wallet.payment_request.accept`, etc.).

## Public API

```ts
// Service facade (the public surface)
class AuditLogService {
  constructor(store: AuditLogStore)
  record(input: AuditLogInput): Promise<void>
  list(filter?: AuditListFilter): Promise<PersistedAuditEvent[]>
  listLoginHistory(filter: LoginHistoryFilter): Promise<PersistedAuditEvent[]>  // BIN-629
}

// Store interface (Postgres + InMemory implementations)
interface AuditLogStore {
  append(input: AuditLogInput): Promise<void>
  list(filter?: AuditListFilter): Promise<PersistedAuditEvent[]>
  listLoginHistory(filter: LoginHistoryFilter): Promise<PersistedAuditEvent[]>
}

// Standalone redaction helper (exported for unit tests + edge callers)
redactDetails(input: unknown): Record<string, unknown>
```

`AuditLogInput`:
- `actorId: string | null` — wallet-id or admin-user-id (null for SYSTEM)
- `actorType: AuditActorType` — `USER | ADMIN | HALL_OPERATOR | SUPPORT | PLAYER | SYSTEM | EXTERNAL | AGENT`
- `action: string` — stable dotted verb (`player.kyc.approve`)
- `resource: string` — entity kind (`user`, `hall`, `wallet`, `payment_request`)
- `resourceId: string | null`
- `details?: Record<string, unknown>` — auto-redacted
- `ipAddress? / userAgent?` — request metadata

## Dependencies

**Calls (downstream):**
- `pg.Pool` (Postgres impl) — INSERT into `app_audit_log`
- `pino` logger — fire-and-forget warning when DB write fails
- `redactValue` recursion (max depth 10) — replaces sensitive keys with `[REDACTED]`

**Called by (upstream — non-exhaustive — every regulated mutation in the codebase):**
- `PlatformService` — KYC approve/reject/override, role changes, profile updates, GDPR self-delete, Excel-import audit
- `Game1TicketPurchaseService` — buyin events
- `Game1PayoutService` — payout events
- `Game1MiniGameOrchestrator` + `MiniGameOddsenEngine` — mini-game payouts and oddsen results
- `PotEvaluator` + `Game1DrawEnginePotEvaluator` + `Game1DrawEngineDailyJackpot` — pot accumulation events
- `payments/SwedbankPayService` — payment-intent transitions
- `ProfileSettingsService` (compliance) — profile-block/unblock
- `Spill1StopVoteService` — player stop-vote events
- `routes/agentDashboard.ts` + `routes/adminAgentPermissions.ts` + agent shift / settlement / Metronia / OK Bingo paths
- `LoginHistoryService` (admin) — reads via `listLoginHistory`
- `AmlService` — anti-money-laundering flag events
- `ports/AuditPort.ts` — narrow port re-exposed to game-domain callers (`game/...`) so they don't depend on the compliance subtree

## Invariants

- **Append-only.** No update or delete API exposed. The Postgres table has no `UPDATE` privilege in production roles; INSERT-only.
- **Fire-and-forget on write failure.** A failing INSERT logs `module=audit-log` warn (line 230-238) and returns successfully. Rationale: the domain operation must never be blocked by an audit-store outage. The structured logger (pino) still captures intent so ops can reconcile after recovery. Mirrors `ChatMessageStore` policy (BIN-516).
- **PII redaction at write-time.** `redactDetails` runs in `normaliseInput` before the row is built. Redacted keys (`REDACT_KEYS`, line 101-117): `password`, `token`, `accesstoken`, `refreshtoken`, `sessiontoken`, `secret`, `nationalid`, `ssn`, `personnummer`, `fodselsnummer`, `cardnumber`, `cvv`, `cvc`, `pan`, `authorization`. Mirrors the pino redaction list in `util/logger.ts`.
- **Recursion-bounded.** `redactValue` caps at depth 10 → returns `"[TOO_DEEP]"` to prevent runaway cycles. Functions, symbols, bigint are dropped (replaced with `null`). Strings/numbers/booleans pass through.
- **Empty `action` or `resource` is rejected.** `normaliseInput` throws `Error` (not DomainError — this is a programming bug, not user input). Caller receives a 500 + the error logs at warn.
- **Action-naming convention is stable dotted verbs.** Examples used in production: `auth.login`, `auth.login.failed`, `player.kyc.approve`, `player.kyc.reject`, `player.kyc.resubmit`, `player.kyc.override`, `player.profile.update`, `account.self_delete`, `user.role.change`, `user.hall.assign`, `wallet.payment_request.accept`, `wallet.payment_request.reject`. New actions should follow `<resource>.<verb>[.qualifier]`. Resource is the entity kind (singular, lowercase).
- **`listLoginHistory` (BIN-629) is narrow.** Pinned to `actorId` + `resource='session'` + `action LIKE 'auth.login%'` so an admin reading a player's login history cannot accidentally widen the query to other resources. Both Postgres and InMemory impls enforce identically.
- **List queries are bounded.** Default 100, max 1000 for `list`; max 500 for `listLoginHistory`. Schema name is sanitised (`replace(/[^a-zA-Z0-9_]/g, "")`) to prevent injection through the schema option.
- **Newest-first ordering.** `ORDER BY created_at DESC, id DESC` — secondary `id DESC` breaks ties when many events land in the same millisecond (e.g. bulk-import emit).

## Test coverage

`apps/backend/src/compliance/AuditLogService.test.ts`:
- **Redaction:** `redactDetails: replaces password/token/ssn values with [REDACTED]`, "redaction is case-insensitive on keys", "recurses into nested objects and arrays", "caps recursion depth", "handles null/undefined input gracefully"
- **Service round-trip:** `record + list round-trips an event with redacted details`, "empty details default to {}", "filters by actorId, resource, resourceId, action, since", "list returns most-recent first", "rejects empty action / resource", "returned details are a copy — mutating doesn't affect store"
- **Postgres:** "append issues a parameterised INSERT with redacted JSON details", "append swallows query errors (fire-and-forget)", "list builds WHERE clauses dynamically", "list returns [] on query error instead of throwing", "list schema is sanitised (no injection via schema option)"
- **BIN-629 login-history:** "in-memory: listLoginHistory filters to auth.login* for actor + session resource", "in-memory: listLoginHistory honours offset + limit"

## Operational notes

**Common production failures:**
- Audit DB write fails: warning emitted with `module=audit-log`. The domain op succeeds. To verify backfill is needed, grep pino logs for `BIN-588 audit append failed` over the outage window — every line should have a corresponding row when DB recovers (with current fire-and-forget design, IT WON'T be backfilled automatically — ops must replay from logs if needed).
- Audit table fills disk: rotate by retention. Pengespillforskriften minimums: 5 years for compliance-relevant rows (KYC, wallet, payment, regulatory). Most other rows can be moved to cold storage after 1 year.
- "Audit row missing" complaint from compliance reviewer: check pino logs for the operation — if the structured log shows the action, but `app_audit_log` doesn't, the DB write failed and was warned. Fire-and-forget is design intent.
- `Error: [BIN-588] audit: action is required`: programming bug. Find the call site (the pino log carries call-site details).
- Oversized `details` blob: there is no hard cap. If you see slow inserts on the audit table, suspect a caller is dumping a large payload. Add a size guard in `normaliseInput` or trim at the call site.

## Recent significant changes

- **#279** (BIN-629) — narrow `listLoginHistory` API for admin player login-history endpoint
- **#195** (BIN-583 B3.1) — agent auth + shift integrations write extensively via this service
- **#172** (BIN-588) — initial implementation, replacing scattered per-controller writes

## Refactor status

Stable. `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` notes:
- Add a size cap on `details` JSON to prevent accidentally-huge rows.
- Consider a "missed audits" reconciliation job that reads pino warnings about failed appends and offers ops-tooling to replay.
- Promote `ports/AuditPort.ts` to be the only interface non-compliance code depends on — currently some game-domain callers import the concrete service class.
