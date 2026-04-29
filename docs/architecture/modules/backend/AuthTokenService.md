# AuthTokenService

**File:** `apps/backend/src/auth/AuthTokenService.ts` (262 LOC)
**Owner-area:** auth
**Last reviewed:** 2026-04-30

## Purpose

Single-use, opaque token service for password-reset and email-verify flows (BIN-587 B2.1). Plaintext tokens are generated once at issuance, returned to the caller (who emails them out), and only their SHA-256 hash is persisted. Validation is hash-based and consume is idempotent: a second `consume()` on the same token-id throws `TOKEN_ALREADY_USED`.

Token kinds: `password-reset` (default 1 h TTL) and `email-verify` (default 48 h TTL). Each kind has a separate table (`app_password_reset_tokens` / `app_email_verify_tokens`). Per-call TTL override supports onboarding flows like Excel-import welcome emails (7-day links).

## Public API

```ts
constructor(options: AuthTokenServiceOptions)

// Issuance (returns plaintext + expiry; plaintext never re-readable)
createToken(
  kind: "password-reset" | "email-verify",
  userId: string,
  options?: { ttlMs?: number }
): Promise<{ token: string; expiresAt: string }>

// Validation (does not consume — call before showing reset-form)
validate(
  kind: "password-reset" | "email-verify",
  token: string
): Promise<{ userId: string; tokenId: string }>
//   throws DomainError("INVALID_TOKEN")          — unknown / blank
//   throws DomainError("TOKEN_ALREADY_USED")     — used_at not null
//   throws DomainError("TOKEN_EXPIRED")          — expires_at past

// Consume (mark used; idempotent — second call fails)
consume(kind, tokenId: string): Promise<void>
//   throws DomainError("TOKEN_ALREADY_USED")     — re-consume

// Test-hook
static forTesting(pool: Pool, schema?, ttlMs?): AuthTokenService
```

## Dependencies

