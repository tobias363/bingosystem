# PlatformService

**File:** `apps/backend/src/platform/PlatformService.ts` (4794 LOC)
**Owner-area:** platform-admin
**Last reviewed:** 2026-04-30

## Purpose

The platform-wide entity service: owns auth (login / register / sessions / password / refresh), users + roles + KYC, halls, terminals, schedule slots + sub-game children, hall game config overrides, hall display tokens (TV-screen auth), and the admin player-management surface (KYC moderate, soft-delete, restore, role change, hall assignment, Excel bulk import). Talks to Postgres directly (`app_users`, `app_sessions`, `app_halls`, `app_terminals`, `app_schedules`, `app_sub_games`, `app_hall_game_config`, `app_hall_display_tokens`) and provisions a wallet via `WalletAdapter` on register.

This file is unusually large (4794 LOC) because it grew from the original platform-bootstrap module to absorb the entire user + hall + admin surface as the system matured. Pre-pilot refactor work plans to split it (see Refactor status).

## Public API (selected — see source for full list)

```ts
constructor(walletAdapter: WalletAdapter, options: PlatformServiceOptions)

// ── Auth + sessions ──────────────────────────────────────────────────
register({ email, password, displayName, surname, phone?, birthDate, complianceData? }): Promise<SessionInfo>
login({ email, password }): Promise<SessionInfo>
verifyCredentialsWithoutSession({ email, password }): Promise<{ userId, requires2FA }>  // for 2FA login
issueSessionForUser(userId): Promise<SessionInfo>                                       // post-2FA-verify
createSessionForPinLogin(userId): Promise<SessionInfo>                                  // REQ-130 phone+PIN
logout(accessToken): Promise<void>
refreshSession(oldAccessToken): Promise<SessionInfo>
getUserFromAccessToken(accessToken): Promise<PublicAppUser>

// ── User / KYC / GDPR ─────────────────────────────────────────────────
getUserById(userId): Promise<AppUser>
findUserByEmail(email): Promise<AppUser | null>
verifyUserPassword(userId, password): Promise<boolean>
changePassword(userId, current, newPassword): Promise<void>
verifyCurrentPassword(userId, password): Promise<boolean>
setPassword(userId, newPassword): Promise<void>                              // revokes all sessions
markEmailVerified(userId): Promise<void>
updateProfile(userId, { displayName?, email?, phone? }): Promise<AppUser>
updateProfileImage({ userId, category, imageUrl }): Promise<AppUser>         // GAP #5
submitKycVerification({ userId, birthDate, providerData? }): Promise<AppUser>
deleteAccount(userId): Promise<void>                                         // GDPR self-delete
assertUserEligibleForGameplay(user: PublicAppUser): Promise<void>            // KYC + age + block check

// ── Halls ─────────────────────────────────────────────────────────────
listHalls(opts?: { includeInactive? }): Promise<HallDefinition[]>
getHall(hallReference): Promise<HallDefinition>
requireActiveHall(hallReference): Promise<HallDefinition>
verifyHallTvToken(hallReference, tvToken): Promise<HallDefinition>           // /tv/:hallId/:hallToken
getHallClientVariant / setTvVoice / getTvVoice
createHall / updateHall

// Hall display tokens (auth for TV / cashier / kiosk)
listHallDisplayTokens / createHallDisplayToken / revokeHallDisplayToken / verifyHallDisplayToken

// ── Schedules ─────────────────────────────────────────────────────────
listScheduleSlots / createScheduleSlot / updateScheduleSlot / deleteScheduleSlot
createSubGameChildren / listSubGameChildren / listAllSubGameChildren
listAllScheduleSlots
logScheduledGame / listScheduleLog / listScheduleLogForSlots / listScheduleLogInRange
getScheduleSlotById

// ── Terminals + hall-game-config ──────────────────────────────────────
listTerminals / createTerminal / getTerminal / updateTerminal
listHallGameConfigs / upsertHallGameConfig

// ── Admin user management ─────────────────────────────────────────────
listUsersByKycStatus / listAdminUsers / createAdminUser / softDeleteAdminUser
approveKycAsAdmin / rejectKycAsAdmin / resubmitKycAsAdmin / overrideKycStatusAsAdmin
listPlayerHallStatus / setPlayerHallStatus
softDeletePlayer / restorePlayer / resetKycForReverify
updateUserRole / updateUserHallAssignment / updatePlayerAsAdmin
bulkImportPlayers / listPlayersForExport / searchPlayers
createAdminProvisionedUser / createPlayerByAdmin / setUserPassword
isPlayerActiveInHall / searchPlayersInHall

// ── Game catalog ──────────────────────────────────────────────────────
listGames / getGame / updateGame / listGameSettingsChangeLog

// ── Misc helpers ──────────────────────────────────────────────────────
getPool(): Pool                                          // BIN-516: shared pool exposure
setProfileSettingsService(service): void                 // wire ProfileSettings gate
clearClientVariantCache(): void
```

