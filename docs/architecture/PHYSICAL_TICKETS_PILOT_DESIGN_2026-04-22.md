# Fysiske bonger i pilot — gap-analyse + scope-plan

**Dato:** 2026-04-22
**Forfatter:** Research-agent under PM (Claude Opus 4.7)
**Status:** Design-forslag, venter PM-review
**Bygger på:** [`GAME1_PR4E_ADMIN_POLISH_PILOT_QA_DESIGN_2026-04-22.md`](./GAME1_PR4E_ADMIN_POLISH_PILOT_QA_DESIGN_2026-04-22.md), GAME1_SCHEDULE PR 4a/4b, BIN-587 B4a/B4b, BIN-638/639/640/641/648/698
**Ingen kode-endring** — kun research + gap-analyse.

---

## 1. Executive summary

Spillorama har allerede bygget store deler av fysisk-bong-domenet (BIN-587 B4a+B4b, BIN-638/639/640/641/648/698). Infrastrukturen for batch-opprettelse, pre-generering av unique-IDs, salg, cashout, bulk reward-all, aggregat-rapporter og selve vinn-verifikasjonen (check-bingo mot drawn numbers) er **merget til main og testdekket**.

Fire vesentlige gaps blokkerer at Tobias' 7-punkts-kravliste kan kjøres i pilot:

1. **Anonym cash-salg mangler i agent-flyten** — `AgentTransactionService.sellPhysicalTicket` krever `playerUserId`; pilot trenger en "walk-in"-path uten bruker-konto.
2. **Numbers-pre-loading mangler** — `generateTickets` lagrer bare unique-ID-range, ikke tallene på papiret. Tobias sier "alle bongene er allerede scannet inn" — modern backend forutsetter i dag at tall kommer inn ved første check-bingo.
3. **Real-time vinn-varsel til bingovert mangler** — `Game1DrawEngineService.evaluateAndPayoutPhase` leser kun `app_game1_ticket_assignments` (digitale), ikke `app_physical_tickets`. Socket-namespace `/admin-game1` sender ingen `physical_winner_suspected`-event. Bingovert har ingen "en eller annen fysisk vinner finnes, scan for å verifisere"-trigger.
4. **Admin kunngjør ikke fase-vinn i UI før check-bingo** — eksisterende CheckBingoPage er en manuell "skriv inn 25 tall"-side; for pilot trenger bingovert et dashboard som viser "fase X nettopp trukket — scan eventuelle ropte bonger".

Totalestimat: **~5-7 dager** spredt over 4 sub-PRs for å lukke pilot-gapene. Post-pilot-forbedringer (OCR-scanner, barcode-rik papir-billett, e-regnskap-integrasjon) er utelatt fra pilot-scope.

---

## 2. Nåværende tilstand — eksisterende implementasjon

### 2.1 Datamodell (merget til main)

| Tabell | Migrasjon | Formål |
|---|---|---|
| `app_physical_ticket_batches` | `20260418230000_physical_tickets.sql` | Range-basert batch (range_start/end, default_price_cents, assigned_game_id). Status DRAFT/ACTIVE/CLOSED. |
| `app_physical_tickets` | `20260418230000_physical_tickets.sql` | Én rad per unique-ID. Status UNSOLD/SOLD/VOIDED. Kolonner: price_cents (NULL=bruk batch-default), assigned_game_id, sold_at, sold_by, buyer_user_id, voided_at/by/reason. |
| (+ BIN-698-kolonner) | `20260427000100_physical_ticket_win_data.sql` | numbers_json, pattern_won, won_amount_cents, evaluated_at, is_winning_distributed, winning_distributed_at. Alle NULL før første BIN-641-check-bingo. |
| `app_physical_ticket_cashouts` | `20260427000000_physical_ticket_cashouts.sql` | Én rad per utbetaling. UNIQUE(ticket_unique_id) ⇒ idempotens. |
| `app_physical_ticket_batch_transfers` | `20260420000100_physical_ticket_transfers.sql` | Cross-hall-flytt-audit. |
| FK til `app_game1_scheduled_games` | `20260430000100_physical_tickets_scheduled_game_fk.sql` | `assigned_game_id` → `app_game1_scheduled_games(id)` NOT VALID (legacy-kompatibilitet). |

