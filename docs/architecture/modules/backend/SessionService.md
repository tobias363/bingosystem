# SessionService

**File:** `apps/backend/src/auth/SessionService.ts` (303 LOC)
**Owner-area:** auth
**Last reviewed:** 2026-04-30

## Purpose

Session lifecycle helpers added in REQ-132: list active sessions for a user, log out a specific session, log out all (with optional `except`), record device user-agent + IP at login, and enforce a 30-minute inactivity timeout. Sessions themselves are owned by `PlatformService.createSession` (private — token issuance, hash, expiry); this service is the read/admin surface on top of `app_sessions`.

The 30-min timeout fires implicitly on the next `touchActivity` call from the auth-middleware: if `now - last_activity_at >= inactivityTimeoutMs`, the session is revoked and `SESSION_TIMED_OUT` is thrown. `touchActivity` is throttled — DB writes only happen when ≥ 60 s passed since the last update — so per-request overhead is negligible.

## Public API

```ts
constructor(options: SessionServiceOptions)

// Login-time hook (after PlatformService.createSession)
recordLogin(input: { accessToken: string; userAgent: string | null; ipAddress: string | null }): Promise<void>

// Per-request hook (auth-middleware)
touchActivity(accessToken: string): Promise<void>
//   throws DomainError("SESSION_TIMED_OUT") when idle >= inactivityTimeoutMs

// Read
listActiveSessions(input: { userId: string; currentAccessToken?: string | null }): Promise<ActiveSession[]>

// Mutations
logoutSession(input: { userId: string; sessionId: string }): Promise<void>
//   throws DomainError("SESSION_NOT_FOUND") on missing or already-revoked
logoutAll(input: { userId: string; exceptAccessToken?: string | null }): Promise<{ count: number }>

// Lifecycle
close(): Promise<void>          // closes pool when constructor created its own
static forTesting(pool, schema?, inactivityTimeoutMs?): SessionService
```

`ActiveSession` includes `id, userId, deviceUserAgent, ipAddress, lastActivityAt, createdAt, expiresAt, isCurrent` — `isCurrent` is set when the listing call passes `currentAccessToken` matching that row's `token_hash`.

## Dependencies

**Calls (downstream):**
- `pg.Pool` — DB writes/reads (shared via DB-P0-002)
- `node:crypto.createHash` — token hashing for lookups
- `DomainError` — typed error codes

**Called by (upstream):**
- `routes/auth.ts` — `/api/auth/sessions` (list), `/api/auth/sessions/:id/logout` (single), `/api/auth/sessions/logout-all` (all)
- `routes/auth.ts` — `recordLogin` invoked after every successful `/api/auth/login` (and `login-phone`, 2FA-completed login)
- auth-middleware (`middleware/auth.ts`) — `touchActivity` runs on every authenticated request before the handler executes
- `index.ts` — wires the singleton into the app context

## Invariants

- **Token never stored or logged in plaintext.** Every public method accepts plaintext access-tokens and immediately hashes (`hashToken` = `sha256(token)`) before any DB query. The `app_sessions.token_hash` column is the only stored form. Mirrors `AuthTokenService` and `TwoFactorService` patterns.
- **Active = `revoked_at IS NULL` AND `expires_at > now()`.** `listActiveSessions` enforces both. Inactivity-timeout-revoked rows have `revoked_at` set, so they correctly drop out.
- **Inactivity timeout is enforced lazily.** `touchActivity` does the check; there is no background sweeper. Acceptable because every authenticated request runs through middleware → `touchActivity`. A session inactive for hours simply revokes itself the next time the user tries to use it.
- **`touchActivity` is no-op on missing/revoked.** Avoids surfacing 401 `SESSION_TIMED_OUT` when the row is gone for unrelated reasons (e.g. forced logout from admin); `getUserFromAccessToken` will throw `UNAUTHORIZED` when the request actually tries to authenticate.
- **Throttle = 60 s.** DB UPDATE only when `idleMs >= TOUCH_THROTTLE_MS`. Reduces per-request DB load to a single SELECT for hot users.
- **Ownership check on logoutSession.** `WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL` ensures a user cannot revoke another user's session by guessing the id. Returns `SESSION_NOT_FOUND` on no-match, including when caller doesn't own the row (intentional — same error shape avoids enumeration).
- **logoutAll except-flag uses token-hash equality.** When `exceptAccessToken` is provided we compute its hash and add `AND token_hash <> $exceptHash`. Common pattern: "log me out everywhere except here" from the security page.
- **User-agent capped at 500 chars; IP at 64.** Both are slice-truncated before insert (`recordLogin`). Bounds row size and limits arbitrary-length attack vectors.
- **Schema-name validation.** `assertSchemaName` rejects anything outside `[a-zA-Z_][a-zA-Z0-9_]*` to prevent SQL injection through the schema option.

## Test coverage

`apps/backend/src/auth/__tests__/SessionService.test.ts` covers every path against an in-memory pg-stub:
- "REQ-132: listActiveSessions returnerer kun aktive sesjoner med isCurrent-flagg"
- "REQ-132: logoutAll uten except revoker alle aktive"
- "REQ-132: logoutAll med exceptAccessToken beholder gjeldende sesjon"
- "REQ-132: logoutSession krever at brukeren eier sesjonen" — security boundary
- "REQ-132: touchActivity revoker sesjon når 30-min inaktivitet er overskredet" — timeout path
- "REQ-132: touchActivity oppdaterer last_activity_at hvis > 60s siden" — happy path
- "REQ-132: touchActivity er en no-op hvis sesjonen er ukjent"
- "REQ-132: touchActivity er throttled (oppdaterer ikke under 60s)"
- "REQ-132: recordLogin persister user-agent og ip-adresse"
- "REQ-132: recordLogin trim-er user-agent til 500 tegn"

## Operational notes

**Common production failures:**
- `SESSION_TIMED_OUT`: not a bug — user was idle ≥ 30 min. Frontend should redirect to login. If you see clusters from the same user, they may have multiple tabs idle then click in an old one; this is the desired UX.
- `SESSION_NOT_FOUND` from `/sessions/:id/logout`: usually means a stale UI (the session list was cached and the row was already revoked). UI should refresh-and-retry.
- Spike in `touchActivity` DB load: throttle should hold per-user write rate to ≤ 1/min. If see >> that, suspect the throttle window was bypassed (e.g. a recent change to `TOUCH_THROTTLE_MS` or middleware misuse).
- `INVALID_CONFIG` at boot: missing pool/connection string. Defensive guard in constructor.
- Sessions never expiring: confirm `expires_at` is set on insert (PlatformService) and that `now()` clock skew between app and DB is small. SessionService doesn't issue tokens, only revokes.

## Recent significant changes

- **#717** — DomainError moved to shared module
- **#574** (REQ-129/132, 2026-04) — initial implementation alongside TOTP 2FA + 30-min inactivity timeout

## Refactor status

Stable. `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` notes shared SHA-256/Pool helpers could be extracted for `AuthTokenService` + `TwoFactorService` + `SessionService` parity. Background sweeper for finally-expired (`expires_at < now()`) rows is a nice-to-have for table size, not correctness.
