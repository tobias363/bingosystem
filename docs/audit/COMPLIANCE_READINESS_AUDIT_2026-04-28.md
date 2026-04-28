# Compliance-Readiness Audit (Lotteritilsynet) — 2026-04-28

**Skrevet:** 2026-04-28
**Forfatter:** Compliance-readiness audit-agent
**Scope:** Pengespillforskriften §11/§23/§64/§66/§71 + audit-trail + GDPR + KYC + report-generation + fail-closed-mønstre
**Audit-grunnlag:** Read-only kode-gjennomgang av `apps/backend/src`, migrations, routes og dokumentasjon

---

## Executive Summary

| Kategori | Vurdering |
|---|---|
| **Audit-readiness for pilot (4 sim halls, ingen ekte penger)** | **JA — med en advarsel.** Fail-closed mønstre, hash-chain, daglig regulatorisk hovedbok og §23/§66/§71-enforcement er på plass. Eneste pilot-blokker er §11-misklassifisering for Spill 2/3 (men hvis pilot kjører Spill 1 only, dette er ikke en pilot-blokker). |
| **Audit-readiness for real-money launch** | **NEI — fire P0 må lukkes først.** §11-bug på Spill 2/3 + mini-games, soft-fail compliance-write uten retry-job, BankID-integrasjon må gå fra `local`-stub til `bankid`-prod-konfig, og org-num-validering (norsk 9-siffer) må implementeres. |
| **Total funn** | 19 (P0: 4, P1: 8, P2: 7) |

### Top 3 regulatoriske risiko

1. **§11 distribusjon-feil for Spill 2/3 + mini-games** — `gameType: "DATABINGO"` er fortsatt hardkodet i `BingoEngineMiniGames.ts` (linje 153, 326), `Game2Engine.ts` (linje 168, 320, 444), `Game3Engine.ts` (linje 254, 485) og `BingoEngine.ts`. Dette får §11-kalkulen til å bruke 30%-grense for Spill 2/3 i stedet for 15%. Regulatorisk: vi overforplikter til organisasjoner — neppe et regulatorisk problem (utdeler MER enn lov-minimum), men gjør tellingen feil per kategori.

2. **Compliance-ledger-write er soft-fail** — `Game1TicketPurchaseService.ts:625-636` swallow-er feil ved compliance-skriving og fortsetter med wallet-debit. Hvis DB-feil treffer, går penger ut av spillerens wallet uten at §71-rad blir skrevet. Code Review #5 P0-4 og handoff §7 fanger dette som et åpent problem.

3. **BankID-konfigurasjon er ikke prod-klar** — `KYC_PROVIDER=local` brukes i dev (per CLAUDE.md). For real-money launch trenger vi `KYC_PROVIDER=bankid` med Criipto/Signicat/BankID-konfig. Adapter er kodet (`apps/backend/src/adapters/BankIdKycAdapter.ts`), men ikke aktivert. Pilot kan bruke manuelle KYC, men ekte Lotteritilsynet-pengespillplattform krever BankID-verifisering for spillere.

### Anbefalte handlinger før real-money launch

