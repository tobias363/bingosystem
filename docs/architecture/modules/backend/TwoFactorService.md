# TwoFactorService

**File:** `apps/backend/src/auth/TwoFactorService.ts` (518 LOC)
**Owner-area:** auth
**Last reviewed:** 2026-04-30

## Purpose

TOTP (RFC 6238) two-factor authentication for player and admin accounts (REQ-129). Manages the full lifecycle: setup → first-code verify → enable + 10 single-use backup codes → login verification → optional disable. The pending vs enabled secret split lets a user abort setup without affecting an active 2FA configuration.

A short-lived challenge table bridges the password-verify and TOTP-input steps so the email+password POST can reply `requires2FA: true` with a challenge id, and the follow-up POST can submit just the challenge + code.

## Public API

```ts
constructor(options: TwoFactorServiceOptions)

// Setup → enable
setup({ userId, accountLabel }): Promise<{ secret: string; otpauthUri: string }>
verifyAndEnable({ userId, code }): Promise<{ backupCodes: string[] }>     // returns plaintext codes ONCE

// Login
verifyTotpForLogin({ userId, code }): Promise<void>                       // throws INVALID_TOTP_CODE
createChallenge(userId): Promise<{ challengeId: string; expiresAt: string }>
consumeChallenge(challengeId): Promise<{ userId: string }>                // throws INVALID_TWO_FA_CHALLENGE

// Status / disable / regenerate
isEnabled(userId): Promise<boolean>
getStatus(userId): Promise<TwoFactorStatus>                               // { enabled, enabledAt, backupCodesRemaining, hasPendingSetup }
disable({ userId, code }): Promise<void>                                  // requires valid TOTP/backup
regenerateBackupCodes(userId): Promise<{ backupCodes: string[] }>         // invalidates old set

// Lifecycle
close(): Promise<void>
static forTesting(pool: Pool, schema?): TwoFactorService
```

## Dependencies

**Calls (downstream):**
- `pg.Pool` — DB writes/reads (DB-P0-002 shared pool)
- `auth/Totp.ts` — `generateTotpSecret`, `buildOtpauthUri`, `verifyTotpCode` (RFC 6238 with ±1 step skew)
- `node:crypto` — `randomBytes`, `randomUUID`, `createHash`, `timingSafeEqual` for constant-time backup-code comparison
- `DomainError` — typed error codes consumed by REST layer

**Called by (upstream):**
- `routes/auth.ts` — `/api/auth/2fa/setup`, `/api/auth/2fa/verify`, `/api/auth/2fa/disable`, `/api/auth/2fa/status`, `/api/auth/2fa/backup-codes/regenerate`, `/api/auth/2fa/login`
- `routes/auth.ts` `/api/auth/login` — checks `isEnabled(userId)` and (if true) calls `createChallenge` instead of issuing a session
- `index.ts` — wires the singleton

## Invariants

- **Plaintext secret returned exactly once.** `setup` returns the freshly-generated secret + otpauth URI. The plaintext is stored in `pending_secret` until `verifyAndEnable` proves the user has it in their authenticator app, then promoted to `enabled_secret`. Both columns are app-encrypted at rest (in production deployment this should sit on a Postgres pgcrypto column — verify in deployment).
- **Backup codes are stored hashed only.** Each entry in `backup_codes` JSONB is `{ h: sha256(plaintext), u: usedAtIsoOrNull }`. Plaintext is returned to the user only at `verifyAndEnable` and `regenerateBackupCodes`; never recoverable from DB. Constant-time compare via `timingSafeEqual` (`constantTimeStringEquals`, line 94-99).
- **Single-use backup codes.** `verifyTotpForLogin` finds the entry by hash, marks `u = now().toISOString()` in the same UPDATE, so a leaked code can be used at most once. Old set is fully replaced (not appended) on `regenerateBackupCodes`.
- **TOTP code = exactly 6 digits.** Login path normalises whitespace (`replace(/\s+/g, "")`), then `/^\d{6}$/` for TOTP-attempt + `/^\d{10}$/` for backup-attempt. A 6-digit code that fails TOTP does **not** fall through to backup (would be unsound — backup codes are 10 digits).
- **Backup code = 10 digits formatted "XXXXX-XXXXX".** Both with and without the dash are accepted on input (`replace(/-/g, "")` before regex). 10 digits = ~33 bits entropy — enough for one-shot recovery, brute-force-resistant given account lockout (REQ-130 PIN lockout pattern; REQ-129 should follow same posture in routes).
- **TOTP step skew = ±1.** `verifyTotpCode` (`auth/Totp.ts`) accepts the previous, current, and next 30-s window. Standard RFC 6238 tolerance.
- **`setup` refuses to overwrite an enabled config.** If `enabled_secret` is set, throws `TWO_FA_ALREADY_ENABLED` — user must `disable` (with valid code) first. Pending-only state is overwritten freely.
- **`disable` requires a valid TOTP/backup code.** Defence-in-depth: even if password is compromised, an attacker cannot disable 2FA without the second factor. Routes additionally require password verification.
- **Challenge TTL = 5 minutes.** `CHALLENGE_TTL_MS = 5 * 60 * 1000`. `consumeChallenge` is idempotent (single-shot insert/delete) — second call throws `INVALID_TWO_FA_CHALLENGE`.
- **`debugLogSecrets` must never be enabled in prod.** Constructor option logs the generated secret on `setup`. Used only for local dev when staring a real authenticator app at the wrong code.
- **Schema-name validation.** `assertSchemaName` rejects anything outside `[a-zA-Z_][a-zA-Z0-9_]*` to prevent SQL injection through the schema option.