**Calls (downstream):**
- `pg.Pool` — DB writes/reads (shared via DB-P0-002 since #715)
- `node:crypto` — `randomUUID` for token-id, `randomBytes(32).toString("base64url")` for opaque token, `createHash("sha256")` for stored hash
- `DomainError` (`errors/DomainError.ts`) — typed error codes consumed by REST layer

**Called by (upstream):**
- `routes/auth.ts` (`/api/auth/forgot-password`, `/api/auth/reset-password/:token`, `/api/auth/verify-email/:token`) — primary surface
- `routes/adminPlayers.ts` — admin-triggered password-reset link (BIN-702 follow-up)
- `routes/adminUsers.ts` — admin-bootstrap + password-reset flows
- `PlatformService.bulkImportPlayers` — `createToken("password-reset", id, { ttlMs: 7 days })` for Excel-import welcome (PR #488)
- `auth/UserPinService` — uses the same store for OTP-style 6-digit numeric reset tokens (PIN reset, REQ-130)
- `index.ts` — wires the singleton into the app context

## Invariants

- **Plaintext is never persisted.** `createToken` generates 32 random bytes (`base64url` encoded → 43 chars) and stores only `sha256(plaintext)`. The plaintext is returned exactly once from `createToken` and is never recoverable from the DB.
- **Single-use semantics.** `validate` checks `used_at IS NULL`; `consume` is `UPDATE ... SET used_at=now() WHERE id=$1 AND used_at IS NULL`. If `rowCount=0` we throw `TOKEN_ALREADY_USED`. There is no "rehash" or revival path — once consumed the token is permanently dead.
- **Atomic re-issue invalidates older tokens.** `createToken` runs `UPDATE ... SET used_at=now() WHERE user_id=$1 AND used_at IS NULL` inside the same tx as the new INSERT (`AuthTokenService.ts:140-151`). Result: a newly-emailed reset link kills any older pending link for that user, eliminating the "two valid links in inbox" foot-gun.
- **TTL is enforced at validate-time.** No background cleanup is required for correctness — expired rows simply fail `validate`. Operations may run periodic delete to bound table size, but it is not load-bearing.
- **No partial trust.** `validate` returns `userId` only when the token is active **and** unused **and** unexpired. Callers should `consume` immediately after their effect (e.g. password-set), accepting the documented trade-off: if the password-set fails after consume, the token is dead. This is the same atomicity model as one-shot OAuth-codes.
- **Transactional creation.** `createToken` wraps `BEGIN/INSERT/COMMIT` so a partial schema failure rolls back, never leaving an orphan UPDATE-of-old-tokens-without-INSERT-of-new.
- **Schema-name validation.** `assertSchemaName` rejects anything outside `[a-zA-Z_][a-zA-Z0-9_]*` to prevent SQL injection through the schema option (defence-in-depth — schema is config-only).
- **Per-call TTL override is bounded.** `ttlMs` must be finite and positive (`AuthTokenService.ts:124`). Used by Excel-import welcome (7-day TTL) and could be used for "remember device" tokens; max value is currently un-bounded but should pair with a future caller-side guard.

## Test coverage

`apps/backend/src/auth/__tests__/AuthTokenService.test.ts` exercises the service against a hand-rolled in-memory `pg.Pool` stub:
- "createToken + validate + consume happy-path (password-reset)" — round-trip
- "email-verify uses separate table" — table-name segregation
- "re-issue ugyldiggjør tidligere aktive tokens" — atomic UPDATE-then-INSERT
- "utløpt token avvises" — TTL boundary
- "ukjent token gir INVALID_TOKEN"
- "tomt userId avvises" / "tomt token avvises i validate" — input guards
- "consume er idempotent — andre kall feiler" — single-use invariant
- "tokens lagres aldri i klartekst (kun sha256-hash)" — column inspection
- "BIN-702 follow-up: createToken aksepterer ttlMs-override" — Excel-import welcome path
- "BIN-702 follow-up: createToken med ttlMs=0 eller negativ avvises" — input guard
- "BIN-702 follow-up: createToken uten ttlMs-override bruker konstruktor-TTL"

Pool-stub covers the SQL surface end-to-end so behavioural changes do not need a live Postgres in CI.

## Operational notes

**Common production failures:**
- `INVALID_TOKEN` floods: the token in the URL is malformed or unknown. Almost always a mail-client mangling base64url chars. Search for `module=auth-token-service` warnings; if absent, the link never reached `validate`.
- `TOKEN_EXPIRED` floods: user clicked an old link. Default TTL is 1 h for password-reset — if more than the expected fraction expires, consider lengthening the default for the kind affected (NOT per-call from the route).
- `TOKEN_CREATE_FAILED`: a `BEGIN/COMMIT` rolled back. Logged at `error` level with `module=auth-token-service` (line 155). Re-check Pool health and `app_password_reset_tokens` schema.
- `PLATFORM_DB_ERROR` from `initializeSchema`: should only fire on first boot if the migration that creates these tables didn't run. Boot-DDL (#715) recreates them defensively but production should always have the proper migration applied.
- Two valid reset links in inbox: should be impossible thanks to the atomic re-issue invalidation. If reported, verify the `UPDATE ... SET used_at=now()` SQL is intact and the surrounding tx didn't get split.

## Recent significant changes

- **#715** (DB-P0-002, 2026-04) — pool consolidation; service accepts a shared pool
- **#488** (BIN-702 follow-up) — Excel-import password-reset link with 7-day per-call TTL override + audit-log integration
- **#717** — DomainError moved to shared module
- **#181** (BIN-587 B2.1) — initial implementation: auth/account basics

## Refactor status

Mostly stable. `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` notes:
- Add a periodic cleanup job to bound table growth (not load-bearing for correctness, but a long-running prod will accumulate millions of expired rows over years).
- Consider extracting the SHA-256 + base64url helpers into a shared `auth/util.ts` since `TwoFactorService` and `SessionService` carry near-identical copies.