## Dependencies

**Calls (downstream):**
- `WalletAdapter` (constructor-injected) — `createAccount` on register, `getBalance` for `PublicAppUser` snapshot
- `KycAdapter` (optional) — BankID / external KYC submission via `submitKycVerification`
- `node:crypto.scrypt` — password hashing (`hashPassword` / `verifyPassword`)
- `node:crypto.randomBytes` — opaque session-token generation
- `pg.Pool` — DB writes/reads (DB-P0-002 shared)
- `SubGameManager` — sub-game lifecycle helpers
- `DomainError` — typed error codes consumed by REST + Socket layers

**Called by (upstream):** essentially every authenticated route + many domain services. Highlights:
- `routes/auth.ts` — login, register, refresh, logout, profile
- `routes/admin/*` — every admin entity surface (users, halls, schedules, terminals, KYC moderation)
- `routes/player/*` — profile, account-delete
- `routes/wallet/*` — `getUserFromAccessToken` for ownership checks
- `auth/middleware.ts` — `getUserFromAccessToken` per-request
- `BingoEngine` + `Game1*` services — `assertUserEligibleForGameplay` on room-join
- `agent/*` — agent shift / settlement paths use `searchPlayersInHall`, `listPlayerHallStatus`
- `LoginHistoryService` — user-id for login-history queries
- `ChatMessageStore` (BIN-516) — uses `getPool()` for shared pool

## Invariants

