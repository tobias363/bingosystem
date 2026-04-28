# Pilot-Blocker Triage — 2026-04-28

**Status:** Live-dokument — alle 5 audits er nå inne.
**PM:** Senior-PM (ny)
**Sist oppdatert:** 2026-04-28 22:15 etter Database + Security (5/5 audits inne).
**Pilot-mål:** 4 simulerte haller i bingolokale, kjøre én reell dag. Ingen ekte penger.

---

## TL;DR

| Audit | Status | P0 | P1 | P2 | Pilot-blocking? |
|---|---|---:|---:|---:|---|
| Pixi (game-client) | ✅ Done | 5 | 9 | 8 | YES |
| Frontend (admin-web) | ✅ Done | 5 | 13 | 10 | YES (2 must-fix) |
| Compliance | ✅ Done | 4 | 8 | 7 | NO for pilot, YES for real-money |
| Security | ✅ Done | 3 | 8 | 7 | YES (cross-hall socket-bug + headers) |
| Database | ✅ Done | 3 | ~6 | ~4 | YES (boot-DDL + pool-sprawl) |
| **Sum totalt** | **5/5** | **20** | **44** | **36** | |

**Konklusjon:** Pilot er gjennomførbar med Spill 1 only + ~5-7 dev-dager med kritiske fixes. Real-money-launch krever ytterligere ~10-15 dev-dager. Fundamentet er solid — money-paths er casino-grade, hash-chains, append-only ledgers, parameterized SQL gjennomgående. Funnene er **operasjonelle og isolerte**, ikke arkitektoniske.

---

## P0 — Pilot-blockers (foreløpig liste)

### Pixi / Game-client (5 P0)

| ID | Tittel | Sted | Effort | Triage |
|---|---|---|---|---|
| PIXI-P0-001 | Pixi-ticker uncapped + uncontrolled (root cause for blink-klassen) | `packages/game-client/src/core/GameApp.ts:54-60` | **30 min stopgap** (`maxFPS=60`) eller 2-3 dager full fix | **MÅ-FIX. Stopgap først, full fix etter pilot.** |
| PIXI-P0-002 | Mini-game in-flight choice tapt på game-end før WinScreen | `Game1Controller.ts:437-438` + `MiniGameRouter.ts:182-191` | 0.5-1 dag | MÅ-FIX |
| PIXI-P0-003 | `PlayScreen.showElvisReplace` DOM-bar event-listener leak | `screens/PlayScreen.ts:580-616` | 0.5 dag | MÅ-FIX |
| PIXI-P0-004 | Spill 2/3 mangler PauseOverlay (frozen UI ved backend-pause) | Spill 2/3-controllers | 1-2 dager | **DEFER** hvis Spill 2/3 ikke i pilot |
| PIXI-P0-005 | Spill 2/3 mangler ReconnectFlow-paritet med Spill 1 | Spill 2/3-controllers | 1-2 dager | **DEFER** hvis Spill 2/3 ikke i pilot |

### Frontend / admin-web (5 P0)

| ID | Tittel | Sted | Effort | Triage |
|---|---|---|---|---|
| FE-P0-001 | `Modal.ts` ikke WCAG-compliant — ingen focus-trap, focus-restore, aria-modal | `apps/admin-web/src/components/Modal.ts` | <2 dager | **MÅ-FIX (DKBL-eksponering)** — kan scope-avgrenses til 12 pilot-kritiske dialoger |
| FE-P0-002 | 760 `innerHTML =` calls + 19 duplicate `escapeHtml` impls (XSS-risk) | spredt admin-web | <2 dager (lint + dedup) | **MÅ-FIX** |
| FE-P0-003 | `apiRequest` mangler AbortController (race på flaky hall-WiFi) | `apps/admin-web/src/api/` | 1 dag | MÅ-FIX |
| FE-P0-004 | Hall-context switch refresher ikke åpne sider (HALL_OPERATOR scope-bug i UI) | `apps/admin-web/src/shell/` | 1 dag | MÅ-FIX |
| FE-P0-005 | AdminOps re-binder 6 listeners per card per socket-delta (heap-vekst på 8h shifts) | `apps/admin-web/src/pages/admin-ops/` | 0.5 dag | MÅ-FIX |

