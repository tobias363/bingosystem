# Frontend Architecture Audit (admin-web) — 2026-04-28

**Auditor:** Frontend audit agent
**Scope:** `apps/admin-web/` only — vanilla TypeScript + Vite SPA, no UI framework
**Out of scope:** `packages/game-client/` (separate Pixi audit)
**Codebase size:** 343 TS files, ~62 161 LOC source, 107 test files (~vitest+jsdom)
**Method:** Static code review of shell, components, auth, router, i18n, sample pages, plus pattern grep across all of `src/`. Read-only — no source modifications.

---

## Executive Summary

- **Total findings:** 28 (P0: 5, P1: 13, P2: 10)
- **Top-3 architectural risks:**
  1. **No focus-trap or `aria-modal` in `Modal.ts`** — every dialog (settlement, close-day, payout) is a WCAG 2.1.2 / 2.4.3 failure and a keyboard-only operator cannot reliably escape or stay inside a modal. Regulatory exposure (DKBL § 3 commercial-site accessibility law).
  2. **`innerHTML = ` used 760× across pages** with ad-hoc `escapeHtml` re-defined in 19 different files — single missed escape on a backend-controlled string (player display-name, hall-name, agent-note, alert reason) is XSS in an admin tool that shows other operators' data.
  3. **Frontend duplicates ~495 type definitions** instead of importing from `packages/shared-types/` (one file does the relative-path import as a workaround). Backend can change a DTO and the only signal is a runtime `JSON.parse` that doesn't match — boundary safety is effectively `unknown`.
- **Refactor priority:** **Incremental, but with one urgent block.** The shell + router layout is sound. The components library is small (4 files) and re-buildable in place. The accessibility + XSS hardening must be done before pilot — it is not optional for a regulated commercial site, and it is the only finding I'd block pilot on.
- **Pilot-blocking findings:** **5** (see P0 section).

---

## Methodology

- Read shell entry-points: `main.ts` (596 lines), `Layout.ts`, `Sidebar.ts` (132 lines), `Header.ts` (203 lines), `sidebarSpec.ts` (370 lines).
- Read core components: `Modal.ts`, `DataTable.ts`, `Toast.ts`, `Form.ts`, `SlotProviderSwitch.ts`.
- Read auth + router: `AuthGuard.ts`, `Session.ts`, `permissions.ts`, `Router.ts`, `routes.ts`.
- Read i18n: `I18n.ts` + `no.json` (3 187 keys) + `en.json` (3 192 keys).
- Sampled 8 representative pages, including the largest (`Game1MasterConsole.ts` 1 424 lines, `NextGamePanel.ts` 1 226 lines, `AdminOpsConsolePage.ts` 864 lines, `SettlementBreakdownModal.ts` 790 lines, `CashInOutPage.ts` 633 lines, `DashboardPage.ts` + `DashboardState.ts`).
- Cross-cut grep for: `: any` / `as any` (1 / 0 — clean), `innerHTML =` (760), `escapeHtml` definitions (19 distinct), `Toast.*` (715 vs 3 native `alert`), `addEventListener("keydown"` (~10), `aria-*` (434 occurrences, none `aria-modal`), focus management, hardcoded NO/EN strings, code-splitting (0 dynamic imports), `setInterval`/`clearInterval` (42/10), shared-types import (1 — relative path), `AbortController` (0).

---

## Component Architecture

### Strengths
- **Clean shell layering.** `Layout.ts` mounts a static AdminLTE-shaped DOM once, then `Header / Sidebar / Breadcrumb / Footer` re-render on every route change. `contentHost` is the only mutated region per navigation. `main.ts` `renderPage()` has a long `if isXRoute → mountXRoute(container, …)` chain that mirrors `routes.ts`. It works, but see P1-FE-04.
- **Small reusable component library.** `apps/admin-web/src/components/` has only 5 components (`Modal`, `DataTable`, `Toast`, `Form`, `SlotProviderSwitch`) plus a couple of formatters. Each is self-contained and exported from `components/index.ts`. Good restraint.
- **Strict TypeScript.** `tsconfig.json:8` enables `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`. Build script chains `tsc --noEmit && vite build` so no broken types ever ship.
- **Public route bootstraps before auth.** TV-screen route (`/tv/<hallId>/<token>`) is dispatched in `main.ts:80-98` before `bootstrapAuth()` runs, so the hall TV display works without an admin login.

