# Pilot Smoke-Test Sjekkliste — Spillorama 2026-04-28

**Formål:** End-to-end-sjekkliste for **simulert pilot-dag** med 4 haller i samme group. Brukes av bingoverter under dress-rehearsal og selve pilot-dagen.

**Basert på:** `MASTER_PLAN_SPILL1_PILOT_2026-04-24.md` §6 + audit-funn fra 2026-04-28 + Bølge 2A pilot-blocker-fix (PR-er pending).

**Scope:** Spill 1 only. Spill 2/3 er deferred til Bølge 2 post-pilot (bekreftet av Tobias 2026-04-28).

**Forutsetninger:**
- Bølge 2A er merget (PIXI-P0-001/002/003, SEC-P0-001/002/003, FE-P0-005)
- Bølge 2B er merget (DB DDL-fix, pool-consolidation, Modal a11y, XSS, hall-context, compliance-outbox)
- 4 simulerte haller satt opp i en `group_of_halls`
- Demo Hall test-flag `is_test_hall=true` på minst én av hallene for safety-net

---

## Pre-pilot-sjekk (kvelden før pilot-dag)

### Infrastruktur

- [ ] Render backend: `/health` returnerer 200
- [ ] Render dashboard: ingen crashed/restarting services
- [ ] Postgres: connection-count godt under limit (sjekk DB-P0-002 fix er aktiv)
- [ ] Redis: tilgjengelig, ingen lagging-warnings
- [ ] DNS: `spillorama-system.onrender.com` løser opp
- [ ] CDN/admin-web: laster, ingen 5xx

### Hall-konfigurasjon

- [ ] 4 haller registrert i `app_halls` med riktig `hall_number` (101-104 e.l.)
- [ ] Alle 4 haller satt med `is_active=true`
- [ ] Group-of-halls opprettet, alle 4 haller tilordnet
- [ ] Master-hall valgt og bekreftet
- [ ] Hver hall har minst én `app_terminals`-rad
- [ ] TV-token (`tv_token`) generert for hver hall

### Agent-onboarding

- [ ] Minst 4 agenter opprettet (én per hall) med `role=AGENT`, `agent_status=active`
- [ ] Hver agent tilordnet riktig hall (`agent_hall_assignments`)
- [ ] Master-hall-agent identifisert
- [ ] Agent-passord delt på sikker kanal
- [ ] Agent kan logge inn på `/agent` og se sitt dashboard

### Schedule-oppsett

- [ ] Spilleplan opprettet for pilot-dag (`app_schedules`)
- [ ] Sub-games definert med riktig start/end-tid + ticket-priser per farge
- [ ] Pattern-priser satt (Row 1, 2, 3, 4, Full House) per ticket-farge
- [ ] Schedule-status: ACTIVE
- [ ] Validering: `app_pilot_critical_routes` checklist passes

### Compliance & sikkerhet

- [ ] §11-distribusjon: konfirmer hovedspill = 15% (Spill 1 — ikke databingo)
- [ ] §66 mandatory-pause: konfigurert til 60 min (BINGO_PLAY_SESSION_LIMIT_MS)
- [ ] §23 self-exclusion: testet med dummy-spiller (skal blokkere kjøp)
- [ ] §71 multi-hall actor-binding: bekreft compliance-ledger får riktig `actor_hall_id` på cross-hall kjøp
- [ ] Pre-pilot security-scan: ingen nye CVE i `npm audit` (post Bølge 2A SEC-P0-003)
- [ ] Cross-hall socket-scope: bekreft HALL_OPERATOR fra hall A IKKE kan pause hall B (post Bølge 2A SEC-P0-001)

### Frontend

- [ ] Admin-web åpner uten console-errors i browser
- [ ] `/admin/ops` ops-console laster, viser alle 4 haller
- [ ] AdminOps live-update fungerer uten heap-leak (test 30 min pålogget) — post FE-P0-005
- [ ] Modal-fokus-trap fungerer (Escape lukker, Tab er sirkulær) — post FE-P0-001
- [ ] Pixi game-client: starter uten blink, runner stabilt 60 fps — post PIXI-P0-001

---

## Pilot-dag — 08:00 Skift-start

### Per agent (kjør på hver av 4 haller)

- [ ] Agent logger inn på terminal med sitt agent-id
- [ ] Sjekk: dashboard viser riktig hall-navn
- [ ] Sjekk: cash-balance, daily-balance vises korrekt (start: 0)
- [ ] Åpner skift via "Add Daily Balance" — entrer starting cash (f.eks. 5000 kr)
- [ ] `app_agent_shifts`-rad opprettet med `is_active=true`, `daily_balance=5000`
- [ ] Sjekk: dashboard reflekterer ny daily-balance
- [ ] Sjekk planlagte spill for dagen vises korrekt