### Compliance (4 P0)

| ID | Tittel | Sted | Effort | Triage |
|---|---|---|---|---|
| COMP-P0-001 | §11 distribution-bug: Spill 2/3 + mini-games hardkoder `gameType: "DATABINGO"` (30% i stedet for 15%) | `Game2Engine.ts:168`, `Game3Engine.ts:485`, `BingoEngineMiniGames.ts:153,326` | 6-10 dager | **DEFER hvis Spill 2/3 ikke i pilot.** MÅ-FIX før real-money. |
| COMP-P0-002 | Compliance-ledger soft-fail — `Game1TicketPurchaseService` swallow-er compliance-feil, fortsetter wallet-debit | `Game1TicketPurchaseService.ts:625-636` | 1-2 dager (outbox-pattern) | **MÅ-FIX** (også for pilot — datakvalitet i §71-rapport) |
| COMP-P0-003 | BankID ikke prod-ready (`KYC_PROVIDER=local` default, adapter eksisterer men ikke aktivert) | `apps/backend/src/adapters/`, `.env` | 1-2 dager + provider onboarding (Criipto/Signicat) | **DEFER** for pilot-test (sim-haller, ingen ekte penger). MÅ-FIX før real-money (hvitvask-loven). |
| COMP-P0-004 | Hash-chain backfill mangler — pre-BIN-764-rader har NULL hashes (tamper-detection-gap) | `app_wallet_transactions`, `app_regulatory_ledger` | 0.5-1 dag (one-shot script) | DEFER for pilot. MÅ-FIX før real-money. |

### Security (3 P0)

| ID | Tittel | Sted | Effort | Triage |
|---|---|---|---|---|
| SEC-P0-001 | HALL_OPERATOR cross-hall game control via Socket.IO — `requireAuthenticatedAdmin` mangler `assertUserHallScope` på socket-laget (HTTP scoper riktig) | `apps/backend/src/sockets/adminHallEvents.ts:220` | 2-3 timer | **MÅ-FIX** — i 4-haller-pilot kan en agent fra hall A pause/end-game i hall B mid-runde |
| SEC-P0-002 | Ingen security headers (Helmet, CSP, HSTS, X-Frame-Options, X-Content-Type-Options). Admin-portal er clickjackable. Med 27 reflected-XSS sinks (FIN-P1-01) er det ingen defense-in-depth. | `apps/backend/src/index.ts` | 3-4 timer | **MÅ-FIX** |
| SEC-P0-003 | High-severity CVE chain i `@xmldom/xmldom@0.8.12` via pixi.js (4 advisories: DoS + 3 XML-injection). Auto-fixable. | `package.json` | 1 time | **MÅ-FIX** (auto-fix) |

**Positive funn:** HMAC-SHA256 + constant-time webhook verification, scrypt + timingSafeEqual for passwords, parameterized SQL gjennomgående (52 template-string usages alle bundet til validated table/schema-navn), comprehensive pino redaction, magic-byte image validation med size + dimension caps, ingen `eval`/`exec` av user input, ingen prototype-pollution sinks, fail-closed chat hall-scope, PII hashed i Sentry. **Money-paths er casino-grade.**

**P1-bonus å vurdere:** 27 reflected XSS sinks i admin-web (`innerHTML = ... ${path}` for unknown-route fallbacks), to timing-unsafe `===` API-key compares (Candy wallet bridge, `/health/draw-engine`), `JWT_SECRET`/`JWT_REFRESH_SECRET` env-vars **påkrevd men aldri brukt** noensteds (sessions bruker opaque sha256-hashed tokens — misvisende for ops), 30-min inactivity-timeout enforced inkonsistent, `/metrics` endpoint uautentisert.

### Database (3 P0)