### 2.2 Backend-endepunkter (merget)

| Rute | Fil | Rolle |
|---|---|---|
| `POST/GET/PUT/DELETE /api/admin/physical-tickets/batches` | `apps/backend/src/routes/adminPhysicalTickets.ts` | Batch-CRUD. Permisjon `PHYSICAL_TICKET_WRITE`. |
| `POST /api/admin/physical-tickets/batches/:id/generate` | samme fil | Materialiserer unique-IDs som UNSOLD-rader. |
| `POST /api/admin/physical-tickets/batches/:id/assign-game` | samme fil | Knytter batch til `scheduled_game_id`. |
| `POST /api/admin/physical-tickets/batches/:id/transfer-hall` | samme fil | Cross-hall-flytt (ADMIN-only). |
| `POST /api/admin/physical-tickets/:uniqueId/cashout` | samme fil (BIN-640) | Registrerer utbetaling. |
| `POST /api/admin/physical-tickets/:uniqueId/check-bingo` | `apps/backend/src/routes/adminPhysicalTicketCheckBingo.ts` (BIN-641) | Sjekker 25 tall mot drawn numbers, stempler numbers_json + pattern_won. |
| `POST /api/admin/physical-tickets/reward-all` | `apps/backend/src/routes/adminPhysicalTicketsRewardAll.ts` (BIN-639) | Bulk-utbetaling basert på stemplede vinnere. |
| `GET /api/admin/physical-tickets/games/in-hall` | `apps/backend/src/routes/adminPhysicalTicketsGamesInHall.ts` (BIN-638) | Per-hall-aggregat: sold/pending/cashedOut per game. |
| `GET /api/admin/reports/physical-tickets/aggregate` | `apps/backend/src/routes/adminReportsPhysicalTickets.ts` (BIN-648) | Rapport per (gameId, hallId). |
| `GET/POST /api/admin/unique-ids/...` | `apps/backend/src/routes/adminUniqueIdsAndPayouts.ts` (BIN-587 B4b) | Unique-ID-management + payout drill-down. |

### 2.3 Domene-tjenester (merget)

- `apps/backend/src/compliance/PhysicalTicketService.ts` — kjerneservice: listBatches/createBatch/updateBatch/deleteBatch/generateTickets/assignBatchToGame/markSold/findByUniqueId/recordCashout/stampWinData/rewardAll/transferBatchToHall.
- `apps/backend/src/admin/PhysicalTicketsAggregate.ts` + `PhysicalTicketsGamesInHall.ts` — read-only aggregater.
- `apps/backend/src/agent/AgentTransactionService.ts` — `sellPhysicalTicket(input)` har fullstendig salgs-flyt med wallet-hook + purchase-cutoff-guard.

### 2.4 Admin-web-UI (merget)

| Side | Fil | Status |
|---|---|---|
| Add batch + generate | `apps/admin-web/src/pages/physical-tickets/AddPage.ts` | Live — batch-CRUD + generate-knapp. |
| Game ticket list + reward-all | `apps/admin-web/src/pages/physical-tickets/GameTicketListPage.ts` | Live — BIN-638+BIN-639 wiring. |
| Cashout single | `apps/admin-web/src/pages/physical-tickets/CashOutPage.ts` | Live — BIN-640. |
| Check-bingo (manuell) | `apps/admin-web/src/pages/physical-tickets/CheckBingoPage.ts` | Live — BIN-641 wiring. Operator taster inn unique-ID + gameId + 25 tall. |
| Agent-shift cashout-list | `apps/admin-web/src/pages/cash-inout/PhysicalCashoutPage.ts` | Live — legacy agent-view port. |
| BarcodeScanner | `apps/admin-web/src/components/BarcodeScanner.ts` | Live — USB-scanner-lytter (minLength 22, ticket-ID sits 14..20). |

---

## 3. Gap-analyse mot Tobias' 7 krav