### Weaknesses
- **`main.ts` is the route-table.** 596 lines, two sibling 200-line dispatcher chains — one in `onUnknown` (pre-init) and one in `renderPage` (post-route-found). They are near-duplicates and must be edited in lockstep when adding any new section. Several routes (e.g. `/agent/games`) are wired only in the `renderPage` chain, meaning a deep-link with a query-string would fall through to `renderUnknown`. This is a known footgun.
- **Two parallel sidebar conventions.** `sidebarSpec.ts` (370 lines) is the leaf/group/header tree. `Header.ts` re-implements the user-dropdown + notification bell + logout outside the spec. Keeping them in sync requires touching three files (`Header.ts`, `sidebarSpec.ts`, `routes.ts`).
- **`adminlte` legacy JS still loaded.** `index.html:15-18` includes jQuery + Bootstrap-3 + AdminLTE + iCheck. The new code does not depend on jQuery, but the runtime still pays the parse cost (~150 KB extra). `Sidebar.ts:114-131` re-implements the treeview-toggle in vanilla TS, yet AdminLTE's own treeview JS is also loaded and may double-bind.
- **No error boundary.** A throw inside any `mountXRoute(container, …)` propagates to the unhandled-promise-rejection logger and the user sees a blank `contentHost`. There is no shell-level "Noe gikk galt — last på nytt" fallback.

---

## State Management

### Strengths
- **Auth state has a clean single-source.** `Session.ts:55` holds `let current: Session | null`; `setSession()` fires `session:changed`. `AuthGuard.bootstrapAuth()` owns the lifecycle, `main.ts:346` listens for `auth:unauthorized` to force a re-login.
- **ADMIN super-user hall-impersonation is well-thought-out.** `getEffectiveHall()` (Session.ts:133) is the single helper every page should call — agent gets `session.hall[0]`, ADMIN gets the localStorage-backed `getAdminActiveHall()`.
- **Polling lifecycle is correct in `DashboardPage.ts`.** Uses a mount-id generation counter to detect stale pending fetches (lines 17-20, 40, 84-85). This is the right pattern.

### Risks
- **Stale-poll defence is repeated, not shared.** Every long-lived page (Dashboard, AdminOps, NextGamePanel, TVScreen) re-implements stop-on-unmount + mount-id. Consider a `usePollingLifecycle()` helper in `components/`.
- **No `AbortController` anywhere.** 455 `apiRequest`/`fetch` calls, zero AbortControllers. A user who clicks "Last opp på nytt" on a slow page kicks off a second fetch while the first is still in-flight; whichever lands last wins. On mobile / hall-WiFi this matters.
- **Localstorage is the only client persistence.** `bingo_admin_access_token` (auth) and `spillorama.admin.activeHall` (impersonation). Both are read synchronously in code paths that assume `window` exists. The TV-screen bootstrap already has `typeof window !== "undefined"` guards in `Session.ts`, but `client.ts:36` does not — fine for jsdom, but a regression risk if any code starts to SSR.
- **WebSocket state lives per-page.** `adminOpsSocket.ts` opens its own `io()`. `TVScreenPage.ts` opens another. `agentHallSocket` opens a third. Each independently receives reconnection/disconnect callbacks. There is no central socket multiplexer — at minimum, no shared "is the backend reachable?" indicator across pages.
- **No global `current-hall` event for cash-inout.** Header has cash-inout button, but nothing watches `getEffectiveHall()` changes — operator switches hall in admin super-user mode and the open page does not refresh.

---

## API Error Handling

`ApiError` (`client.ts:10-34`) is a clean, typed exception with `code`, `status`, `message`, and `details`. 401 dispatches `auth:unauthorized` and clears the token, which `main.ts:346` rebinds to the login-redirect. **This part is solid.**

But:
- **No consistent surface pattern.** Pages vary between:
  - `Toast.error(err.message)` — most modern pages (~80 sites in `Toast.error` grep).
  - `errorHost.textContent = msg` — older inline-banner pages (Game1MasterConsole, dashboard error box).
  - `console.warn` only — Dashboard polling failure (`DashboardPage.ts:53`). User sees stale data with zero hint.
  - `alert()` — used 3 times: `DataTable.ts:382` (CSV export over-limit), and 2 places in legacy paths.
- **Norwegian translations inconsistent.** The settlement modal does `t("save") || "Lagre"` (107 sites of this `||` fallback pattern), which means when `t()` returns the key (i18n missing) the page falls back to a hardcoded NO string. Fine for safety, but it normalises hardcoding NO into source — see i18n section.
- **No retry / backoff.** 0 instances of `retry`, `exponentialBackoff`, or any equivalent. The only timer-driven behaviour is the dashboard 10s poll and the ops-console 5s fallback poll — both fire-and-forget. A hall with intermittent WiFi will show a half-broken UI with no recovery beyond manual refresh.
- **No 5xx differentiation.** `client.ts:81-89` treats `!response.ok` and `payload.ok === false` identically. A 503 from a deploy looks the same as a 400 validation error to the page. UI shows only the message string.
- **No offline detection.** No `navigator.onLine` listener; no service worker. Closes a known regulator gap (DKBL recommends graceful offline handling for hall-floor terminals on flaky WiFi).

---

## i18n Coverage