| Action | Effort |
|---|---|
| Bytt `gameType: "DATABINGO"` til `ledgerGameTypeForSlug(room.gameSlug)` i Game2Engine.ts, Game3Engine.ts, BingoEngineMiniGames.ts | 4-6 dev-timer |
| Implementer outbox-retry-job for compliance-ledger-feil (Code Review #5 P0-4) | 1-2 dev-dager |
| Sett opp BankID-config (Criipto/Signicat) + bytt KYC_PROVIDER=bankid i prod | 1-2 dev-dager (avhengig av provider-onboarding) |
| Legg til norsk 9-siffer org-nummer-validering i `POST /api/admin/overskudd/organizations` | 1-2 dev-timer |
| Genererer ferdig Lotteritilsynet-rapport-template (PDF-eksport av `app_daily_regulatory_reports` + `app_regulatory_ledger` for én måned) | 4-6 dev-timer |

---

## Methodology

Audit kjørte read-only over:

- `CLAUDE.md`, `docs/architecture/ARKITEKTUR.md`, `docs/architecture/SPILLKATALOG.md`, `docs/handoff/PROJECT_HANDOFF_BRIEF_2026-04-28.md`, `docs/compliance/SPILL1_GAMETYPE_INVESTIGATION_2026-04-25.md`
- `apps/backend/src/game/ComplianceLedgerOverskudd.ts`, `ComplianceManager.ts`, `BingoEnginePatternEval.ts`, `Game1*Service.ts`, `Game2Engine.ts`, `Game3Engine.ts`, `BingoEngineMiniGames.ts`, `ledgerGameTypeForSlug.ts`
- `apps/backend/src/wallet/WalletAuditVerifier.ts`, `WalletOutboxWorker.ts`
- `apps/backend/src/adapters/PostgresWalletAdapter.ts`, `BankIdKycAdapter.ts`
- `apps/backend/src/routes/wallet.ts`, `players.ts`, `adminCompliance.ts`, `adminReports.ts`, `adminOverskudd.ts`, `adminAuditLog.ts`, `adminWallet.ts`, `adminHallsTerminals.ts`, `game1Purchase.ts`
- `apps/backend/src/compliance/AuditLogService.ts`
- `apps/backend/src/spillevett/reportExport.ts`
- `apps/backend/src/jobs/walletAuditVerify.ts`, `walletReconciliation.ts`, `xmlExportDailyTick.ts`
- `apps/backend/migrations/20260417000005_regulatory_ledger.sql`, `20260417000006_daily_regulatory_reports.sql`, `20260418160000_app_audit_log.sql`, `20260428080000_compliance_ledger_idempotency.sql`, `20260902000000_wallet_entries_hash_chain.sql`

---

## Pengespillforskriften §-by-§ Analysis

### §11 — Distribution to organizations

**Status: Partial Pass — fungerer for Spill 1, regulatorisk feil for Spill 2/3 + mini-games.**

**Implementation:**
- Kjerne-kalkyle: `apps/backend/src/game/ComplianceLedgerOverskudd.ts:75` — `minimumPercent = row.gameType === "DATABINGO" ? 0.3 : 0.15`. Strukturelt korrekt.
- `ledgerGameTypeForSlug()` resolver finnes i `apps/backend/src/game/ledgerGameTypeForSlug.ts` — returnerer `MAIN_GAME` for `bingo` (Spill 1), `DATABINGO` for alle andre slugs.
- Spill 1 services bruker korrekt resolver: `Game1DrawEngineService.ts:2860`, `Game1PayoutService.ts:261, 394, 433`, `Game1TicketPurchaseService.ts:611`.

**Findings:**

1. **Spill 2 (Rocket) er feilklassifisert** — `apps/backend/src/game/Game2Engine.ts:168` har `const gameType: LedgerGameType = "DATABINGO";`. Per SPILLKATALOG.md §1, Spill 2 er hovedspill (15%). §11-utdelingen vil derfor utdeles 30% til organisasjoner i stedet for 15%.

2. **Spill 3 (Monsterbingo) er feilklassifisert** — `apps/backend/src/game/Game3Engine.ts:485` har samme hardkoding. Per SPILLKATALOG.md §1, Spill 3 er hovedspill (15%). Samme symptom som Spill 2.

3. **BingoEngine mini-games er feilklassifisert** — `apps/backend/src/game/BingoEngineMiniGames.ts:153, 326` (Wheel of Fortune, Treasure Chest, etc.) har `const gameType = "DATABINGO" as const;`. Per SPILLKATALOG.md §1, mini-games er sub-game av Spill 1 (hovedspill, 15%).

4. **Mange BingoEngine.ts-call-sites** har `gameType: "DATABINGO"` hardkoded — disse er hovedsakelig for ad-hoc/test-flyt og er IKKE prod-flyten for Spill 1, som bruker `Game1DrawEngineService`-pipeline (per handoff §6).

5. **Hall-balance-readout antar bare DATABINGO** — `apps/backend/src/sockets/adminHallEvents.ts:78-79` har `HALL_BALANCE_ACCOUNT_PAIRS = [{ gameType: "DATABINGO", channel: "HALL" }, { gameType: "DATABINGO", channel: "INTERNET" }]`. Når Spill 1 begynner å skrive `MAIN_GAME` til ledger, vil hall-balance-vinduet for Spill 1 bli tomt selv om penger fortsatt finnes på `house-{hallId}-main_game-{channel}`-konto.

**Risk:**
- Lotteritilsynet kan kreve at vi viser at vi distribuerer minst 15% til organisasjoner per hovedspill og 30% per databingo. Per i dag distribuerer vi 30% for ALT — over-fullfører lovkrav, men gjør tellingen feil.
- Hvis ekstern revisor ber om §11-rapport for et hovedspill (Spill 2 eller 3) viser den 30%-fordeling, ikke 15%. Internt kan det se ut som vi gjør for mye.
- "Beholde DATABINGO" i koden uten å fikse hall-balance-readout vil fortsette å fungere, men gir oss ikke korrekt regulatorisk klassifisering. Et brev fra Lotteritilsynet-revisor som ber om "vis at Spill 2 er hovedspill og distribusjon er 15%" kan vi ikke besvare i dag.

**Fix recommendation:** Bytt `gameType: "DATABINGO"` → `ledgerGameTypeForSlug(room.gameSlug)` i Game2Engine.ts, Game3Engine.ts, BingoEngineMiniGames.ts, BingoEngine.ts (kun call-sites som faktisk er prod-flyten). Krever oppdatering av `adminHallEvents.ts:78-79` slik at hall-balance-readout sjekker BÅDE MAIN_GAME og DATABINGO. Krever også oppdatering av 9-13 testfiler. Detaljert konsekvens-analyse i `docs/compliance/SPILL1_GAMETYPE_INVESTIGATION_2026-04-25.md`. Effort: 6-10 dev-dager.

---

### §23 — Self-exclusion (1 year)

**Status: Pass.**

**Implementation:**
- Player-facing endpoint: `apps/backend/src/routes/wallet.ts:217` (`POST /api/wallet/me/self-exclusion`) og `:227` (`DELETE`).
- Admin endpoint: `apps/backend/src/routes/adminCompliance.ts:96, 108`.
- Kjernen: `apps/backend/src/game/ComplianceManager.ts:473-511` (setSelfExclusion, clearSelfExclusion).
- Lift-restriction blokkert under exclusion-perioden: `ComplianceManager.ts:500-505` kaster `SELF_EXCLUSION_LOCKED` hvis `nowMs < state.selfExclusionMinimumUntilMs`.
- Default 1 år (per `BINGO_SELF_EXCLUSION_MIN_MS`): `apps/backend/src/util/envConfig.ts`.
- Persistert i `app_rg_restrictions`-tabellen via `ResponsibleGamingPersistence`.

**Findings:**

1. **Lift-prevention enforced i ComplianceManager.clearSelfExclusion** — utenom-tids-lukking blokkert.

2. **Multi-channel enforcement** — `assertWalletAllowedForGameplay()` kalles i:
   - Socket-laget: `gameEvents/context.ts:216, 232`, `game1ScheduledEvents.ts:409`
   - REST-laget: `routes/game1Purchase.ts:179` (PR #687, lukker P0-1 fra Code Review #5)
   - Engine-laget: 7 forskjellige call-sites i `BingoEngine.ts`

3. **PR #485 lagt til ProfileSettingsService.assertUserNotBlocked** — `PlatformService.ts:3597-3618`. Sikrer at profil-endringer (e.g. gjenåpne konto) blokkerers under self-exclusion.

**Risk:**
- Lav. Self-exclusion er solid implementert med mange enforcement-points.

**Fix recommendation:** Ingen.

---

### §66 — Mandatory pause after 60 min

**Status: Pass — men med en kjent gap i ad-hoc engine.**

**Implementation:**
- Konfig-default: `BINGO_PLAY_SESSION_LIMIT_MS=60*60*1000` (60 min) og `BINGO_PAUSE_DURATION_MS=5*60*1000` (5 min) — `apps/backend/src/util/envConfig.ts:137-138`.
- Trigger: `ComplianceManager.ts:631-647` — når `totalPlayMs >= playSessionLimitMs`, settes `pauseUntilMs = endedAtMs + pauseDurationMs` på `app_rg_play_session_state`.
- Block-resolution: `ComplianceManager.ts:889-911` (resolveGameplayBlock) — returnerer `MANDATORY_PAUSE` med `untilMs`.
- Auto-resume etter pause-utløp: `assertWalletAllowedForGameplay` kaster ikke om `pauseUntilMs <= nowMs`, så spilleren kan spille igjen.
- Play-session lifecycle: `startPlaySession` (når spilleren joiner), `finishPlaySession` (når runde slutter — kalt fra `BingoEnginePatternEval.ts:537, 719`).

**Findings:**

1. **Auto-pause socket-event mangler i ad-hoc engine (BingoEnginePatternEval)** — Code Review #2 P0-3 i handoff §7 fanger at pattern-eval-laget ikke broadcaster `mandatory-pause`-event til klienten. Klient har ikke proaktivt bevisthet om at en spiller har overskredet 60 min — server returnerer `PLAYER_REQUIRED_PAUSE` ved neste forsøk på å kjøpe ticket. Dette er en UX-bug, ikke regulatorisk brudd: regelen håndheves, men spilleren får ikke proaktivt varsel.

2. **Demo Hall test-mode bypasser pause** — `apps/backend/src/game/BingoEnginePatternEval.ts:510-528` har `[demo-hall-bypass]` som hopper over `end/pause` for test-haller. Demo Hall bruker `is_test_hall=true`-flag. Dette er pilot-trygt (ingen ekte penger), men må aldri gå i prod for ekte haller — verifisert via DB-flag.

**Risk:**
- Lav. Regelen håndheves i alle prod-paths via `assertWalletAllowedForGameplay`. Auto-pause-event-mangelen er kosmetisk.

**Fix recommendation:** Legg til socket-broadcast `mandatory-pause`-event i `BingoEnginePatternEval.evaluateActivePhase` etter `finishPlaySession()` — dette krever at `EvaluatePhaseCallbacks` får en ny callback for å pushe til socket-rommet. Effort: 2-3 dev-timer.

---

### §71 — Multi-hall actor binding

**Status: Pass — etter PR #684 og #685.**

**Implementation:**
- `app_regulatory_ledger`-tabell: `apps/backend/migrations/20260417000005_regulatory_ledger.sql` — append-only hovedbok med `hall_id NOT NULL`, hash-chain (`prev_hash → event_hash`), immutability-trigger (UPDATE/DELETE/TRUNCATE blokkert).
- `actor_hall_id` på audit-tabeller: `app_game1_master_audit` (Game1MasterControlService.ts), `app_game1_recovery` (Game1RecoveryService.ts), `app_game1_transfer_hall` (Game1TransferHallService.ts).
- Effective-hall-id-resolver: `apps/backend/src/util/canonicalRoomCode.ts` — returnerer `effectiveHallId: null` for shared rooms (Spill 2/3 globalt, Spill 1 per-link). Caller bruker `null` for å markere rommet som hall-shared.
- PR #684 (effectiveHallId for scheduled multi-hall): `apps/backend/src/sockets/game1ScheduledEvents.ts:286` setter `effectiveHallId: null` for hall-shared rooms.
- PR #685 (UNIQUE idempotency on ComplianceLedger): migration `20260428080000_compliance_ledger_idempotency.sql` — UNIQUE-index på `idempotency_key`. Blocker dobbel-telling i §71-rapport ved retry.

**Findings:**

1. **`Game1PayoutService` binder PRIZE-entry til VINNERENS kjøpe-hall, ikke master-hallens hall** — verifisert i `apps/backend/src/index.ts:1534-1538` kommentar. K1-fix-brev. §71-rapport er korrekt per hall for multi-hall-runder.

2. **`Game1TicketPurchaseService.ts:611` bruker `ledgerGameTypeForSlug("bingo")`** og hentet `hallId` fra `app_game1_ticket_purchases.hall_id`. Compliance-binding er korrekt.

3. **`app_regulatory_ledger.hall_id` er NOT NULL og REFERENCES `app_halls(id)`**. Pengeflyt uten hall-id er strukturelt umulig.

4. **Idempotens på dobbel-skriving** — PR #685 lukker dobbel-tellings-bug. `recordComplianceLedgerEvent` bruker deterministisk key + ON CONFLICT.

**Risk:**
- Lav. §71 er solid implementert med to hash-chains (wallet + regulatory) og UNIQUE-constraint mot dobbel-telling.

**Fix recommendation:** Ingen.

---

### §64 — Spilleplan (game schedule public-display)

**Status: Pass.**

**Implementation:**
- Public read: `apps/backend/src/routes/game.ts:180` (`GET /api/halls/:hallId/schedule`) — returnerer dagens slots filtrert på dayOfWeek + activeOnly.
- Admin CRUD: `apps/backend/src/routes/adminHallsTerminals.ts:368, 381, 402, 424` (GET/POST/PUT/DELETE).
- Operator log (audit-trail): `apps/backend/src/routes/adminHallsTerminals.ts:436` (`POST /api/admin/halls/:hallId/schedule/:slotId/log`).
- Schedule audit log read: `apps/backend/src/routes/adminHallsTerminals.ts:457` (`GET /api/admin/halls/:hallId/schedule-log`).

**Findings:**

1. **Spilleplan-endepunkt finnes** og returnerer dagens scheduled games per hall.
2. **Operator log for endringer fungerer** — mottar `{action, gameSessionId, endedAt, playerCount, totalPayout, notes}`.
3. **Audit-trail er read-only via admin endpoint** — `listScheduleLog`-call.

**Risk:**
- Lav. Standard implementasjon.

**Fix recommendation:** Ingen.

---

## Audit Trail Assessment

### Hash-chain (BIN-764)

**Status: Pass — implementert på både wallet og regulatorisk hovedbok.**

**Implementation:**

**Wallet hash-chain** (`apps/backend/migrations/20260902000000_wallet_entries_hash_chain.sql`):
- `wallet_entries.entry_hash = SHA256(prev_hash + canonical_json(entry_data))` per konto.
- Genesis-rad bruker zero-hash (64x '0').
- `WalletAuditVerifier` (`apps/backend/src/wallet/WalletAuditVerifier.ts`): re-beregner kjeden, alarmerer ved mismatch.
- Mismatch-alarmering: `console.error` + `app_audit_log`-rad (`wallet_audit/verify.mismatch`) + Prometheus-tellere.
- Bruksmodi: nightly cron + on-demand admin-endpoint `GET /api/admin/wallet/audit-verify/:accountId` (`adminWallet.ts:189`).
- Job: `apps/backend/src/jobs/walletAuditVerify.ts` — kjører 02:00 lokal tid.

**Regulatorisk hash-chain** (`apps/backend/migrations/20260417000005_regulatory_ledger.sql`):
- `app_regulatory_ledger.event_hash = SHA256(id || event_date || channel || hall_id || transaction_type || amount_nok || ticket_ref || created_at || prev_hash)`.
- Sequence (BIGSERIAL) gir deterministisk verifikasjons-rekkefølge.
- Immutability-trigger blokkerer UPDATE/DELETE/TRUNCATE — eneste måten å rette feil er kompenserende ADJUSTMENT-rad.

**Daily reports hash-chain** (`apps/backend/migrations/20260417000006_daily_regulatory_reports.sql`):
- `app_daily_regulatory_reports.signed_hash = SHA256(report_date||hall_id||channel||turnover||prizes||tickets||players||first_seq||last_seq||prev_hash)`.
- Dag-til-dag-kjede (per-rapport prev_hash).
- Immutability-trigger samme.

**Findings:**

1. **Tre uavhengige hash-chains** — wallet (per-konto), regulatorisk hovedbok (global), daily reports (global). Tamper-detection er aktivt på alle tre.

2. **Tamper-detection verified** — `WalletAuditVerifier.verifyAccount()` re-beregner kjeden. Hvis stored hash ≠ expected, alarmerer.

3. **Backwards-compat** — pre-BIN-764 wallet-rader har `entry_hash IS NULL`. Verifier hopper over dem og rapporterer `legacyUnhashed`. **Backfill er ikke kjørt — eksisterende rader har null hash.** Dette betyr at vi har en gap-periode hvor manipulasjon ikke kan oppdages.

4. **Extraction path for auditors:**
   - On-demand: `GET /api/admin/wallet/audit-verify/:accountId` (krever WALLET_COMPLIANCE_READ perm).
   - Audit-log via `GET /api/admin/audit-log` med cursor-pagination.
   - Daily regulatory reports via `GET /api/admin/reports/daily/archive/:date`.

**Gaps:**

1. **Wallet hash-chain ikke backfilled for pre-BIN-764 rader.** En auditor som ber om "vis hash-kjede for konto X for hele 2026" vil få NULL-hashes for tidlige rader. Backfill-job må kjøres før prod-launch.

2. **Verifikasjon-resultater er ikke automatisk eksportert** — kun stoppet når mismatch alarmeres. Det er ikke lett å vise et auditor "vi sjekker integriteten hver natt og her er rapporten for siste 30 dager".

3. **Dagens audit-log API har OFFSET-basert pagination med `slice()` på serveren** — `apps/backend/src/routes/adminAuditLog.ts:138-156` henter `offset + limit + 1` rader og slicer client-side. For store datasets (>10k events) blir dette tregt.

---

### Append-only logs

**Coverage by domain:**

| Domain | Tabell(er) | Append-only? |
|---|---|---|
| Wallet | `wallet_entries` (med hash-chain BIN-764), `wallet_outbox` (BIN-761) | Ja, hash-chain garanterer det |
| Compliance ledger (§11) | `app_rg_compliance_ledger` (med `idempotency_key` UNIQUE) | Ja, men ingen DB-trigger som blokkerer UPDATE/DELETE — kun UNIQUE-constraint mot dobbel-skriving |
| Regulatory ledger (§71) | `app_regulatory_ledger`, `app_daily_regulatory_reports` | **Ja — DB-trigger blokkerer UPDATE/DELETE/TRUNCATE.** |
| Generic audit | `app_audit_log` | Ikke teknisk blokkert via trigger, men kommentar sier "immutable — never updated or deleted". Service eksponerer kun `append/list`. |
| Game-domene | `app_game1_master_audit`, `app_game1_recovery`, `app_game1_transfer_hall` | Ja, append-only via service-pattern |

**Gaps:**

1. **`app_audit_log` mangler DB-trigger som tvinger immutability.** Per kommentar "Immutable — never updated or deleted", men koden kunne i teorien skrive UPDATE/DELETE-spørringer. Bør legge til trigger som matcher `app_regulatory_ledger`-pattern.

2. **`app_rg_compliance_ledger` mangler immutability-trigger.** UNIQUE-constraint blokkerer dobbel-INSERT, men ikke UPDATE eller DELETE av eksisterende rader. Bør legges til.

---

## Report Generation Capability

### What we can deliver to Lotteritilsynet today

| Endpoint | Beskrivelse | Format |
|---|---|---|
| `GET /api/admin/reports/daily?date=YYYY-MM-DD&format=csv` | Daglig rapport per (hall, gameType, channel) | JSON / CSV |
| `GET /api/admin/reports/daily/archive/:date` | Arkivert daglig rapport (immutable) | JSON |
| `GET /api/admin/reports/range?startDate&endDate&hallId&gameType&channel` | Range-rapport | JSON |
| `GET /api/admin/reports/games?startDate&endDate&hallId` | Game-statistikk | JSON |
| `GET /api/admin/reports/revenue?startDate&endDate&hallId&gameType&channel` | Revenue summary (BIN-587 B3.1) | JSON |
| `GET /api/admin/ledger/entries` | Compliance ledger entries | JSON |
| `GET /api/admin/overskudd/preview?date` | §11 distribusjon preview | JSON |
| `GET /api/admin/overskudd/distributions` | §11 distribusjons-batcher | JSON |
| `GET /api/admin/audit-log?from&to&actorId&resource&action` | Audit-log med cursor-pagination | JSON |
| `GET /api/admin/wallet/audit-verify/:accountId` | Hash-chain verifikasjon for én konto | JSON |
| `POST /api/spillevett/report/export` | Spiller-vendt rapport (PDF) | PDF |
| Daily XML-eksport for bank-uttak | `apps/backend/src/jobs/xmlExportDailyTick.ts` | XML (e-post til regnskap) |
| `GET /api/admin/halls/:hallId/schedule-log` | Schedule audit log per hall | JSON |

**§11 distribusjon-rapport:**
- `previewOverskuddDistribution()` returnerer hva som ville bli distribuert per (hall, gameType, channel, organisasjon).
- `createOverskuddDistributionBatch()` faktisk gjør distribusjon med wallet-transfer + ORG_DISTRIBUTION ledger-rad per transfer.
- Persistert i `app_rg_overskudd_batches` + `app_rg_overskudd_transfers`.

**§71 daglig rapport:**
- `app_daily_regulatory_reports`-tabell aggregerer per (rapport_dato, hall, kanal) fra `app_regulatory_ledger`.
- Generert av cron 06:00 + manuelt via admin-endepunkt.
- Hash-signed dag-til-dag.

### Missing reports

1. **Ingen ferdig PDF-template for Lotteritilsynet-format.** Vi har JSON/CSV, men ikke en print-ready PDF som matcher en standard "månedsrapport per hall"-format. CSV-eksport finnes for daily-report; PDF-eksport finnes kun for spiller-vendt spillregnskap.

2. **§11-rapport er ikke automatisk generert per måned eller år.** Distribusjon-batcher må triggeres manuelt av admin med `POST /api/admin/overskudd/distributions`. Cron-job mangler.

3. **Mangler "vis tamper-evident audit-trail for periode X"-rapport.** WalletAuditVerifier kjører nightly, men resultatet logges til console + audit-log. Det er ikke et endpoint som returnerer "audit-trail-status for [januar 2026]" som auditor kan be om.

4. **Mangler "samlet regulatorisk pakke for periode X"-eksport.** Auditor må kalle 5-7 endpoints separat for å få full historikk. Ingen "én knapp som genererer en zip av alt regulatorisk for [måned X]".

### Format-quality assessment

**Production-ready:** Delvis JA, delvis NEI.
- JSON/CSV: produksjons-klart for tekniske auditorer.
- PDF for Spillevett-rapport: produksjons-klart (`apps/backend/src/spillevett/reportExport.ts` bruker PDFKit med proper formatering).

**Polish needed:**
- Ingen ferdig "Lotteritilsynet-template" PDF for daily/monthly regulatory reports. Auditor-pakken må sammenstilles manuelt.
- CSV-eksport er minimal (kun daily-report). Mangler: range-rapport CSV, ledger-entries CSV, audit-log CSV.

---

## Fail-closed Verification

### Compliance unreachable → result observed

**Implementation:** `BingoEngine.assertWalletAllowedForGameplay()` (kjernen) kaster DomainError ved blokk. Hvis `ComplianceManager` selv kaster (f.eks. DB-feil ved `getRestrictionState`), bobler feilen opp og blokkerer kjøp.

**Verifisering:**

1. **Socket-laget:** `gameEvents/context.ts:216, 232` — kall til `assertWalletAllowedForGameplay()` kastes opp og resulterer i ack-error til klient.
2. **REST-laget:** `routes/game1Purchase.ts:179` — samme pattern. PR #687 (Code Review #5 P0-1) lukket bypass-pathen via REST.
3. **Engine-laget:** 7 forskjellige call-sites i `BingoEngine.ts`.

### Bypass paths found

1. **Soft-fail på compliance-ledger-skriving** — `Game1TicketPurchaseService.ts:625-636` swallow-er feil ved compliance-skriving og fortsetter med wallet-debit. Wallet-debit + INSERT er allerede committet; STAKE-entry er audit-logging. Per kommentar "audit-logging som kan re-kjøres manuelt ved behov" — men det finnes ingen retry-job. Code Review #5 P0-4 i handoff §7 fanger dette.

   **Konsekvens:** Hvis DB-feil treffer compliance-ledger-INSERT, går penger ut av wallet uten at §71-rad blir skrevet. §71-rapport for den dagen blir ufullstendig. Lotteritilsynet kan kreve "vis at alle salg vises i §71-hovedboken" — vi kan ikke garantere det.

2. **`ComplianceManager` mutate-before-persist** — Code Review #5 P0-2 i handoff §7 fanger 4 metoder som muterer in-memory state FØR persistens — hvis DB-write feiler, er in-memory og DB ute av sync. Ikke direkte regulatorisk problem, men kan skape inconsistencies.

3. **Demo Hall test-mode bypasser §66 + end-on-bingo** — `BingoEnginePatternEval.ts:510-528`. Pilot-trygt så lenge `is_test_hall=true` aldri settes på ekte hall.

---

## KYC Readiness

### Pilot

**Status: JA — manuell KYC sufficient for sim-haller uten ekte penger.**

- Manuell KYC moderation: `POST /api/admin/players/:id/approve|reject|resubmit` (RBAC: `PLAYER_KYC_MODERATE` — ADMIN/HALL_OPERATOR/SUPPORT).
- Admin override: `PUT /api/admin/players/:id/kyc-status` (`PLAYER_KYC_OVERRIDE` — ADMIN only).
- Audit-log per moderasjon: `player.kyc.approve|reject|resubmit|override`.
- E-post-templates for kyc-approved og kyc-rejected.
- Spiller can submit manuelle KYC via `POST /api/kyc/verify` med birthDate + nationalId (redacted i logs).

### Real-money launch

**Status: NEI — BankID-integrasjon må aktiveres.**

- Adapter eksisterer: `apps/backend/src/adapters/BankIdKycAdapter.ts` (BIN-274, OIDC mot Criipto/Signicat/BankID).
- Konfig-default i CLAUDE.md: `KYC_PROVIDER=local` for dev.
- Adapter må wires inn i prod via env-vars: `BANKID_CLIENT_ID`, `BANKID_CLIENT_SECRET`, `BANKID_AUTHORITY`, `BANKID_REDIRECT_URI`.
- Provider-onboarding (Criipto, Signicat) tar typisk 1-2 uker forretnings-godkjennelse.

### Gaps

1. **BankID prod-konfig ikke testet** — adapter er kodet men prod-deploy med ekte BankID-keys er ikke verifisert.

2. **Manuell KYC mangler dokumentupload** — spiller kan kun gi `birthDate + nationalId` (tekstuell). Per Lotteritilsynet og hvitvask-loven trenger vi typisk dokument-bevis (pass, førerkort) — manuell KYC i dag er for tynn for ekte spillere.

---

## Player Data & GDPR

**Status: Pass — for self-service, men data retention er ikke dokumentert.**

**Implementation:**
- Self-service delete: `DELETE /api/auth/me` og `DELETE /api/players/me` (BIN-587 B2.1).
- `players.ts:133-160` — kaller `platformService.deleteAccount(userId)` + skriver `account.self_delete` audit-event.
- Soft-anonymize semantikk: `softDeletePlayer()` i `PlatformService.ts:3025` — IKKE hard delete, beholder kontoen som soft-deleted.
- Audit-event redacted: `details.emailDomain` (kun "@example.com" del), ikke full e-post i klartekst. **Ros for redaction.**

### Gaps

1. **Data retention policy ikke dokumentert** — koden har 90-dagers retention på `wallet_transactions.idempotency_key` (BIN-767), men ingen policy for `app_audit_log`, `app_regulatory_ledger`, `app_rg_compliance_ledger`. Per hvitvask-lov og pengespillforskriften trenger vi typisk 7-års retention på finansielle data.

2. **GDPR-eksport mangler** — DELETE-endpoint finnes, men spiller kan ikke laste ned egne data (Article 15 right of access). Eneste eksport er `/api/spillevett/report/export` (PDF) — ikke full GDPR-pakke.

3. **`account.self_delete` redacter e-post men ikke andre PII-felter** — `displayName`, `phone`, `birthDate` blir bevart i audit-payload hvis present. Bør sjekkes om dette er bevisst.

---

## Findings by Severity

### P0 — Regulatory pilot-blockers

**For pilot UTEN ekte penger:** P0-funn er teknisk akseptable hvis pilot kun kjører Spill 1 og fokuserer på flow-validering. For real-money launch må alle P0 lukkes.

#### P0-1: §11 distribusjon-feil for Spill 2/3 + mini-games

- **Location:** `apps/backend/src/game/Game2Engine.ts:168, 320, 444`, `apps/backend/src/game/Game3Engine.ts:254, 485`, `apps/backend/src/game/BingoEngineMiniGames.ts:153, 326`
- **Description:** `gameType: "DATABINGO"` er fortsatt hardkodet — utløser §11 distribusjon på 30% i stedet for 15%.
- **Risk:** Lotteritilsynet kan kreve at vi viser at Spill 2/3 er hovedspill med 15% distribusjon. Per i dag distribuerer vi 30% — over-fullfører lovkrav, men gjør tellingen feil. Vi kan ikke svare "her er distribusjon for Spill 2 (hovedspill)" korrekt.
- **Recommended fix:** Bytt `"DATABINGO"` → `ledgerGameTypeForSlug(room.gameSlug)` i call-sites. Oppdater `adminHallEvents.ts:78-79` til å sjekke begge gameTypes. Oppdater 9-13 testfiler. Detaljert konsekvens-analyse i `docs/compliance/SPILL1_GAMETYPE_INVESTIGATION_2026-04-25.md`.
- **Effort:** 6-10 dev-dager (kode + tester + manuell wallet-account-konsolidering).

#### P0-2: Compliance-ledger-write soft-fail uten retry-job

- **Location:** `apps/backend/src/game/Game1TicketPurchaseService.ts:625-636`, `apps/backend/src/game/Game1PayoutService.ts` (samme pattern), `apps/backend/src/agent/AgentMiniGameWinningService.ts:472`
- **Description:** Hvis `recordComplianceLedgerEvent` feiler (DB-error etc.), swallow-es feilen og purchase/payout fortsetter. Wallet-debit er allerede committet; §71-rad mangler.
- **Risk:** §71-rapport blir ufullstendig. Lotteritilsynet kan oppdage at ikke alle wallet-debits har korresponderende §71-entry. Code Review #5 P0-4.
- **Recommended fix:** Implementer outbox-pattern for compliance-ledger-write — skriv intent-rad til en outbox-tabell, dispatch via worker som retry-er ved feil.
- **Effort:** 1-2 dev-dager (mønster fra `WalletOutboxWorker` kan gjenbrukes).

#### P0-3: BankID-konfigurasjon ikke prod-klar

- **Location:** `apps/backend/src/index.ts:529-531`, `apps/backend/.env.example`
- **Description:** `KYC_PROVIDER=local` brukes i dev og er sannsynlig fortsatt slik i prod inntil BankID-provider (Criipto/Signicat) er onboardet. Adapter eksisterer men er ikke aktivert.
- **Risk:** Spillere kan registrere seg med kun manuelle KYC (birthDate + nationalId) — ikke nok for Lotteritilsynet. Hvitvask-loven krever dokument-bevis.
- **Recommended fix:** Sett opp Criipto eller Signicat-konto, konfigurere BANKID_* env-vars i Render, bytt til `KYC_PROVIDER=bankid` for prod.
- **Effort:** 1-2 dev-dager (avhengig av provider-onboarding-tid).

#### P0-4: Hash-chain backfill for legacy wallet-rader mangler

- **Location:** `apps/backend/migrations/20260902000000_wallet_entries_hash_chain.sql` — kommentar sier backfill er ikke kjørt.
- **Description:** Pre-BIN-764 wallet-rader har `entry_hash IS NULL`. WalletAuditVerifier hopper over dem og rapporterer som `legacyUnhashed`. Vi har en gap-periode hvor manipulasjon ikke kan oppdages.
- **Risk:** Lotteritilsynet kan be om "vis hash-kjede for konto X for hele 2026" — for tidligere rader får de NULL-hash. Tamper-detection er retroaktivt avhengig av når BIN-764-deploy skjedde.
- **Recommended fix:** Kjør backfill-script som beregner og skriver `entry_hash` for alle pre-BIN-764-rader. Krever én-gangs nattlig job.
- **Effort:** 4-6 dev-timer (backfill + verify).

---

### P1 — Real-money launch blockers

#### P1-1: Org-num validering (norsk 9-siffer) mangler

- **Location:** `apps/backend/src/routes/adminOverskudd.ts:158`
- **Description:** `POST /api/admin/overskudd/organizations` aksepterer `organizationName + organizationAccountId` uten å sjekke at orgNumber er 9-siffer. OpenAPI-spec mentions `orgNumber` men implementasjonen har den ikke.
- **Risk:** Distribusjon kan gå til organisasjoner uten gyldig norsk org-nummer. Lotteritilsynet kan kreve at hver mottaker er identifisert med org-nummer.
- **Recommended fix:** Legg til 9-siffer regex-validering på `orgNumber`-felt i request-body.
- **Effort:** 1-2 dev-timer.

#### P1-2: Mandatory pause socket-event mangler

- **Location:** `apps/backend/src/game/BingoEnginePatternEval.ts:537, 719` (`finishPlaySession`-call uten socket-broadcast)
- **Description:** Når §66 mandatory pause utløses, mottar klienten ikke proaktivt event. Spilleren får først `PLAYER_REQUIRED_PAUSE`-error ved neste forsøk.
- **Risk:** UX-bug, ikke regulatorisk brudd. Men auditor kan spørre "kan spillere se proaktivt at de nærmer seg pause?" — i dag er svaret nei.
- **Recommended fix:** Legg til `mandatory-pause`-event i pattern-eval callbacks.
- **Effort:** 2-3 dev-timer.

#### P1-3: Manuell KYC mangler dokumentupload

- **Location:** `apps/backend/src/routes/auth.ts` (manual KYC verify endpoint)
- **Description:** Spiller kan kun sende tekstuell `birthDate + nationalId`. Mangler dokumentbevis.
- **Risk:** Hvitvask-loven krever dokument-bevis (pass, førerkort). Manuell KYC er for tynn for ekte spillere.
- **Recommended fix:** Legg til opplastings-endepunkt for KYC-dokumenter (S3 eller Cloudinary) + admin-UI for å se uploads.
- **Effort:** 2-3 dev-dager.

#### P1-4: GDPR self-service eksport mangler

- **Location:** Mangler endpoint
- **Description:** Spiller kan slette konto, men kan ikke laste ned egne data (GDPR Article 15 right of access).
- **Risk:** GDPR-klage hvis spiller ber om data og vi ikke kan levere på 30 dager.
- **Recommended fix:** Legg til `GET /api/players/me/gdpr-export` som returnerer JSON med all spiller-data (profile, wallet-history, audit-events).
- **Effort:** 1-2 dev-dager.

#### P1-5: Append-only DB-trigger mangler på `app_audit_log` og `app_rg_compliance_ledger`

- **Location:** `apps/backend/migrations/20260418160000_app_audit_log.sql`, `apps/backend/migrations/20260413000001_initial_schema.sql:374` (compliance ledger)
- **Description:** Tabellene har kommentar "immutable", men ingen DB-trigger som blokkerer UPDATE/DELETE/TRUNCATE. Kun service-laget garanterer immutability.
- **Risk:** En direkt-SQL-bruker (admin med DB-tilgang) kan endre/slette audit-rader. Tamper-resistance er ikke teknisk garantert.
- **Recommended fix:** Legg til trigger som matcher `app_regulatory_ledger`-pattern.
- **Effort:** 1 dev-dag.

#### P1-6: Data retention policy ikke dokumentert / ikke implementert

- **Location:** Mangler
- **Description:** Per hvitvask-lov og pengespillforskriften trenger vi typisk 7-års retention på finansielle data. Ingen policy er kodet eller dokumentert.
- **Risk:** Manglende dokumentasjon ved revisjon.
- **Recommended fix:** Dokumentere retention-policy i `docs/compliance/`. Implementer cleanup-job for data eldre enn N år (og dokumentere unntak for §71-rapporter som er forever).
- **Effort:** 1-2 dev-dager (policy + cleanup-job).

#### P1-7: ComplianceManager mutate-before-persist (4 metoder)

- **Location:** `apps/backend/src/game/ComplianceManager.ts` — 4 metoder per Code Review #5 P0-2
- **Description:** Muterer in-memory state FØR persistens. Hvis DB-write feiler, er in-memory og DB ute av sync.
- **Risk:** Ikke direkte regulatorisk problem, men kan skape inkonsistente state hvor compliance-rule blir feil håndhevet for én session.
- **Recommended fix:** Persist FØR in-memory mutation (rollback-friendly).
- **Effort:** 1-2 dev-dager.

#### P1-8: Lotteritilsynet-pakke (PDF-template + zip) mangler

- **Location:** Mangler
- **Description:** Auditor må kalle 5-7 endpoints for å få full historikk. Ingen "én knapp" som genererer en zip av alt regulatorisk for [periode X].
- **Risk:** Auditor-onboarding tar mye lengre tid. Hvis revisjons-frist er kort, har vi en presentasjons-bug.
- **Recommended fix:** Bygg `POST /api/admin/regulatory-package?startDate&endDate` som returnerer ZIP med:
  - Daily reports (CSV + PDF)
  - Regulatory ledger entries (CSV)
  - Hash-chain verifikasjon-rapport
  - Audit-log (CSV)
  - §11 distribusjons-batcher
- **Effort:** 2-3 dev-dager.

---

### P2 — Hardening / presentation polish

#### P2-1: Audit-log API har OFFSET-basert pagination

- **Location:** `apps/backend/src/routes/adminAuditLog.ts:138-156`
- **Description:** Henter `offset + limit + 1` rader og slicer client-side.
- **Risk:** For store datasets (>10k events) blir dette tregt.
- **Recommended fix:** Bruk cursor-basert pagination med `(created_at, id)`-tuple.
- **Effort:** 1 dev-dag.

#### P2-2: §11 distribusjon-rapport ikke automatisk generert

- **Location:** Mangler cron
- **Description:** Distribusjon-batcher må triggeres manuelt via admin.
- **Risk:** Hvis admin glemmer, går vi over månederlig grense uten distribusjon.
- **Recommended fix:** Legg til månedlig cron som genererer distribusjon-batch automatisk.
- **Effort:** 1-2 dev-dager.

#### P2-3: WalletAuditVerifier resultater ikke automatisk tilgjengelig

- **Location:** `apps/backend/src/jobs/walletAuditVerify.ts`
- **Description:** Job kjører nattlig, men resultater logges kun til console + audit-log. Ingen "siste 30 dagers verifikasjon-resultater"-endpoint.
- **Risk:** Auditor kan ikke se "har dere kjørt integrity-sjekk?" uten å lese audit-logs manuelt.
- **Recommended fix:** Legg til `GET /api/admin/wallet/audit-history?days=N`.
- **Effort:** 1 dev-dag.

#### P2-4: PDF-template for daily/monthly regulatory reports mangler

- **Location:** Mangler
- **Description:** JSON/CSV finnes, men ingen print-ready PDF som matcher en standard "månedsrapport per hall"-format.
- **Risk:** Auditor må manuelt formatere CSV-output til en presentabel rapport.
- **Recommended fix:** Lag PDF-template med PDFKit (samme stack som spillevett-rapport).
- **Effort:** 2-3 dev-dager.

#### P2-5: BankID-expiry-cron eksisterer men effekt er kun varsel

- **Location:** `apps/backend/src/jobs/bankIdExpiryReminder.ts`
- **Description:** Cron sender e-post til spillere med utløpende BankID. Mangler enforcement (blokker spill ved utløp).
- **Risk:** Spillere med utløpt BankID kan fortsatt spille.
- **Recommended fix:** Legg til enforcement i `assertWalletAllowedForGameplay()` for utløpte KYC.
- **Effort:** 1-2 dev-dager.

#### P2-6: KYC override audit-trail mangler "before/after-state"-diff

- **Location:** `apps/backend/src/routes/adminPlayers.ts:865-870`
- **Description:** `player.kyc.override` audit-event har action + reason, men ikke "fra X status til Y status".
- **Risk:** Auditor kan ikke se hva som ble overskrevet.
- **Recommended fix:** Legg til `previousStatus + newStatus` i details.
- **Effort:** 1-2 dev-timer.

#### P2-7: Demo Hall test-mode må aldri være på i prod

- **Location:** `apps/backend/src/game/BingoEnginePatternEval.ts:510-528`
- **Description:** Code-bypass av §66 for haller med `is_test_hall=true`. Pilot-trygt, men hvis flagget settes feil i prod, omgås §66.
- **Risk:** Catastrophic hvis admin setter `is_test_hall=true` på ekte hall.
- **Recommended fix:** Legg til prod-environment-sjekk: hvis `NODE_ENV=production` og `hall.is_test_hall=true`, alarmerer ops + krever ekstra confirmation.
- **Effort:** 2-3 dev-timer.

---

## Conclusion

### Pilot readiness

**Ja, for pilot UTEN ekte penger.** Hvis pilot kjører:
- Spill 1 (som har korrekt §11-klassifisering via `ledgerGameTypeForSlug`)
- Manuell KYC for sim-spillere
- Demo Hall test-mode for end-to-end-validering

Da er audit-readiness OK. Hash-chain, §23/§66/§71-enforcement og daglig regulatorisk hovedbok er på plass.

**Forutsetninger:**
1. Hash-chain backfill (P0-4) bør kjøres FØR pilot.
2. Soft-fail compliance-write (P0-2) er pilot-trygt fordi pilot ikke har ekte penger — men må lukkes før real-money.

### Real-money readiness gap

**Fire P0 må lukkes før real-money launch:**
1. §11-bug for Spill 2/3 + mini-games (6-10 dev-dager)
2. Compliance-ledger soft-fail med outbox-retry (1-2 dev-dager)
3. BankID-prod-konfig (1-2 dev-dager + provider-onboarding)
4. Hash-chain backfill (4-6 dev-timer)

**Pluss åtte P1-er** (~12-15 dev-dager) før vi har "audit-revisor-presentabel" plattform.

### Top 3 actions

1. **Lukk P0-1 (§11 Spill 2/3 + mini-games)** — bytt `"DATABINGO"` → `ledgerGameTypeForSlug(room.gameSlug)` i Game2Engine, Game3Engine, BingoEngineMiniGames + oppdater hall-balance-readout. Estimat: 6-10 dev-dager.

2. **Lukk P0-2 (compliance soft-fail)** — implementer outbox-retry for compliance-ledger-write. Mønster fra `WalletOutboxWorker` kan gjenbrukes. Estimat: 1-2 dev-dager.

3. **Lukk P0-3 (BankID-prod-konfig)** — onboard Criipto eller Signicat, konfigurere env-vars, test e2e-flyt med ekte BankID. Estimat: 1-2 dev-dager + provider-onboarding (typisk 1-2 uker).

Etter disse tre er vi audit-presentabel for real-money launch (med P1+P2 som hardening-bølger post-launch).

---

**Skrevet:** 2026-04-28
**Audit-formål:** Underlag for pilot-blocker triage
**Begrenset omfang:** Read-only kode-gjennomgang. Ingen runtime-tester, ingen pen-test, ingen formell juridisk vurdering.