| # | Krav | Dekning | Gap |
|---|---|---|---|
| 1 | Bingovert selger fysiske bonger (papir) i hallen mot **kontant** betaling | **Delvis** — `AgentTransactionService.sellPhysicalTicket` støtter `paymentMethod: "CASH"`. Transaksjon lagres i `app_agent_transactions`. | `playerUserId` er påkrevd — ingen "walk-in" path. Se krav 2. |
| 2 | Spilleren er **IKKE registrert digitalt** (ingen konto) | **Ikke dekket** — `sellPhysicalTicket` forutsetter `playerUserId` + wallet-check. `requirePlayerInHall(playerUserId, hallId)` kaster hvis spilleren ikke finnes. | Må introdusere anonym-salg-path: enten (a) system-bruker "anonymous-hall-<hallId>" som buyer, eller (b) ny endpoint-variant `sellPhysicalTicketAnonymous` som setter `buyer_user_id = NULL`. Alternativ (b) er renere — database-kolonnen er allerede nullable. |
| 3 | Alle fysiske bonger har nummer-serie — alle bongene er allerede "scannet inn" i systemet på forhånd | **Delvis** — `generateTickets(batchId)` lager én `app_physical_tickets`-rad per unique-ID i range. | **Tallene på papiret lagres IKKE** ved generering. `numbers_json` settes først ved første BIN-641-check-bingo-kall (stamping). Tobias' krav tolkes som "systemet skal kjenne tallene på forhånd"; ellers kan systemet ikke detektere vinn uten at agent scanner+taster inn tall. Må velge (a) pre-stamp ved generate (krever CSV-upload eller prosedyre-generering av tall-grid) eller (b) aksepter at pilot kjører med "agent-tastet-inn-ved-check" (dagens BIN-641-modell). |
| 4 | Systemet vet om alle bongene (som digitale, bare uten bruker-konto) | **Delvis** — alle unique-IDs finnes i DB etter `generateTickets`. Aggregat/reports gir oversikt per game + hall. | Som krav 3 — hvis "vet om" inkluderer tallene, er det ikke dekket. |
| 5 | Scan for vinn-verifikasjon | **Delvis** — BIN-641 `POST /check-bingo` sjekker numbers[] mot drawnNumbers og returnerer vinnende pattern. BarcodeScanner-komponent finnes og brukes i `SellTicketPage` (admin-web). | CheckBingoPage bruker ikke BarcodeScanner i dag — operator taster manuelt. Ingen barcode→numbers-lookup fordi tallene ikke er pre-loaded (se krav 3). |
| 6 | Varsel til bingovert når systemet oppdager at en fysisk bong har vunnet | **Ikke dekket** — `Game1DrawEngineService.evaluateAndPayoutPhase` iterer kun `app_game1_ticket_assignments` (digitale). Ingen `/admin-game1`-socket-event om "fysisk bong har mulig vunnet". Bingovert får ingen varsling — må selv sjekke bong etter at spiller roper "bingo". | Må enten (a) utvide draw-engine til å scanne `app_physical_tickets WHERE assigned_game_id=$1 AND status=SOLD AND numbers_json IS NOT NULL` parallelt med digitale (krever pre-loading fra krav 3) eller (b) aksepter "ropt-bingo"-flyt: spiller roper, agent scanner bong, BIN-641 verifiserer. Alternativ (b) matcher legacy-semantikk mer og unngår pre-loading-kravet. |
| 7 | Kontant-utbetaling | **Dekket** — BIN-640 `POST /cashout` + `app_physical_ticket_cashouts` + audit-log `admin.physical_ticket.cashout`. BIN-639 `reward-all` for bulk. UI-siden `CashOutPage` + `GameTicketListPage` har dette live. | Ingen gap i funksjonalitet. Åpent spørsmål: **hvordan dokumenteres kontantbevegelsen regulatorisk** utover audit-log (se §8). |

---

## 4. Pilot-relevante gaps vs post-pilot

### 4.1 Må fikses før pilot

- **G1** (pilot-kritisk) — Anonymous cash-salg-path. Uten dette kan ikke bingovert selge bonger til walk-in-spillere.
- **G2** (pilot-kritisk) — Real-time vinn-varsel til bingovert. Bingovert må få *eller se* at et fysisk vinn er mulig i hallen akkurat når fase trekkes, eller pilot må følge "ropt-bingo"-flyt som pålegger operatøren å bevisst sjekke hver gang en spiller roper.
- **G3** (pilot-kritisk) — Check-bingo-UI må være enklere enn manuelt inntasting av 25 tall. Enten barcode-scan-integrasjon (krever pre-loading) eller et raskt fase-vinn-dashboard med forkortet innskriving.