- **Dictionary size:** `no.json` 3 187 keys, `en.json` 3 192 keys — 5 keys exist in EN only. Not a bug per se but a lint should keep them in sync.
- **Languages supported by the SPA:** **only `no` and `en`** (`I18n.ts:8`). `Session.language` field on `AgentProfile` allows `nb / nn / en / sv / da` per OpenAPI, and the agent-form-test verifies the backend dropdown (`AgentFormPage.test.ts:65`) — **but the SPA cannot render `nn / sv / da` and silently falls back to `no` for them**. That is a contract mismatch.
- **Hardcoded Norwegian strings inside `.ts` source:** at least these patterns found:
  - `t("…") || "Norwegian fallback"` — **107 occurrences**. Examples:
    - `apps/admin-web/src/pages/cash-inout/modals/SettlementBreakdownModal.ts:528` `(t("save") || "Lagre")`
    - `apps/admin-web/src/pages/players/modals/BlockPlayerModal.ts:25` `t("are_you_sure_block_player") || "Er du sikker på at du vil blokkere denne spilleren?"`
    - `apps/admin-web/src/pages/cash-inout/modals/CheckForBingoModal.ts:570` `label: t("cancel_button") || "Avbryt"`
  - Direct `Toast.warning("Velg varighet.")` (`SettingsPage.ts:322`), `msg.textContent = "Bekreft med to-faktor-autentisering"` (`LoginPage.ts:145`), `metaHost.textContent = "Laster…"` (`GameReplayPage.ts:109`).
  - Hardcoded labels in admin-ops handlers: `body: ` Spillet i rommet ${room.code} pauses umiddelbart for alle spillere.` ` (`AdminOpsConsolePage.ts:110`) — entire confirmation-modal bodies are NO-only string-literals.
  - Hardcoded section title: `<h3 class="box-title">Språk</h3>` in `SettingsPage.ts:210`.
- **Coverage estimate:** ~85 % of leaf labels are translated (every t-call touches a key, even if the key is missing). But ~10-15 % of page-body text — including modal confirmation-bodies, console.error / warn surfaces, and one-off `t() || "no"` fallbacks — bypasses i18n entirely. Switching `lang=en` does not produce a fully English UI.
- **Backend-generated strings.** `ApiError.message` is forwarded raw to the user via Toast — no translation layer. Backend currently emits NO messages for many compliance errors, which "works" by coincidence. EN users see NO.
- **Currency / number / date formatting:** Several local `formatNOK / formatDate / formatDateTime` helpers (~15-20 distinct definitions across `pages/*/shared.ts` and inline in modals). Only 3 places use `Intl.NumberFormat("nb-NO", …)` (Leaderboard, AdminOps, loyalty/shared). Most use `n.toFixed(2)` with no locale-grouping — that means a 10 000 NOK reads `10000.00`, not the localised `10 000,00`.
- **Translation infrastructure status:** `t()` does parameter substitution (`{{count}}`) but no plural-aware substitution. Adding `nn / sv / da` would require either two new dicts each (~3 200 keys) or a fallback chain.

**Coverage estimate overall: ~80 %.** Solid for NO; insufficient for any other language.

---

## Accessibility (WCAG 2.1 AA) Baseline