### Master-hall-agent ekstra-sjekk

- [ ] Master-hall-agent ser "Are You Ready?" / "Start Next Game"-knapp
- [ ] Andre 3 hall-agenter ser kun "Ready"-knapp (ikke start-knapp)

---

## 09:00 Pre-spill bong-registrering

### Per agent

- [ ] Åpner "Register More Tickets"-modal
- [ ] Scanner Initial+Final ID for **Small Yellow** (f.eks. 1-100)
- [ ] Scanner Initial+Final ID for **Small White** (101-200)
- [ ] Scanner for **Large Yellow** (201-300)
- [ ] Scanner for **Large White** (301-400)
- [ ] Scanner for **Small Purple** (401-500)
- [ ] Scanner for **Large Purple** (501-600)
- [ ] Sjekk: F2-hotkey åpner modal raskt
- [ ] Sjekk: Stash-listing oppdateres etter hver scan
- [ ] Sjekk: Validering hindrer overlapping ranges
- [ ] Submit registrerer alle tickets i `app_physical_tickets` med `status=UNSOLD`

---

## 10:00 Første spill starter

### Pre-spill: Spillere kjøper tickets

**Fysiske tickets (per terminal):**
- [ ] Spiller kommer til terminal med fysisk ticket (Small Yellow #5)
- [ ] Agent åpner "Sell Physical Ticket" / "Add Money — Unique ID"
- [ ] Scanner ticket-ID
- [ ] Velger payment: Cash → ticket markeres `SOLD`
- [ ] Cash-balance på shift øker
- [ ] Sjekk: `app_agent_transactions`-rad opprettet

**Online wallet (per spiller):**
- [ ] Spiller logger inn på `/web/`
- [ ] Top-up wallet via `/api/wallet/me/topup` (testbeløp)
- [ ] Velger spill-rom for Spill 1
- [ ] Kjøper ticket via socket-event → debit på wallet
- [ ] Sjekk compliance-ledger: `actor_hall_id` matcher hallen spilleren er i (§71)

**Unique ID (prepaid):**
- [ ] Agent oppretter Unique ID via "Create New Unique ID" (200 kr balance)
- [ ] Spiller bruker Unique ID til å kjøpe ticket
- [ ] Sjekk: balance trekkes fra Unique ID, ikke fra spiller-wallet

### Master starter spillet

- [ ] Master-hall-agent klikker "Start Next Game"
- [ ] Ready-popup viser per-agent-status (post Master-Plan §2.4 fix — TBD bølge 2B)
- [ ] Hvis noen agenter ikke ready: "Agents not ready: X, Y" vises
- [ ] Når alle ready: Jackpot-confirm popup hvis aktuelt
- [ ] 2-min countdown broadcastes til alle 4 haller
- [ ] Spilleren ser countdown i UI

### Draw starter

- [ ] Server begynner å trekke baller (1.2s tick)
- [ ] Hver ball broadcastes til alle 4 haller via socket
- [ ] Spillerne ser ballen tonet inn i CenterBall (no blink — post PIXI-P0-001)
- [ ] BallTube viser kø av siste 5 baller
- [ ] Bingoverten ser draw-progresjon i terminal

### Mønster-utdeling

- [ ] Spiller treffer Rad 1 → modal "Du har vunnet!" + lyd
- [ ] Backend logger payout i `app_compliance_ledger` med riktig `gameType=MAIN_GAME`
- [ ] Andre haller får same broadcast (winner-display)
- [ ] §11-distribusjon: 15% til org-konto, resten til player-wallet
- [ ] Same flow for Rad 2, 3, 4
- [ ] Full Hus → spillet ender automatisk
- [ ] WinScreen vises uten freeze eller blink

### Mini-game (rotasjon: Wheel/Chest/Mystery/ColorDraft)

- [ ] Mini-game trigger som forventet (etter draw N eller på pattern)
- [ ] Spiller får interaksjon (klikk på Wheel etc.)
- [ ] **KRITISK**: hvis spiller klikker midt i mini-game og spillet ender — choice tapes IKKE silent (post PIXI-P0-002)
- [ ] Reward beregnes og deles ut
- [ ] Mini-game-overlay forsvinner etter cleanup

### Innsatsen pot (hvis aktuelt)

- [ ] Pot vokser ved hvert kjøp (per Game1ScheduleTickService)
- [ ] Når trigger-betingelse oppfylles: pot utbetales
- [ ] Compliance-ledger får egen entry for pot-utdeling

---

## 10:30 Vinner henter premie (Check for Bingo)

### Cash-out fysisk ticket

- [ ] Spiller med vinnende ticket går til terminal
- [ ] Agent klikker "PAUSE Game and check for Bingo"
- [ ] Modal: "Enter Ticket Number" → agent skanner/skriver inn ticket
- [ ] GO → 5×5-grid popup viser ticket med vinnende pattern highlightet
- [ ] Status per pattern: "Cashout" / "Rewarded"
- [ ] "Reward All"-knapp utbetaler alle pending
- [ ] Eller per-ticket: cash-out til vinner manuelt
- [ ] `app_physical_tickets.status` oppdateres
- [ ] Cash-balance på shift trekkes fra (cash ut)
- [ ] `app_agent_transactions`-rad opprettet med `kind=CASH_OUT`

### Online winner

- [ ] Online vinner får automatic credit til `app_wallets`
- [ ] Spiller ser ny balance i UI
- [ ] Compliance-ledger oppdatert
- [ ] Audit-trail har hash-chain-link

---

## Underveis (10:00-22:00)

### Kaffe-salg / produkt-salg

- [ ] Agent åpner "Sell Products" på terminal
- [ ] Velger produkt (kaffe, bolle etc.) + kvantum
- [ ] Total-summen korrekt
- [ ] Velger payment (Cash/Card)
- [ ] Cash-balance på shift øker
- [ ] `app_agent_orders` + `app_agent_order_lines` opprettet

### Add Money / Withdraw

**Cash-spillere:**
- [ ] Add Money: cash-out fra agent's drawer → spiller-wallet ELLER ny Unique ID
- [ ] Withdraw: spiller henter cash, agent debit-erer wallet, cash-balance på shift øker

**Online-spillere:**
- [ ] Top-up via Swedbank (test-mode hvis pilot)
- [ ] Withdraw til bank (kun via /admin)

### Hall-bytte (sjekk shell + Unity-broen)

- [ ] Spiller bytter hall i shell
- [ ] Backend henter ny compliance for ny hallId
- [ ] Spillevett-data oppdateres
- [ ] Unity (hvis aktivt) får `SetActiveHall(nyHallId, nyHallName)`
- [ ] Spillet kobler til ny hall-kontekst

### Spillvett-flyt

**Daglig tapsgrense:**
- [ ] Spiller treffer 80% av daglig grense → proaktiv warning
- [ ] Treffer 100% → spillknapper deaktivert, Spillvett-modal vises
- [ ] §66 60-min spilling → mandatory-pause-modal (5 min)
- [ ] Modal har focus-trap (post FE-P0-001) — Tab forblir i modalen, Escape virker

**Self-exclusion (§23):**
- [ ] Spiller aktiverer 1-års self-exclusion
- [ ] Backend lagrer `restrictions.selfExclusionUntil`
- [ ] Spiller forsøker å kjøpe ticket → REST/socket gate avviser (PR #687)
- [ ] Spiller logger ut og inn igjen → fortsatt blokkert

---

## Flere runder (11:00, 13:00, 15:00, 17:00, 19:00, 21:00)

Per runde, kjør samme flyt som 10:00. Spesielt sjekk:

- [ ] Master-hall starter neste runde uten henging
- [ ] Per-agent ready-state oppdateres korrekt mellom runder
- [ ] Wallet-balance vises riktig (no saldo-flash post PR #694)
- [ ] Compliance-ledger har én entry per kjøp, ingen dobbeltrader (post PR #685)
- [ ] Hvis Render redeploy skjer midt i pilot: wallet-writes freezer IKKE flere sekunder (post DB-P0-001 fix)

---

## 22:00 Skift-slutt

### Per agent

- [ ] Agent åpner "Physical Cashout" — alle pending tickets vises
- [ ] "Reward All" utbetaler alle pending vinninger
- [ ] Agent klikker "Control Daily Balance"
- [ ] System sammenligner forventet kontant vs faktisk
- [ ] Hvis match: OK
- [ ] Hvis avvik > 10 kr: agent må forklare i merknad
- [ ] Settlement-flyt: Metronia/OK Bingo/Franco/Otium IN/OUT (hvis aktuelt)
- [ ] Norsk Tipping/Rikstoto-tall manuelt
- [ ] Rekvisita, Servering, Bilag, Bank, Gevinst overført, Annet
- [ ] Drop-safe inn/ut
- [ ] Submit settlement → `app_agent_settlements`-rad opprettet
- [ ] Agent klikker "Shift Log Out"
- [ ] Confirm-popup: "Distribute winnings to physical players" + "Transfer register ticket to next agent"
- [ ] `app_agent_shifts.is_active=false`, shift lukket
- [ ] Cash-balance, daily-balance arkiveres

### Master / admin

- [ ] Daily report kjøres (`POST /api/admin/reports/daily/run`)
- [ ] Sjekk: report aggregerer riktig på tvers av 4 haller
- [ ] §11-distribusjon: 15% til org-konto for hovedspill, ingen 30% for Spill 1 (post COMP-P0-001 audit-validation, ikke fix)
- [ ] Settlement-rapport per hall via admin
- [ ] Withdraw-XML eksporteres til regnskap (hvis aktuelt)

---

## Multi-hall sjekkliste (kjør parallelt på alle 4 haller)

- [ ] Alle 4 haller signerer "Ready" før master starter
- [ ] Spill kjører synkront på alle 4 haller
- [ ] Compliance-ledger binder hvert salg til riktig `actor_hall_id` (§71-validering)
- [ ] HALL_OPERATOR fra hall A kan IKKE pause/end-game på hall B via socket (post SEC-P0-001 fix)
- [ ] Per-hall payout-cap flagger før negativ balanse (TBD — i bølge 2B?)
- [ ] Hvis master-hall blir offline: `transferHallAccess` runtime-handover fungerer (TBD — i bølge 2B/3?)

---

## Performance / stability targets

- [ ] **Backend response-time:** p95 < 500 ms på alle REST endpoints
- [ ] **Socket-latency:** draw-broadcast < 200 ms til alle 4 haller
- [ ] **Pixi rendering:** stabil 60 fps, ingen blink (post PIXI-P0-001)
- [ ] **AdminOps memory:** < 200 MB heap etter 8 timer (post FE-P0-005)
- [ ] **DB connections:** total < 80 (post DB-P0-002)
- [ ] **Cold-boot recovery:** < 30s wallet-write delay etter Render redeploy (post DB-P0-001)

---

## Hvis noe går galt

### Feil-håndtering

| Symptom | Mistenkt årsak | Tiltak |
|---|---|---|
| HTTP 502/503 | Render kald boot | Vent 30-60s |
| HTTP 200 men HTML | Endpoint mangler wire-up | Sjekk `apps/backend/src/index.ts` |
| "Player allerede i rom" | Stale state | Admin: clear-stuck-room endpoint |
| No-winnings | GameManagement config_json mode feil | Sjekk skal være "fixed" |
| Wallet-write freeze etter deploy | Boot-DDL ikke fikset | Verifiser DB-P0-001 fix er live |
| Cross-hall pause skjer | SEC-P0-001 ikke fikset | Eskaler umiddelbart |
| Blink i game-client | PIXI-P0-001 stopgap ikke aktiv | Sjekk `app.ticker.maxFPS=60` i deployed bundle |

### Rollback-protokoll

1. Identifiser om problem er kode-relatert (ny PR) eller infrastruktur
2. Hvis kode: Render dashboard → "Redeploy previous"
3. Hvis infra: kontakt Render support
4. Pause pilot, dokumenter symptomer, fortsett etter rollback

### Eskalerings-kanal

- **L1**: PM (denne ny PM eller Tobias)
- **L2**: PM ringer/melder Tobias direkte
- **L3**: Pause hele pilot, samle data, post-mortem

---

## Etter pilot-dag (kveld)

- [ ] Eksporter alle audit-logs for pilot-dagen
- [ ] Sjekk hash-chain-integritet (BIN-764)
- [ ] Generer §11-distribusjons-rapport, valider %er
- [ ] Sjekk Render-logs for warnings/errors
- [ ] Notér alle bugs / friksjon-punkter
- [ ] Retro-møte: hva fungerte, hva ikke, hva må fikses før neste pilot-dag eller før real-money-launch

---

## Referanser

- `docs/architecture/MASTER_PLAN_SPILL1_PILOT_2026-04-24.md` (master pilot-plan)
- `docs/audit/PILOT_BLOCKER_TRIAGE_2026-04-28.md` (P0 backlog)
- `docs/audit/SECURITY_AUDIT_2026-04-28.md`
- `docs/audit/COMPLIANCE_READINESS_AUDIT_2026-04-28.md`
- `docs/audit/GAME_CLIENT_PIXI_AUDIT_2026-04-28.md`
- `docs/operations/PM_HANDOFF_2026-04-23.md` (legacy PM-rutiner)

---

## Endringslogg

- 2026-04-28 22:30 — opprettet (basert på MASTER_PLAN §6 + audit-funn)
- *Neste: oppdater etter Bølge 2A merger med faktisk verifikasjon-status*