### 4.2 Kan utsettes til post-pilot

- **G4** (post-pilot) — Pre-loading av numbers per unique-ID (krav 3/4-utvidelse). Muliggjør scan→auto-verify uten tast. Krever CSV-import eller prosedyre-generering; ikke nødvendig hvis pilot kjører "ropt-bingo"-flyt med manual-entry fallback.
- **G5** (post-pilot) — Draw-engine-integrert fysisk-vinn-detekt (krever G4). Gir bingovert samme real-time opplevelse som digital.
- **G6** (post-pilot) — OCR av papirbong (ikke vurdert), avansert fraud-detection (ticket-signatur, QR-kode-kryptering).
- **G7** (post-pilot) — Regnskap-eksport av cashout-transaksjoner (utover audit-log — se §8).

---

## 5. Sub-PR-struktur for pilot-gap-lukking

### PR-PT1: Anonymous cash-salg-path (~1 dag)

**Mål:** Bingovert kan selge fysisk bong med kontant betaling uten at kunden er registrert bruker.

**Endringer:**
- `apps/backend/src/agent/AgentTransactionService.ts` — introduser `SellPhysicalAnonymousInput` og `sellPhysicalTicketAnonymous(input)`-variant som setter `buyer_user_id = NULL` og hopper over wallet-check. Deler `markSold` + `requireActiveShift` + `purchaseCutoff`-guard med dagens flyt. Logger `agent.physical_ticket.sold_anonymous` i audit.
- `apps/backend/src/routes/agentTransactions.ts` — ny endepunkt-variant `POST /api/agent/physical-tickets/sell-anonymous` (eller flagg på eksisterende endepunkt — TBD i PR).
- `apps/backend/migrations/` — ingen skjema-endring nødvendig (`buyer_user_id` er allerede NULL-kompatibel).
- `apps/admin-web/src/pages/cash-inout/SellTicketPage.ts` — sjekkbox "anonym spiller (walk-in)" som skjuler player-lookup og sender til anonymous-endpointet.
- Tester: `AgentTransactionService.test.ts` + E2E cash-sale-scenario.

**Avhengighet:** Ingen.

### PR-PT2: Check-bingo barcode-scanner + numbers manual-fallback (~1 dag)

**Mål:** Bingovert kan scanne bong → unique-ID fylles ut → operator taster 25 tall kun som backup.

**Endringer:**
- `apps/admin-web/src/pages/physical-tickets/CheckBingoPage.ts` — integrer `attachBarcodeScanner` på `#cb-uniqueId`-input (samme mønster som `SellTicketPage`). Etter scan-success: auto-fokus første number-cell.
- UX-forbedring: vis `drawnNumbersCount` + "Aktiv fase: X" i real-time (hent gameStatus hvert 2. sek hvis ikke socket-subscribing).
- **Valgfritt i samme PR:** hvis `numbers_json` allerede er stemplet (operator scanner bong nr. 2 gang), pre-fyll tall-felt og skjul dem — operator trykker bare "Sjekk på nytt" for å re-evaluere mot nyere drawn-numbers.
- Tester: `apps/admin-web/tests/checkBingoPage.test.ts`.

**Avhengighet:** Ingen (kan kjøre parallelt med PR-PT1).

### PR-PT3: Fysisk-vinn-dashboard for bingovert (~2 dager)

**Mål:** Gi bingovert et real-time bilde av "hva er trukket i fase X, skal noen scanne en papirbong?" uten å måtte konsultere master-konsollet.