- **Wallet provisioned on register.** `register` opens a `BEGIN` tx, INSERTs the user, then calls `walletAdapter.createAccount` for the player. If wallet creation throws, the whole tx rolls back — there is no orphan user with no wallet.
- **Password = scrypt(`pw`, `salt`, N=16384, r=8, p=1, dkLen=64), 64-byte salt.** Stored as `salt:hash` hex. Verification uses `timingSafeEqual` against the scrypt output of the candidate. Modern industry baseline, no rotation policy needed (90-day rotation tracking lives in `PasswordRotationService`, REQ-131).
- **`setPassword` revokes all sessions.** When an admin force-resets or a password-reset token consumes, every active session for the user is revoked. Forces re-login with the new password.
- **Session token = `randomBytes(48).toString("base64url")`.** Stored as SHA-256 hash in `app_sessions.token_hash`. TTL default 8 hours (NEW-001, PR #625). 30-min idle timeout enforced separately by `SessionService` (REQ-132).
- **Email validation + minimum age.** `assertEmail` rejects malformed, `assertBirthDate` requires ISO date, `register` rejects users < `minAgeYears` (default 18, lower never accepted).
- **HALL_OPERATOR is hall-scoped.** `AppUser.hallId` is required for HALL_OPERATOR write operations and is cleared (`null`) for ADMIN/SUPPORT/PLAYER. Setters that target a different hall fail-closed via `AdminAccessPolicy` (separate module — `apps/backend/src/platform/AdminAccessPolicy.ts`).
- **`assertUserEligibleForGameplay` is the composite gate.** Runs (1) profile-settings block check (BIN-720, time-based block-myself), (2) KYC-status check (rejects UNVERIFIED/REJECTED), (3) age check, (4) Demo-Hall bypass (PR #660 — Demo-Hall agents skip pause/exclusion to support training). The gate runs in this order so a "block-myself" trumps a passing KYC, etc.
- **TV token format = `${tokenId}.${secret}`; both halves verified.** `verifyHallDisplayToken` parses the composite, looks up `tokenId`, and constant-time compares the secret. Hall TV screens in production live on `/tv/:hallId/:hallToken` and re-verify on every page load.
- **Soft-delete preserves audit trail.** `softDeletePlayer`, `softDeleteAdminUser` set `deleted_at` rather than DELETE; `restorePlayer` clears `deleted_at`. Bulk-import + reports filter on `deleted_at IS NULL` by default.
- **Bulk import is transactional + audited.** `bulkImportPlayers` opens one tx for the whole batch, generates a 7-day password-reset token per imported user (PR #488), and writes per-row audit-log rows with redacted email-domain markers (no plaintext email in audit details).
- **Schema-name validation.** `assertSchemaName` rejects anything outside `[a-zA-Z_][a-zA-Z0-9_]*` to prevent SQL injection through the schema option.

## Test coverage

Wide coverage spread across many test files because of the module's surface area:

- `apps/backend/src/platform/__tests__/assertUserEligibleForGameplay.test.ts` — composite gate ordering: block-myself trumps KYC, KYC + age continue to apply when block passes (PR #485, BIN-720)
- `apps/backend/src/platform/__tests__/verifyHallTvToken.test.ts` — TV-token-auth happy path + every reject reason (mismatch, unknown, inactive, empty)
- `apps/backend/src/platform/__tests__/hallDisplayTokens.test.ts` — display-token CRUD + composite-token verify
- `apps/backend/src/platform/AdminAccessPolicy.test.ts` — RBAC hall-scope enforcement
- `apps/backend/src/platform/AdminEndpointRbac.test.ts` — admin-route RBAC matrix
- `apps/backend/src/platform/AgentPermissionService.test.ts` — agent role permissions
- `apps/backend/src/__tests__/e2e_4hall_master_flow.test.ts` — multi-hall master/slave flow uses PlatformService for user provisioning
- `apps/backend/src/__tests__/e2e_admin_game_setup_full.test.ts` — full admin game-setup walkthrough including PlatformService DB schema (`STEP H.5: Demo Hall bypass-doc må stå i PlatformService.ts`)
- `apps/backend/src/__tests__/e2e_agent_portal_full_workday.test.ts` — agent workday end-to-end uses `searchPlayersInHall`, `listPlayerHallStatus`
- Per-feature unit tests scattered across the routes (`routes/auth.test.ts`, `routes/admin/*.test.ts`)

## Operational notes

**Common production failures:**
- `INVALID_CONFIG` at boot: missing pool/connectionString. Defensive constructor guard.
- `EMAIL_EXISTS` from register: not a bug, just a duplicate sign-up. UI should map to "already registered, try login".
- `AGE_RESTRICTED`: user under 18. Pengespillforskriften blocker.
- `INVALID_CREDENTIALS` floods: usually password-pasting or brute-force. Rate-limit at `routes/auth.ts` (lockout pattern from REQ-130).
- `SESSION_NOT_FOUND` / `UNAUTHORIZED` from `getUserFromAccessToken`: token expired, revoked, or mangled. Confirm `app_sessions` row exists and not revoked.
- `KYC_STATE_CONFLICT`: admin tried to approve/reject a user not in the right state. UI should refresh the row before retrying.
- "User missing wallet": rollback didn't fire on register. Run reconciliation: every `app_users` row should have a `wallet_id` referencing an existing `app_wallet_accounts` row.
- Bulk-import partial failure: the entire batch rolls back on any row error. Check audit-log for `account.bulk_import.failed` and surface the row index to the operator.
- TV-screen showing wrong hall: verify-fails return generic `TV_TOKEN_INVALID` (not `HALL_NOT_FOUND`) to avoid hall-id enumeration.

## Recent significant changes

- **#717** — DomainError moved to shared module
- **#715** — DB-P0-002 boot-DDL + pool consolidation
- **#660** — Demo Hall bypass: Demo-Hall agents skip pause/exclusion checks for training
- **#625** (NEW-001) — JWT/session TTL default 168 → 8 hours
- **#624** (REQ-131) — 90-day password rotation tracking
- **#574** (REQ-129/132) — TOTP 2FA + active sessions integration (`verifyCredentialsWithoutSession`, `issueSessionForUser`)
- **#598** (REQ-130) — Phone+PIN-login alternative (`createSessionForPinLogin`)
- **#502** (GAP #5/#29) — Profile image upload (`updateProfileImage`) + validate-game-view endpoint
- **#488** (BIN-702 follow-up) — Excel-import password-reset link + audit-log
- **#485** — `assertUserNotBlocked` gate wired into `assertUserEligibleForGameplay`

## Refactor status

**The largest single file in the backend.** `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` flags this for Bølge F2 split:

- `auth/PlatformAuthService.ts` — login/register/refresh/logout/2FA wire
- `users/UserService.ts` — `getUserById`, `findUserByEmail`, profile updates, `assertUserEligibleForGameplay`
- `users/AdminUserService.ts` — admin-side player + admin-user moderation, KYC moderation, role/hall assignment, soft-delete, bulk import
- `halls/HallService.ts` — hall + terminal + hall-game-config + display-tokens
- `schedules/ScheduleSlotService.ts` — schedule slots + sub-game children + schedule log
- `games/GameCatalogService.ts` — `listGames`, `getGame`, `updateGame`, settings change log

The split is mechanical (most methods don't cross domain boundaries) but high-risk because routes depend on the singleton's surface. Plan: extract into siblings inside `platform/`, keep the `PlatformService` class as a thin facade for backward compat, then migrate routes one by one.