| ID | Tittel | Sted | Effort | Triage |
|---|---|---|---|---|
| DB-P0-001 | Runtime DDL på cold-boot — `PostgresWalletAdapter.initializeSchema()` runner `DROP CONSTRAINT` + `ADD CONSTRAINT CHECK` på populerte wallet-tabeller hver cold-boot. Trigger full-table validation under EXCLUSIVE lock. **Wallet-writes kan freeze i minutter etter Render redeploy.** | `apps/backend/src/adapters/PostgresWalletAdapter.ts:1473-1620` | 0.5-1 dag | **MÅ-FIX** (kritisk for pilot — 4 haller går samtidig, deploy-window kan kollapse i en hall) |
| DB-P0-002 | Connection-pool sprawl — 75 distinct `new Pool()` call-sites × max 20 connections = teoretisk **1500 connections vs Render Postgres ~100 limit**. Cold-boot eller load-spike risikerer connection exhaustion. | spredt på 75 services | 1-2 dager (consolidation) | **MÅ-FIX** for pilot |
| DB-P0-003 | Unbounded `bilag_receipt JSONB` (10 MB/row) — base64 PDF-er lagret inline i `app_agent_settlements`. **~37 GB/yr per hall worst case; 23 haller = ~850 GB/yr bare for kvitteringer.** Cloudinary er konfigurert men ubrukt for dette. | `app_agent_settlements` | 1-2 dager (Cloudinary-migration) | **DEFER** for pilot (4 haller × 1 dag = lav vekst). MÅ-FIX før real-money + flere haller. |

**Andre signifikante funn:**
- 4 orphan tables (`app_draw_session_*` fra BIN-515 multi-hall design — aldri produsert rader; FK fra regulatory_ledger alltid NULL)
- Mangler index på `app_users.phone` (hver phone-PIN login = seq scan)
- `idx_app_users_deleted_at WHERE IS NOT NULL` dekker feil retning (queries filtrerer `IS NULL`)
- **Ingen `statement_timeout`** — runaway queries holder connections forever
- `app_deposit_requests`/`app_withdraw_requests` mangler idempotency-keys (double-credit-risk på rapid clicks)
- Flere `ADD CONSTRAINT`-migrations uten `NOT VALID` (full table scan under deploy)
- Mixed money-typer: `NUMERIC(20,6)` vs `(14,2)` vs `(12,2)` vs `BIGINT` cents vs `INTEGER` cents — penge-display-bug-risiko