**Endringer:**
- Ny admin-web-side `apps/admin-web/src/pages/physical-tickets/HallLiveDashboardPage.ts` scoped til én hall + ett scheduled_game.
- Real-time-lytting på eksisterende `/admin-game1`-socket: viser current phase (1-5), drawn numbers, og per-hall "solgte fysiske bonger" fra BIN-638-aggregat + "sjekket sist" fra stamped `evaluated_at`.
- "Scan bong nå"-knapp som hopper til `CheckBingoPage` med pre-fylt `gameId`.
- Varsler (Toast / soft-beep) hver gang en fase avsluttes: "Fase X stengt. Sjekk eventuelle ropte bonger."
- Minimal backend-endring — gjenbruker BIN-638 + `/admin-game1`-eksisterende eventer.
- Tester: `HallLiveDashboardPage.test.ts` + socket-mock.

**Avhengighet:** PR-PT2 (check-bingo-UI må støtte barcode før dashboard hopper inn).

### PR-PT4: Pilot-runbook + regulatorisk cashout-dok (~1 dag)

**Mål:** Dokumentere kontant-flyt for pengespill-compliance; dokument + runbook for bingovert.

**Endringer:**
- `docs/qa/PILOT_PHYSICAL_TICKETS_RUNBOOK_2026-XX-XX.md` — trinn-for-trinn-prosedyre:
  1. Admin oppretter batch + generate + assign til scheduled_game.
  2. Bingovert signer inn + åpner shift.
  3. Bingovert åpner HallLiveDashboardPage (PR-PT3).
  4. Bingovert selger bonger (PR-PT1 anonymous-path) ved cash.
  5. Når fase trekkes: dashboard varsler "sjekk ropte bonger".
  6. Bingovert scanner bong → CheckBingoPage → verifiserer vinn.
  7. Ved vinn: CashOutPage → registrerer utbetaling + teller opp fra hall-kassen.
  8. Ved spill-slutt: BIN-648-rapport for hall-oppgjør.
- `docs/compliance/PHYSICAL_TICKET_CASH_FLOW_AUDIT_2026-XX-XX.md` — regulatorisk redegjørelse:
  - Kontant-bevegelse spores via `app_physical_ticket_cashouts` + `app_audit_log` (`admin.physical_ticket.cashout`).
  - Salgs-transaksjon spores via `app_agent_transactions`.
  - Cash-balanse pr hall spores av eksisterende hall-shift-oppgjør (cash-inout-flyt).
  - Pengespillforskriften §64 + §65 — svar på spørsmål fra §8 under.

**Avhengighet:** PR-PT1 + PR-PT3 (runbook skal demonstrere ferdig flyt).

---

## 6. Pilot-integrasjons-flyt (fra bingovert's perspektiv)

### Før pilot-dag

1. **Admin oppretter spill** — Via eksisterende GameManagement-UI: velg per-farge pris + premie-matrise. Schedule opprettes i DailyScheduleEditorModal. Scheduled-game spawnes automatisk av `Game1ScheduleTickService` når tid passerer.
2. **Admin oppretter batch og genererer unique-IDs** — Via `AddPage` (`#/addPhysicalTickets`): velg hall, range_start/end, default_price. `POST /batches` → `POST /batches/:id/generate` materialiserer rader i `app_physical_tickets`. Deretter `POST /batches/:id/assign-game` binder batch til scheduled_game_id.

### Pilot-dag — bingovert's runbook

3. **Bingovert logger inn** — Åpner agent-shift via cash-inout. Åpner to faner:
   - Fane 1: `SellTicketPage` (for salg)
   - Fane 2: `HallLiveDashboardPage` (PR-PT3, ny) — viser aktiv scheduled_game + drawn numbers