| Criterion | Status | Notes |
|---|---|---|
| 1.1 Text Alternatives | **Partial** | `<i class="fa …" aria-hidden="true">` used widely, plus the user-avatar `<img alt="User Image">`. Gaps: many icon-only buttons in tables/cards lack accessible names — `data-action='pause'` `<button>` in AdminOps (`AdminOpsConsolePage.ts:568`) has only `title=` (insufficient). |
| 1.3.1 Info and Relationships | **Partial** | `<table>` used 386 places, but `scope="col"` / `scope="row"` is used **0 times**. Screen-readers cannot navigate row/column relationships. |
| 1.4.3 Color Contrast | **Partial** | Status colours rely on AdminLTE 2 palette + Bootstrap 3 `bg-red`/`bg-yellow`/`bg-green` (156 occurrences). AdminLTE 2 yellow on white fails AA at small text. Hall-card "Stuck" red, "Idle" gray — should be tested with axe. No central status-color contract. |
| 2.1.1 Keyboard | **Mostly OK** | All interactive elements are real `<button>` / `<a>` elements (`createElement("button")` 250×, `createElement("div")` for clicks: 0). One inline `onclick="window.history.back()"` in `SystemInformationPage.ts:59`. Tab order will follow DOM order. |
| 2.1.2 No Keyboard Trap | **FAIL** (P0) | `Modal.ts` has no focus-trap. Tab from the last button moves focus into the page behind the modal, where the user can interact with hidden controls. |
| 2.4.1 Bypass Blocks | **Pass** | `Header.ts:9-25` renders a "Skip to main content" link with proper focus styling. `<div id="main-content" role="main" tabindex="-1">` in `Layout.ts:28`. |
| 2.4.3 Focus Order | **Partial** | No focus-trap in modal means modal-open does not move focus into the dialog (only `Modal.ts:91` sets `tabindex="-1"` on the modal root). Initial focus in modals is undefined. After close, focus is not restored. |
| 2.4.7 Focus Visible | **Inherited** | Relies on AdminLTE 2 default `:focus` outline, which is preserved. |
| 3.3.1 Error Identification | **Partial** | Toasts disappear after 4s (`Toast.ts:18`) — keyboard / screen-reader users may miss them. Toasts do have `role="alert"`. Form-validation errors are inline `errEl.textContent = …` in some modals, but no ARIA `aria-invalid` on the input. |
| 3.3.2 Labels or Instructions | **Pass** | `Form.ts:18-22` sets `<label for="f-${name}">` correctly. 275 `for=` attributes vs 279 inputs — close to 1:1. |
| 4.1.2 Name, Role, Value | **Mostly OK** | `role="dialog"` on modal root, `role="document"` on inner dialog (`Modal.ts:91-100`). **Missing `aria-modal="true"` everywhere — 0 occurrences**, breaks AT modal-detection. `aria-labelledby` not bound to `modal-title`. |
| 4.1.3 Status Messages | **Partial** | Toast container has no `aria-live="polite"` / `aria-live="assertive"` region — individual toasts have `role="alert"` (which announces but doesn't update consistently). Spinner / loading states (e.g. dashboard skeleton) have no `aria-busy`. |

---

## Performance

- **Bundle:** `vite.config.ts` builds a single entry. **No code-splitting**, **0 dynamic imports**. `main.ts` static-imports every page-router (54 imports). For a ~62 kLOC app this likely produces a 1.5-2 MB unzipped bundle. First load on a hall-floor terminal could be 5-10 s on slow WiFi.
- **Legacy JS still loaded.** jQuery + Bootstrap-3 + AdminLTE + iCheck = ~150 KB extra parse time. None of the ported code uses jQuery directly; AdminLTE's treeview is re-implemented in `Sidebar.ts:114`. Removing the legacy chain is a measurable win.
- **Polling pattern is correct but unbounded.** `DashboardState.ts:80` correctly skips when `document.hidden` — good. AdminOps does **not** check `document.hidden` (`adminOpsSocket.ts` is push-only, polling fallback at 5 s in `AdminOpsConsolePage.ts:240` runs even when tab is hidden).
- **4-hall ops-console live-updates.** `applyDelta(state, delta)` calls full `renderAll(…)` which calls `renderHallsGrid(refs, state, handlers)` which sets `refs.hallsGrid.innerHTML = …` AND re-binds all event listeners on every delta (`AdminOpsConsolePage.ts:485-524`). With 4 halls and ~5 events/sec each (drawn balls, room-status, alert acks), that's 20 full DOM re-renders/sec at peak. Modern browsers handle it, but garbage-collection pauses are visible. **This is the pattern most likely to feel sluggish during a busy hall night.**
- **Memory leaks in long sessions (8 h shift).** Every page re-renders and re-binds; `cleanupFns` is used in `DataTable.ts` but not consistently in pages. `AdminOpsConsolePage.ts:524` re-binds card click handlers without removing the prior generation — over an 8 h shift with hundreds of deltas, the same hall card accumulates listener generations on `<button data-action='pause'>` since `innerHTML = …` discards old DOM but any closures bound to the new DOM are NOT cleaned up at unmount unless `dispose()` is called. The `dispose()` is hooked in `main.ts:309` but only fires on route-change, not on stay-on-page. **Likely significant heap growth on a 8 h ops-console session.**
- **Two `setInterval` patterns coexist** — `DashboardState.ts:96` uses `setTimeout` recursive (correct, prevents overlap) while `Game1ScanPanel.ts:75` and `NextGamePanel.ts:173` use raw `setInterval` (can overlap on slow networks).

---

## CSS Strategy

- **Vanilla CSS + AdminLTE 2 inheritance.** `src/styles/shell.css` is 65 lines, mostly imports (`@import "/legacy-skin/css/AdminLTE.min.css"` and friends) plus 4 page-fix blocks. There is **no CSS-modules / no Tailwind / no scoped utility framework**. All styling comes from AdminLTE 2 + inline `style="…"` in TS template-literals.
- **Inline style usage:** 38 `style.cssText` / `setAttribute("style"` calls. Plus uncounted hundreds of `style="…"` strings inside template-literals. Means there is no single source of truth for spacing, color, typography. A redesign means string-search across all pages.
- **`!important` count:** 15. One legitimate (`hedarModeColor` maintenance-mode in `shell.css:13`); the rest are scattered across page-CSS and likely rest-of-history struggles with AdminLTE specificity.
- **Theming variables:** none. AdminLTE skin chosen at body class level (`hold-transition skin-blue sidebar-mini` in `Layout.ts:22`); colors come from AdminLTE LESS. Switching to a light/dark mode is not feasible without rewriting AdminLTE.
- **Two page-specific stylesheets** exist (`pages/admin-ops/adminOps.css`, `pages/tv/tv-screen.css`). Sane scoping — co-located with the page.

---

## Code Duplication

Top patterns repeated 3+ times:

1. **`escapeHtml(s: string)` re-defined 19 times** across shell + components + pages, e.g. `Header.ts:200`, `Footer.ts:18`, `Breadcrumb.ts:18`, `Placeholder.ts:32`, `pages/players/shared.ts:8`, `pages/security/shared.ts:8`, `pages/products/shared.ts:10`, `pages/cash-inout/shared.ts:6`, `pages/cash-inout/modals/SettlementBreakdownModal.ts:59`, `pages/dashboard/widgets/InfoBox.ts:47`, `pages/tv/TVScreenPage.ts:613`, etc. **One utility file would replace 19 implementations.** This is also a security concern — see P0 #2.
2. **`formatNOK(value: number)` defined 8 times** with three different signatures (some take `cents`, some `nok`, some `ore`). Examples: `pages/players/shared.ts:15` (kr-format), `pages/cash-inout/modals/SettlementBreakdownModal.ts:71` (ore→kr), `pages/agent-portal/AgentPhysicalCashoutPage.ts:73` (cents→string). **Risk of money-display bugs** when one site is fixed and another is not.
3. **`formatDate / formatDateTime` defined ~10 times** with different format conventions (`sv-SE` ISO, `nb-NO` locale-string, custom `dd-MM-yyyy`).
4. **Per-section `shared.ts` files** — 11 directories have a `pages/<x>/shared.ts` (cash-inout, players, products, security, leaderboard, loyalty, adminUsers, amountwithdraw, otherGames, riskCountry, physical-tickets) — most of which re-export the same `escapeHtml + formatX + contentHeader` triplet. `amountwithdraw/shared.ts:12` has a comment "Gjenbruker bevisst IKKE cash-inout/shared.ts siden …" which is a fair scoping decision but the quadruplication of `escapeHtml` is not.
5. **Scaffold HTML (content-header, breadcrumb, box-open/close)** — `cash-inout/shared.ts` defines `contentHeader()`, `boxOpen()`, `boxClose()`. Other sections (players, products) reimplement the same with slight variations.

---

## Type Safety

- **`tsconfig` is exemplary.** `strict: true` + `noUnusedLocals` + `noUnusedParameters` + `noUncheckedIndexedAccess`. Build runs `tsc --noEmit && vite build`.
- **Almost no `any` casts.** `: any` count: **1** (`agent-shift.ts:187` `shift: any` — explicitly eslint-disabled with comment). `as any` count: **0**.
- **API boundary types are 100 % duplicated.** `apps/admin-web/src/api/` has 495 exported `interface` / `type` definitions across 65 files. **Only one** (`admin-payments.ts:18-26`) imports from `packages/shared-types/` — and it does so via a relative `../../../../packages/shared-types/src/api.js` path because admin-web does not declare the workspace dependency in `package.json`. The comment in that file is honest: "admin-web har ikke @spillorama/shared-types som workspace-dependency ennå."
  - **Consequence:** 99 % of frontend ↔ backend contracts are duplicated by hand. Any drift only surfaces at runtime as a `payload.someField is undefined` somewhere down the page-render chain.
  - **Single source of truth exists** (`packages/shared-types/src/`) and is used by backend and game-client. admin-web is the outlier.
- **`as unknown as` count:** 0. **`as Record<…>`:** few.
- **`apiRequest<T>` is parametric** but the type-check is purely structural; backend can drop a field and the cast still passes.

---

## Testing

- **107 test files** in `tests/` — that is dense for a 343-file source tree.
- **`vitest + jsdom`** as the runner, `setup.ts` shared. Tests are co-located in `tests/` (not next to source, which is a deliberate pattern).
- **What's covered:** modals (modal, settlement-breakdown, check-for-bingo, register-sold/more, kyc), router, sidebar, auth-guard, dashboard, payments API, agent flows, several cash-inout flows, TV-screen socket + ready-badges + phase-won-banner, ops-console + state, audit log + game-replay.
- **What's NOT covered:**
  - **No E2E inside admin-web.** The `apps/backend/src/__tests__/e2e_*.ts` cover backend-driven scenarios but treat the web client as a black box.
  - **No visual regression** for admin-web. (`packages/game-client` has Playwright snapshots; admin-web has none.)
  - **No accessibility test** (axe-core / lighthouse) anywhere in the repo for admin-web.
  - **No load test** — the 4-hall ops-console "20 deltas/sec" pattern is unverified at scale.
- **Test smell:** several test files are large (e.g. `pr-b6-integration.test.ts`, `pr-b7-integration.test.ts`). Tests probably duplicate setup helpers, but I did not deep-dive.

---

## Findings by Severity

### P0 — Pilot-blockers

- **[FE-P0-01] Modal lacks focus-trap, focus-restoration, and `aria-modal`**
  - **Location:** `apps/admin-web/src/components/Modal.ts:83-211`
  - **Description:** `Modal.open()` creates a `<div role="dialog" tabindex="-1">` and appends it to `document.body`, but never moves focus into the dialog, never traps Tab inside the dialog, never restores focus to the trigger on close, and never sets `aria-modal="true"` (0 occurrences across the codebase). It also does not bind `aria-labelledby` to the title.
  - **Risk:** WCAG 2.1.2 (No Keyboard Trap) and WCAG 2.4.3 (Focus Order) **failures.** Settlement, close-day, payout, and KYC-reject dialogs are unusable for keyboard-only or screen-reader operators. This is the most-clicked surface in the agent portal. DKBL accessibility law applies to the commercial portal — exposure is regulatory, not just UX.
  - **Recommended fix:** (a) On open, find the first focusable element in the dialog and focus it; remember `document.activeElement` to restore on close. (b) On Tab/Shift+Tab inside the modal, cycle focus inside the dialog (focus-trap). (c) Add `aria-modal="true"`, bind `aria-labelledby` to the title id, set `aria-describedby` to the body if needed. (d) Pair-test with VoiceOver / NVDA.
  - **Effort:** 4-6 hours including the test.

- **[FE-P0-02] `escapeHtml` duplicated 19 times — XSS surface ~760 `innerHTML =` calls**
  - **Location:** 19 distinct definitions including `apps/admin-web/src/shell/Header.ts:200`, `apps/admin-web/src/pages/players/shared.ts:8`, `apps/admin-web/src/pages/cash-inout/modals/SettlementBreakdownModal.ts:59`, `apps/admin-web/src/pages/tv/TVScreenPage.ts:613`. Pattern is `innerHTML = ` ${escapeHtml(value)} ` ` — but **760** `innerHTML =` assignments mean any single forgotten `escapeHtml()` call is XSS-stored.
  - **Risk:** A player can choose a `displayName` containing `<img onerror=…>`. When a hall operator opens the player-detail page, their session token executes the payload. Same for hall-name (admin sets it), agent-note (any agent), settlement-note, alert-reason. This is exactly the high-trust admin XSS pattern that NorCERT flags in regulated finance / gaming.
  - **Recommended fix:** (a) Move `escapeHtml` to `components/escape.ts` and replace all 19 definitions with one import. (b) Add an ESLint rule (or a CI grep) that blocks `innerHTML =` in source unless followed by `// eslint-disable-line safe-html` with reviewer comment. (c) Audit the 760 sites — most use `escapeHtml`, but the audit will surface the 5-15 that don't. Consider migrating to `textContent` + `createElement` for any node that does not need formatting.
  - **Effort:** 6-10 hours dedup + 2-4 hours grep audit + ESLint rule.

- **[FE-P0-03] `apiRequest` has no `AbortController` — race conditions under flaky WiFi**
  - **Location:** `apps/admin-web/src/api/client.ts:52-93`. 455 callers, 0 abort signals.
  - **Description:** `apiRequest()` calls `fetch()` without an abort signal. Long-lived pages (DashboardPage, AdminOps, NextGamePanel, all the sample pages) trigger overlapping fetches when the user navigates rapidly or when polling overlaps. Whichever request resolves last wins.
  - **Risk:** On hall-WiFi (typical pattern), an admin clicks "Refresh" on the cash-inout page; the slow first fetch arrives 6 seconds later and overwrites the user's just-saved settlement. Already happened once in the dashboard mount-id pattern (`DashboardPage.ts:17-20` is the ad-hoc workaround). **Money-data UI is at risk.**
  - **Recommended fix:** Add `signal?: AbortSignal` to `ApiOptions`. Have `apiRequest()` honor it. Provide a `usePollingLifecycle()` helper that owns a single `AbortController` per page mount.
  - **Effort:** 4-6 hours to extend the helper + 2-3 days to thread through hot pages (Dashboard, AdminOps, CashInOut, NextGamePanel).

- **[FE-P0-04] `getEffectiveHall()` change does not refresh open pages**
  - **Location:** `apps/admin-web/src/auth/Session.ts:84-117` (`setAdminActiveHall` fires `session:admin-active-hall-changed` event). `apps/admin-web/src/main.ts` does NOT listen for this event and re-render.
  - **Description:** ADMIN super-user opens cash-inout page, switches active hall via the impersonation banner, **the open page does not refresh** — its `getEffectiveHall()` call has already been resolved at mount.
  - **Risk:** Operator believes they are reviewing Hall A's daily balance but they are still seeing Hall B's pre-switch numbers. Real-money downstream actions (close-day, settlement, withdraw approval) on the wrong hall.
  - **Recommended fix:** In `main.ts:352` add a listener for `session:admin-active-hall-changed` that triggers the same `renderPage()` call as `i18n:changed` already does. Confirm all pages call `getEffectiveHall()` at render-time, not at mount-time.
  - **Effort:** 2 hours + audit of pages that cache `hallId` at mount.

- **[FE-P0-05] AdminOps re-binds all hall-card listeners on every socket delta — listener leak + GC pauses on 8h shifts**
  - **Location:** `apps/admin-web/src/pages/admin-ops/AdminOpsConsolePage.ts:485-524`. Every `applyDelta` calls `renderHallsGrid` which sets `refs.hallsGrid.innerHTML = …` and then `forEach` re-binds 6 listeners per card.
  - **Description:** Old DOM nodes are discarded (good — no zombie nodes), but if the same listener-bound functions are stored anywhere (e.g. closure-captured `state` reference), the old closures continue to live until next GC. With 4 halls and 5-20 deltas/sec across an 8 h shift, that's 60 000-300 000 listener generations.
  - **Risk:** GC pauses become noticeable. UI feels sluggish 4-6 hours into the shift. Worst case the tab crashes and the operator must re-login. This pattern is the #1 reason admin-tools "feel slow at end-of-day".
  - **Recommended fix:** (a) Use event delegation — bind one listener on `refs.hallsGrid` and route by `event.target.closest('[data-action]')`. (b) Or maintain a stable hall-card child component that mutates fields rather than re-rendering. (c) Add a periodic `dispose()` call when delta volume crosses a threshold.
  - **Effort:** 4-6 hours rewrite + 2 hours load-test verification.

### P1 — Should fix

- **[FE-P1-01] No `aria-live` region for Toasts** — `Toast.ts:8-16`. Container has no `aria-live="polite"` or `role="status"`. Screen-reader users miss notifications. Fix: add `aria-live="polite" aria-atomic="true"` on the container; consider role="status" on info, role="alert" on errors. ~30 min.
- **[FE-P1-02] No `<th scope="col">` anywhere** — 386 tables, 0 scope attributes. WCAG 1.3.1 partial fail. `DataTable.ts:182` should default to `scope="col"`. ~1 hour.
- **[FE-P1-03] AdminOps polling ignores `document.hidden`** — `AdminOpsConsolePage.ts:240` runs the 5 s fallback poll even when the tab is hidden. Wastes bandwidth + backend cycles. Fix: copy the `if (document.hidden)` guard from `DashboardState.ts:80`. ~30 min.
- **[FE-P1-04] `main.ts` route table is duplicated in `onUnknown` and `renderPage`** — 200 lines × 2 dispatchers (`main.ts:163-303` + `main.ts:394-594`). Diverging is a known-bug surface. Refactor to a single `dispatch(container, path)` table mapping `isXRoute → mountXRoute`. ~3-4 hours.
- **[FE-P1-05] No code-splitting** — `vite.config.ts` has a single `input: { main: index.html }`. With 343 source files, the bundle is large. Vite supports per-route dynamic imports trivially; converting `mount*Route` calls to `await import("./pages/x/index.js")` would cut first-load by ~70 %. ~1-2 days incremental.
- **[FE-P1-06] `Toast` lifecycle: 4 s timeout is too short for error messages** — 4 000 ms (`Toast.ts:18`) is fine for success. For errors, a sticky toast with manual dismiss is better. Add a level-aware timeout. ~1 hour.
- **[FE-P1-07] No retry / 5xx differentiation in `apiRequest`** — `client.ts:81-89` collapses 503/502/500/400/etc. into the same shape. Add retry-with-backoff for 502/503/504 (network glitches), surface 5xx differently from 4xx. ~3 hours.
- **[FE-P1-08] `Toast` and Modal cannot be opened from a logged-out state cleanly** — Login page uses raw DOM-mutation for error messages (`LoginPage.ts:145`); other login flows mix `Toast` + inline `<div class="alert">`. Pick one. ~2 hours.
- **[FE-P1-09] i18n contract mismatch with `AgentProfile.language`** — Backend allows `nn / sv / da`, SPA only ships `no / en`. Either add stub dicts or flag in UI that those languages fall back. ~2-4 hours.
- **[FE-P1-10] 107 instances of `t("…") || "Norwegian"` fallback pattern normalises hardcoding** — Replace with strict `t()` and a CI lint that blocks the `|| "…"` literal. The bare-key fallback already exists inside `I18n.t()` (`I18n.ts:46`). ~1-2 days for grep + fix.
- **[FE-P1-11] No formal lint between `no.json` and `en.json` keysets** — 5-key drift today. Add a vitest assertion that `keys(no) === keys(en)`. ~1 hour.
- **[FE-P1-12] `formatNOK` / `formatDate` duplicated 8-10× with diverging unit conventions (cents vs ore vs nok)** — Single source of money truth. Pick `øre` (matches backend) and one helper. ~4 hours dedup + audit.
- **[FE-P1-13] Loading-state is `"…"` (`shell.css:58`) and skeleton spinner has no `aria-busy="true"`** — Screen-readers don't announce loading. Fix the spinner template + add `aria-busy="true"` on the container during fetch. ~1 hour.

### P2 — Polish

- **[FE-P2-01] `index.html` ships jQuery + Bootstrap-3 + AdminLTE + iCheck** — none of which the new code uses directly. Audit and remove. Possibly migrate the 4-5 AdminLTE legacy CSS classes to vanilla. ~1-2 days.
- **[FE-P2-02] Inline `style="…"` strings in template-literals** — hundreds of occurrences. Hard to redesign. Move to CSS. ~slow incremental.
- **[FE-P2-03] No global error boundary** — a throw in any `mount*Route` blanks the page. Add a try/catch in `Router.handle()` that mounts an "Noe gikk galt — last på nytt" fallback box. ~1 hour.
- **[FE-P2-04] No service worker / no offline detection** — Hall WiFi flaps. Adding a navigator.onLine listener with a sticky banner is a polite UX. ~3 hours.
- **[FE-P2-05] Per-page WebSocket connections** — 3+ pages each open their own `io()`. Multiplex through a shared service so disconnect-banners are coherent across the app. ~1-2 days.
- **[FE-P2-06] No accessibility test in CI** — Add `@axe-core/playwright` (or vitest-axe) on the 5-10 hottest pages. Would catch much of the above. ~1 day to set up.
- **[FE-P2-07] DataTable lacks server-side filter/sort hooks** — All paging is `cursor` based, but column-sort is only `sortable: boolean` (`DataTable.ts:25`) without an `onSortChange`. Big tables (transactions, ledger) can't sort without re-fetching. ~half day.
- **[FE-P2-08] No central `format-currency.ts` / `format-date.ts`** — Pulls from i18n discussion. ~1 day.
- **[FE-P2-09] Two-tier sidebar logic split across `Sidebar.ts` (treeview) + `Header.ts` (user dropdown + bell)** — Some operators want shortcut keys for bell (alerts), no current implementation. ~1 day for keyboard shortcuts.
- **[FE-P2-10] `index.html` allows `'unsafe-inline' 'unsafe-eval'` in CSP for scripts (`vite.config.ts:26`)** — Unavoidable for legacy AdminLTE bundle, but tightening once jQuery is removed is a security win. Track for post-pilot.

---

## Refactor Roadmap

Top-5 highest-ROI refactors:

| # | Refactor | Effort | Why |
|---|---|---|---|
| 1 | **Modal hardening (focus-trap + restoration + `aria-modal`)** | 4-6 h | P0 accessibility, ships value the day it lands. |
| 2 | **Single `escapeHtml` + safe-html lint + 760-site grep audit** | 1-2 days | P0 XSS hardening, eliminates 18 duplicate functions, blocks future regressions. |
| 3 | **Add `AbortController` to `apiRequest` + `usePollingLifecycle()` helper** | 2-3 days | P0 race-condition fix; pays back across all 455 callers; prerequisite for code-splitting. |
| 4 | **Adopt `@spillorama/shared-types` workspace-dep + replace 495 duplicated types** | 1-2 weeks (incremental) | Boundary safety; backend changes start producing build errors not runtime ones. |
| 5 | **Code-splitting per top-level section (cash-inout, agent, admin-ops, …)** | 1-2 days | First-load goes from ~2 MB to ~400 KB. Hall-floor terminals see 5× faster cold-load. |

---

## Conclusion

**Architecture verdict: structurally sound, security/accessibility-incomplete.**

The shell + router + components scaffolding is genuinely well-designed. `Layout.ts`, `Sidebar.ts`, `Router.ts`, `AuthGuard.ts`, `Session.ts` show care: small files, single responsibilities, good `data-testid` for tests, clean role-guard. `tsconfig` is exemplary; `any` is essentially absent. Polling lifecycle in `DashboardPage` shows the team understands the problem. 107 vitest test files for 343 source files is a healthy ratio.

But the layer below — modals + DOM-string-templating + i18n + WebSocket fan-out — has accumulated the technical debt of "30+ frontend fixes but no architecture review" exactly as the PROJECT_HANDOFF brief warned. The **two true pilot-blockers** are (1) modals are not WCAG-compliant which is regulatory exposure for a Norwegian commercial site, and (2) `innerHTML = ` is the dominant render mechanism with 19 ad-hoc `escapeHtml` definitions which is XSS exposure in a high-trust admin tool. Neither is hard to fix; both must ship before pilot.

**Top-3 actions:**
1. Fix `Modal.ts` for accessibility (P0-01) — this is the single line item that flips the regulatory status. Ship it this week.
2. Centralise `escapeHtml`, add a CI lint blocking raw `innerHTML =`, audit the 760 call sites (P0-02). Two engineer-days.
3. Add `AbortController` to `apiRequest` (P0-03) and start using `@spillorama/shared-types` from `admin-web` (P1) — these together remove the entire class of "the page silently rendered stale data because the boundary drifted" bugs that are otherwise unavoidable on flaky hall WiFi.

After these three, the audit's P1/P2 items can be done incrementally over the next 2-4 weeks without blocking pilot.