**Positive funn:** Schema-design selv er **casino-grade** — append-only ledgers, hash-chain audit (BIN-764), immutability triggers, REPEATABLE READ + retry pattern (BIN-762), idempotency-keys på kritiske paths (etter PR #685). Risikoene er operasjonelle (DDL/pool/blob), ikke arkitektoniske.

**Headline-tall:** 125 unique tables (TEXT-PK/BIGSERIAL/UUID inkonsistent), 268 indexes, 216 FK constraints (forward-only confirmed), 75 distinct `new Pool()` call-sites, 103 JSONB columns, 127 migrations.

---

## Andre signifikante funn (ikke P0, men flagget)

- **i18n ships kun `no` + `en`** men `AgentProfile.language` lover `nb/nn/en/sv/da` (silent fallback). Bør avklares før agenter med andre språkpref onboardes.
- **`formatNOK` defined 8× med diverging cents/ore/nok-konvensjoner** — penge-display-bug-risiko. Subtle men antitese til "casino-grade".
- **Bundle har null code-splitting** + frakter jQuery + Bootstrap-3 + AdminLTE + iCheck (~150 KB unused). Performance-debt, ikke pilot-blocker.
- **`<th scope="col">` count: 0 across 386 tables** — WCAG 1.3.1 partial fail.
- **Toast container har ingen `aria-live` region.**

---

## Triage-spørsmål for Tobias (etter alle 5 audits er inne)

1. **Spill 2/3 i pilot eller ikke?** Pixi-audit anbefaler Spill 1 only (mangler PauseOverlay + ReconnectFlow). Compliance-audit bekrefter at Spill 2/3 har §11-bug (6-10 dev-dager). **To uavhengige audits gir samme svar: Spill 1 only sparer 9-14 dev-dager.**
2. **Pixi-stopgap (`maxFPS=60`) — ship i dag?** 30 min, kveler 80-90% av blink. Lav risiko.
3. **Modal a11y-refactor — alle 167+ admin-sider eller bare pilot-kritiske 12** (settlement, close-day, KYC, cash inn/ut, payout, ticket-register, agent-shift)? Sparer 5-7 dev-dager hvis avgrenset.
4. **BankID — pilot bruker manuell KYC, real-money trenger BankID. Hvilken provider** (Criipto/Signicat/annen)? Påvirker tidslinje for real-money-launch.
5. **Compliance-ledger outbox-pattern (COMP-P0-002)** — bør fikses for pilot eller defer? Argument for: §71-rapport-kvalitet. Argument mot: bare 4 sim-haller i pilot, lav blast-radius.

---

## Foreslått pilot-blocker-portefølje (etter triage)

### Hvis Spill 1 only + scope-avgrenset Modal a11y:

**Bølge 2A — Pilot-stopgap + quick-wins (1-2 dev-dager, kan ferdig i dag/i morgen):**
- PIXI-P0-001 stopgap (`maxFPS=60`) — 30 min
- SEC-P0-003 xmldom CVE auto-fix — 1 time
- SEC-P0-001 cross-hall socket-scope — 2-3 timer (KRITISK for 4-haller-pilot)
- SEC-P0-002 security headers (Helmet + CSP + HSTS) — 3-4 timer
- PIXI-P0-002 mini-game in-flight — 0.5-1 dag
- PIXI-P0-003 Elvis-replace leak — 0.5 dag
- FE-P0-005 AdminOps listener-rebind — 0.5 dag

**Bølge 2B — Pilot-kritisk (3-5 dev-dager):**
- DB-P0-001 Runtime DDL fjern fra cold-boot — 0.5-1 dag (kritisk for redeploy-stabilitet)
- DB-P0-002 Connection-pool consolidation — 1-2 dager (kritisk for skalering)
- FE-P0-001 Modal a11y (12 pilot-kritiske dialoger) — <2 dager
- FE-P0-002 XSS lint + dedup escapeHtml — <2 dager
- FE-P0-003 AbortController i apiRequest — 1 dag
- FE-P0-004 Hall-context switch — 1 dag
- COMP-P0-002 Compliance-ledger outbox — 1-2 dager (datakvalitet i §71-rapport)
- SEC-P1-01 27 reflected XSS sinks — 0.5-1 dag

**Bølge 3 — Post-pilot, pre-real-money (10-15 dev-dager):**
- COMP-P0-001 Spill 2/3 §11 fix (12+ call-sites)
- COMP-P0-003 BankID-aktivering + provider onboarding (Criipto/Signicat)
- COMP-P0-004 Hash-chain backfill one-shot script
- PIXI-P0-001 Full ticker-lease refactor (overlay-isolation)
- PIXI-P0-004/005 Spill 2/3 PauseOverlay + ReconnectFlow
- FE-P0-001 Modal a11y (resterende 155 sider)
- DB-P0-003 bilag_receipt → Cloudinary-migration
- DB orphan tables cleanup + manglende indexes + statement_timeout
- DB idempotency-keys på deposit/withdraw-requests
- 27 SEC-P1 mitigations + JWT_SECRET deprecation + /metrics auth

**Total til pilot:** 4-7 dev-dager (kan parallelliseres med 4-5 fix-agenter til ~2-3 kalender-dager)
**Total til real-money:** Ytterligere 10-15 dev-dager + ekstern pen-test + Lotteritilsynet-godkjenning

---

## Hva som IKKE er på listen (men ble vurdert)

- **29 backlog-P0 fra forrige PMs code reviews** — disse må krysses mot audit-funn under triage. Mistanke om mye overlap (f.eks. Code Review #5 P0-2 ComplianceManager mutate-before-persist har trolig overlap med COMP-P0-002).
- **Refactor Fase 2-4** — ikke pilot-blocker, men vil redusere regression-risiko under fix-bølger. Forslag: kjør parallelt i bølge 2B.

---

## Endringslogg

- 2026-04-28 21:50 — opprettet med Pixi + Frontend funn
- 2026-04-28 22:00 — lagt til Compliance funn
- 2026-04-28 22:15 — lagt til Database + Security (alle 5 audits inne)
- *Neste: Triage-beslutning med Tobias → spawne Bølge 2A fix-agenter*