4. **Bingovert selger bonger (pre-inscannet)** — Fysisk prosess: ta penger, rive av bong, scanne unique-ID. Med PR-PT1: sjekkbox "anonym walk-in", scan unique-ID → `POST /api/agent/physical-tickets/sell-anonymous`. System markerer SOLD + kvittering/print.
5. **Spillet kjøres** — Master-konsollet (Agent 1) starter draw-engine. Ballene trekkes automatisk eller manuelt avhengig av spilltype. Digital-vinnere håndteres i real-time av `Game1DrawEngineService.evaluateAndPayoutPhase`.
6. **Systemet oppdager fase-vinn (digital)** — Digitale vinnere får auto-payout via wallet. PR-PT3-dashboardet varsler alle halls bingoverter: "Fase X avsluttet. Sjekk om noen fysisk-spillere har vunnet i din hall."
7. **Bingovert får varsel** — Dashboardet beeper/flasher etter hver fase-avslutning. Bingovert roper etter evt. vinn på gulvet ("Noen som har bingo på fase X?").
8. **Bingovert scanner bongen for å verifisere** — En spiller kommer frem med bong. Bingovert åpner `CheckBingoPage`, scanner bong (PR-PT2 barcode-integrasjon) → unique-ID fylles ut → taster inn 25 tall fra papiret (manuell i pilot — post-pilot G4 pre-loader disse). `POST /check-bingo` returnerer `{ hasWon: true, winningPattern: "row_3" }`. Systemet stempler numbers_json + pattern_won på rad-nivå.
9. **Kontant-utbetaling registreres** — Bingovert åpner `CashOutPage`, scanner samme unique-ID, taster inn beløp basert på game-prize-matrise (PR-UI kunne auto-fylle fra pattern — post-pilot). `POST /cashout` logger utbetalingen i `app_physical_ticket_cashouts` + audit. Bingovert tar pengene fysisk ut av hall-kassen og gir til spiller.
10. **Ved spill-slutt** — Bingovert kan kjøre BIN-648-rapport for oppgjør. Shift lukkes normalt; cash-delta fra kassen reflekterer utbetalinger (kassen er da `solgt_sum - utbetalt_sum`).

---

## 7. Post-pilot-forbedringer

Prioritert rekkefølge:

1. **Pre-loading av 25 tall per unique-ID** (G4) — Enten (a) CSV-opplasting i `AddPage` ved batch-create (hvis printer har digital "what-numbers-on-what-ID"-fil), eller (b) deterministisk tall-generering (system lager tall-gridet, printing-bureau får CSV med ID→tall-mapping for å trykke bongene). Velg etter samtale med bong-leverandør.
2. **Draw-engine scanner fysiske tickets i real-time** (G5) — Utvid `evaluateAndPayoutPhase` til å også iterere `app_physical_tickets WHERE assigned_game_id=$1 AND status='SOLD' AND numbers_json IS NOT NULL`. Vinnere flagges (f.eks. `is_won_phase_x`-kolonne) slik at bingovert ser listen umiddelbart uten manuell scan. Emit `admin-game1` socket event `physical_winners_suspected` per fase.
3. **Auto-fylling av payoutCents i CashOutPage** — Basert på pattern_won + game-prize-matrise (eksisterer allerede for digital). Fjerner manuell-inntasting av beløp → reduserer feilrisiko.
4. **Integrerert QR/barcode på selve papirbongen** — Krever samspill med bong-leverandør. Skanner kan lese tallene direkte uten separat database-oppslag (encoded in barcode) — fallback hvis G4 ikke er gjennomførbart.
5. **Regnskaps-eksport (CSV/XML)** av cashout-transaksjoner for månedlig regnskap-integrasjon.
6. **Spillvett-hensyn for fysisk** — Per dags dato gjelder per-hall-grenser kun for *digitale* kjøp. Må avklares med compliance om fysiske cash-kjøp skal telle mot hall-grenser (ikke trivielt siden spilleren er anonym — ingen konto å sette grensen på).

---

## 8. Åpne spørsmål til PM

1. **Regulatorisk — kontant-utbetaling-dokumentasjon:**
   - BIN-640-audit-loggen (`admin.physical_ticket.cashout`) lagrer `{ uniqueId, gameId, hallId, payoutCents, cashoutId, paidBy }`. Er dette tilstrekkelig under pengespillforskriften §64 for å bevise "hva som ble betalt ut", eller trenger vi en fysisk kvittering (trykket/signert av spiller) i tillegg?
   - Hvor lenge må vi beholde audit-logg + cashout-data (§65 sier 10 år for pengetransaksjoner — bekreft)?
   - Må hall-kassen balanseres mot cashout-loggen per shift, eller er det nok å avstemme per uke/måned?
2. **Regulatorisk — walk-in anonym spiller:**
   - Norsk lovverk (pengespilloven §6) forutsetter ikke bruker-registrering for fysisk cash-bingo i bingohall. Bekreft med compliance-rådgiver at "walk-in" er OK uten ID-verifisering i pilot-halls.
   - Spillvett: skal pilot-halls håndheve en øvre grense (f.eks. "maks 500 kr cash per person per dag") i pilot, eller er det post-pilot?