## Test coverage

`apps/backend/src/auth/__tests__/TwoFactorService.test.ts` covers every path against an in-memory pg-stub:
- "REQ-129: setup returnerer otpauth-URI + secret"
- "REQ-129: verifyAndEnable promoter pending → enabled + 10 backup-codes"
- "REQ-129: verifyAndEnable avviser feil TOTP-kode"
- "REQ-129: setup avviser hvis 2FA allerede aktivert"
- "REQ-129: verifyTotpForLogin aksepterer current TOTP" + "avviser ugyldig kode"
- "REQ-129: backup-code er single-use"  — UPDATE marks `u` on consume; second use fails
- "REQ-129: backup-code aksepteres uten bindestrek også"
- "REQ-129: createChallenge + consumeChallenge happy path"
- "REQ-129: consumeChallenge avviser reuse"
- "REQ-129: consumeChallenge avviser utløpt challenge"
- "REQ-129: disable krever korrekt TOTP-kode og fjerner 2FA"
- "REQ-129: regenerateBackupCodes erstatter alle koder"
- "REQ-129: getStatus speiler 2FA-tilstand"
- "REQ-129: isEnabled reflekterer enabled_secret"

Companion: `apps/backend/src/auth/__tests__/Totp.test.ts` covers RFC 6238 vector + skew window.

## Operational notes

**Common production failures:**
- `INVALID_TOTP_CODE` floods: clock skew on user device, or attacker probing. If from same `userId` repeatedly, route layer should rate-limit (similar to REQ-130 PIN lockout).
- `TWO_FA_ALREADY_ENABLED` from `setup`: user trying to set up while already enabled. UI should redirect to "disable first" flow.
- `TWO_FA_NOT_ENABLED` from `verifyTotpForLogin`: a login flow tried to verify TOTP but no `enabled_secret`. Likely means the login endpoint mis-detected `requires2FA` — recheck `isEnabled` ordering in `/api/auth/login`.
- `INVALID_TWO_FA_CHALLENGE`: challenge expired, already used, or never existed. Expected on slow user typing past 5 min — UI should show "kode utløpt, prøv igjen".
- Backup codes exhausted (`backupCodesRemaining: 0`): user used all 10 codes. UI should prompt regenerate. There is no auto-regenerate.
- "Authenticator works on phone but server says invalid": clock-drift on server. Confirm container time vs NTP. Step skew of ±1 covers ~30 s drift in either direction.
- `debugLogSecrets=true` in prod: SEV-1 — secrets are now in logs. Rotate every secret; rebuild deployment with the flag off.

## Recent significant changes

- **#717** — DomainError moved to shared module
- **#574** (REQ-129/132, 2026-04) — initial implementation: TOTP setup/verify/disable, backup codes, challenge flow, alongside `SessionService` 30-min inactivity timeout

## Refactor status

Stable. `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` notes:
- Add per-user rate-limiting on `verifyTotpForLogin` (REQ-130 PIN lockout pattern: lock after N consecutive failures).
- Consider migrating `pending_secret` / `enabled_secret` columns to pgcrypto-encrypted-at-rest for additional defence-in-depth (currently relies on DB-level access control + at-rest disk encryption).