3. **Numbers pre-loading (krav 3/4-tolkning):**
   - Tobias sier "alle bongene er allerede scannet inn i systemet på forhånd". Er dette bokstavlig (numbers_json + unique_id pre-loadet), eller er det tilstrekkelig å ha unique-ID-range pre-loadet + agent taster inn tall ved check-bingo?
   - Hvis bokstavlig: har vi en bong-leverandør som kan levere CSV med ID→tall-mapping? Hvis ikke: aksepterer vi at pilot kjører med "ropt-bingo + manuell-tast-inn"-flyt (PR-PT1-4) og G4 venter til post-pilot?
4. **Pilot-scope:**
   - Skal pilot-halls også støtte fysisk-cash-salg parallelt med digital, eller bare fysisk? Første antakelse: parallelt (digital er allerede live per PR 4d).
   - Hvor mange haller kjører fysisk bong i pilot — alle 4, eller subset (f.eks. bare 2 mest analogt-vante halls)?
5. **Bingovert-UX:**
   - Er "ropt-bingo" + scan-for-verify-modellen OK for pilot, eller må PR-PT3 (real-time dashboard med auto-varsel) være på plass før vi går live?
   - Hvis operator skal se "mulige vinnere i hallen" uten å måtte spørre gulvet, krever det G5 (draw-engine-scan av fysiske tickets) = post-pilot-forutsetning.

---

## 9. Total estimat

| Sub-PR | Estimat |
|---|---|
| PR-PT1 anonymous cash-salg | ~1 dag |
| PR-PT2 check-bingo barcode + UX | ~1 dag |
| PR-PT3 hall-live-dashboard (real-time + varsel) | ~2 dager |
| PR-PT4 pilot-runbook + compliance-dok | ~1 dag |
| **Pilot-scope sum** | **~5 dager** (minimum) til **~7 dager** (med 2 dagers buffer for QA + stakeholder-review) |
| Post-pilot (G4+G5) | Separat ~3-5 dagers scope, venter bong-leverandør + compliance-svar |

---

## 10. Referanser

- BIN-587 B4a — `apps/backend/src/compliance/PhysicalTicketService.ts`, `apps/backend/src/routes/adminPhysicalTickets.ts`
- BIN-587 B4b — `apps/backend/src/routes/adminUniqueIdsAndPayouts.ts`
- BIN-638 — `apps/backend/src/admin/PhysicalTicketsGamesInHall.ts`, `apps/backend/src/routes/adminPhysicalTicketsGamesInHall.ts`
- BIN-639 — `apps/backend/src/routes/adminPhysicalTicketsRewardAll.ts`
- BIN-640 — `apps/backend/src/routes/adminPhysicalTickets.ts:455-533`, `apps/backend/migrations/20260427000000_physical_ticket_cashouts.sql`
- BIN-641 — `apps/backend/src/routes/adminPhysicalTicketCheckBingo.ts`
- BIN-648 — `apps/backend/src/admin/PhysicalTicketsAggregate.ts`, `apps/backend/src/routes/adminReportsPhysicalTickets.ts`
- BIN-698 — `apps/backend/migrations/20260427000100_physical_ticket_win_data.sql`
- GAME1_SCHEDULE PR 4a — `apps/backend/migrations/20260430000100_physical_tickets_scheduled_game_fk.sql`
- GAME1_SCHEDULE PR 4b — `apps/backend/migrations/20260501000000_app_game1_ticket_assignments.sql`, `apps/backend/src/game/Game1DrawEngineService.ts`
- Legacy-referanse (pre-repo-restrukt): `git show 9c0f3b33^:legacy/unity-backend/App/Controllers/physicalTicketsController.js`, `.../App/Models/staticPhysicalTickets.js`, `.../Game/Game1/Controllers/GameProcess.js` (unclaimedWinners-mønster, linje 480-500)
- BarcodeScanner-komponent — `apps/admin-web/src/components/BarcodeScanner.ts`, spec i `apps/admin-web/BARCODE-SCANNER-SPEC.md`
