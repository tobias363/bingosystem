# Pilot Live Runbook — 4-halls live-test (Spill 1)

**Status:** Autoritativ for live-kjøring av 4-halls-pilot i hall-gruppen **"Pilot-Link (Telemark)"**
**Dato:** 2026-04-22
**Scope:** Kun Spill 1 (basisvariant + trafikklys + per-farge). Ingen minispill, ingen Kvikkis, ingen Spill 2/3.
**Owner:** Tobias Haugen (technical lead) + PM (Claude)
**Siste oppdatering:** 2026-04-22

Denne runbooken er **operativ**. Den brukes av PM, pilot-leder og bingoverter under live pilot-kjøring. Den erstatter ikke, men utfyller:

- [`../qa/PILOT_QA_GUIDE_2026-04-22.md`](../qa/PILOT_QA_GUIDE_2026-04-22.md) — manuell QA-prosedyre (pre-pilot og re-run)
- [`../operations/PILOT_CUTOVER_RUNBOOK.md`](../operations/PILOT_CUTOVER_RUNBOOK.md) — cutover-mekanikk per hall (legacy-avkobling)
- [`../operations/OBSERVABILITY_RUNBOOK.md`](../operations/OBSERVABILITY_RUNBOOK.md) — Grafana + Sentry-signaler
- [`../operations/ROLLBACK_RUNBOOK.md`](../operations/ROLLBACK_RUNBOOK.md) — BIN-540 per-hall-flag rollback
- [`../architecture/GAME1_PR4E_ADMIN_POLISH_PILOT_QA_DESIGN_2026-04-22.md`](../architecture/GAME1_PR4E_ADMIN_POLISH_PILOT_QA_DESIGN_2026-04-22.md) — pilot-scope og admin-flyt

**Regel:** hvis denne runbooken og de refererte dokumentene er i konflikt, er denne runbooken kilden — men flagg avviket til PM og oppdater referansen etter pilot.

---

## Innhold

1. [Pre-pilot-sjekkliste (dagen før)](#1-pre-pilot-sjekkliste-dagen-før)
2. [Pilot-dagen — time-by-time](#2-pilot-dagen--time-by-time)
3. [Operasjonelle prosedyrer](#3-operasjonelle-prosedyrer)
4. [Feilsøking (FAQ)](#4-feilsøking-faq)
5. [Regulatorisk sjekkliste](#5-regulatorisk-sjekkliste)
6. [Etter-pilot](#6-etter-pilot)
7. [Bruk av test-scripts](#7-bruk-av-test-scripts)

---

## 1. Pre-pilot-sjekkliste (dagen før)

Alt i denne seksjonen skal være grønt **senest kl. 20:00 dagen før pilot**. Rød status = pilot utsettes til neste dag, ikke "kjør likevel og håp".

### 1.1 Haller-oppsett bekreftet

- [ ] De 4 pilot-hallene finnes og er `is_active = true` i `app_halls`:
  - `pilot-notodden` — Notodden Pilot
  - `pilot-skien` — Skien Pilot
  - `pilot-porsgrunn` — Porsgrunn Pilot
  - `pilot-kragero` — Kragerø Pilot
- [ ] Hall-gruppen **"Pilot-Link (Telemark)"** finnes, status `active`, og har alle 4 hallene som medlemmer. Verifiseres i admin-UI under **Hall-grupper**.
- [ ] Hver hall har en tilknyttet `HALL_OPERATOR`-bruker (bingovert). Sjekk `app_users` for `hall_id` + `role = 'HALL_OPERATOR'`.
- [ ] Master-hall er valgt i DailySchedule (default: Notodden). Bytte av master-hall under kjøring krever ny DailySchedule-rad — ikke gjøres midt-i-spill.
- [ ] Fysisk TV/projector på hver hall viser korrekt kall-visning ved åpning av spiller-URL (`?hall=<slug>&mode=display`). Dette er ikke pilot-blocker, men bingovert må vite hvordan man åpner den.

### 1.2 Spill-plan for dagen lastet opp

- [ ] 3 GameManagement-rader eksisterer i `app_game_management` med `gameTypeId = 'game_1'`, `status = 'active'`, `startDate = pilot-dagen`:
  - Pilot Morgen-bingo — 09:00, 10 kr/bong, basis 5-fase
  - Pilot Lunsj-bingo (Elvis) — 12:00, 15 kr/bong, Elvis-variant + per-farge
  - Pilot Kveld-bingo (Jackpot) — 18:00, 20 kr/bong, per-farge-jackpot
- [ ] For hver GameManagement-rad: verifiser at `config.spill1` inneholder per-farge-pris + pattern-matrise + jackpot-config. Bruk admin-UI read-only view.
- [ ] DailySchedule-rad for pilot-dagen er opprettet og kobler `scheduleId` til hall-gruppen **Pilot-Link (Telemark)**.
- [ ] `Game1ScheduleTickService` har spawnet `app_game1_scheduled_games`-rader for alle 3 tidspunkt. Sjekk med:
  ```sql
  SELECT id, name, status, scheduled_start_time, room_code
  FROM app_game1_scheduled_games
  WHERE scheduled_start_time::date = CURRENT_DATE + INTERVAL '1 day'
  ORDER BY scheduled_start_time;
  ```
  Forventet: 3 rader med `status = 'purchase_open'` (eller `pending` hvis tick ikke har kjørt enda) og `room_code` satt.
- [ ] Hvis `room_code` er NULL: kjør `UPDATE`-SQL fra §4 Scenario R4, ellers vil spillerne få `ROOM_NOT_FOUND` ved join.

### 1.3 Bingovert-opplæring gjennomført

Alle 4 bingoverter skal kunne:

- [ ] Logge inn i admin-web med sin `HALL_OPERATOR`-konto, se **kun sin egen hall** i hall-listen.
- [ ] Åpne spillets lobby og se **"Neste spill"**-kort.
- [ ] Trykke **"Klar"**-knappen på hall-ready-skjermen.
- [ ] Kjenne igjen statusbadge: `venter` (grå) → `klar` (grønn) → `ekskludert` (rød).
- [ ] Vite hvem de skal kontakte ved problemer: **pilot-leder først**, ikke PM direkte.
- [ ] Forstå forskjellen på **Pause** (kortvarig, fortsetter fra samme trekk) og **Stopp** (ender spillet + refund).
- [ ] Kjenne til kasse-avstemmings-prosedyren (§3.8).

Opplæring skal være dokumentert — en epost eller Slack-melding med "jeg har forstått dette" fra hver bingovert er tilstrekkelig bevis.

### 1.4 Scanner-HW testet (Bluetooth HID)

**Viktig:** Fysiske bonger (PT) er **ikke implementert i Spill 1-pilot**. Se [`../architecture/PHYSICAL_TICKETS_FINAL_SPEC_2026-04-22.md`](../architecture/PHYSICAL_TICKETS_FINAL_SPEC_2026-04-22.md) — spec er låst men ikke i kode for denne piloten. Bruk digitale bonger i hele pilot-vinduet.

Hvis PT likevel brukes for eksperiment (ikke kritisk):

- [ ] Hver hall har én Bluetooth HID-scanner paret med hall-terminalen.
- [ ] Scanner trigger keyboard-input ved scan (skriver inn ticket-ID + ENTER).
- [ ] Test: scan en dummy-bong-barcode, verifiser at inputen kommer i admin-UI input-felt.
- [ ] Batteri ≥ 50 % før pilot-start.

Merk PT-seksjon som **placeholder** i pilot-rapport hvis ikke testet live.

### 1.5 Backup-planer på plass

- [ ] Backend har en siste-kjente-god-deploy identifisert i Render — commit-SHA notert.
- [ ] Postgres-backup tatt morgenen før pilot (`pg_dump` eller Render automated backup — verifiser timestamp).
- [ ] Admin har SQL-konsoll-tilgang til DB for manuell refund (§3.4 / §4 Scenario R3).
- [ ] `scripts/pilot-teardown.mts` kan kjøres på 5 min om piloten må restartes fra null (se §7).
- [ ] Mobil hotspot tilgjengelig i hver hall i fall lokalt WiFi svikter.

### 1.6 Kontakt-info for support

| Rolle | Hvem | Primær kontakt | Responstid |
| --- | --- | --- | --- |
| Pilot-leder | (fyll inn) | Mobil + Slack `#bingo-pilot` | 0–5 min |
| Teknisk backend (PM) | PM (Claude) via Slack-bridge | `#bingo-pilot` | 5–10 min |
| Compliance-eier | Tobias Haugen | SMS + Slack DM | 15 min |
| On-call engineer | (fyll inn på dagen) | Mobil | 0–5 min |
| Hall-operatør Notodden | (fyll inn) | Mobil | 0–2 min |
| Hall-operatør Skien | (fyll inn) | Mobil | 0–2 min |
| Hall-operatør Porsgrunn | (fyll inn) | Mobil | 0–2 min |
| Hall-operatør Kragerø | (fyll inn) | Mobil | 0–2 min |

**Eskaleringsregel:** hall → pilot-leder → PM → Tobias. Aldri hopp ledd med mindre Tobias er eksplisitt `@mentioned`.

---

## 2. Pilot-dagen — time-by-time

All tider er lokal tid (Europe/Oslo). Alle handlinger logges i `#bingo-pilot` med tidsstempel.

### 09:00 — Systemsjekk

Utføres av PM + on-call engineer.

1. `GET /health` på backend returnerer `{status: "ok"}` og alle dependencies grønne.
2. Admin-web laster på `/admin` — logg inn som `ADMIN`, se at ingen 500-feil eller toast-errors kommer opp.
3. Sentry backend + client har mottatt minst én event de siste 24 t (hvis tomt: misconfig, stopp).
4. Grafana dashboards åpnet i bakgrunn: `spillorama-connection-health`, `spillorama-draws-claims`, `spillorama-finance-gates`.
5. Verifiser at de 3 scheduled-games for dagen er synlige i admin-UI under **Master-konsoll** / **Live operations**.
6. Post i `#bingo-pilot`: `09:00 systemsjekk grønn. 3/3 scheduled-games spawned. On-call: <navn>.`

Rød? → stopp piloten, flagg til Tobias.

### 09:30 — Haller starter — bingoverter logger inn

Utføres av hver bingovert i sin hall.

1. Bingovert åpner admin-web på hall-terminalen, logger inn med sin `HALL_OPERATOR`-konto.
2. Bingovert åpner spiller-lobby-URL på kall-TV: `https://<domain>/?hall=<slug>&mode=display`.
3. Bingovert verifiserer at "Neste spill: Pilot Morgen-bingo — starter 09:00" vises korrekt.
4. Bingovert poster i `#bingo-pilot`: `<hall-slug> klar — bingovert inne.` Ved 09:35 skal alle 4 haller ha postet.

Hvis én hall mangler: pilot-leder ringer bingovert direkte. Hvis bingovert er syk → pilot-leder vurderer om spillet kan kjøres med 3 haller (ja, med ekskluder-hall-flyt §3.7).

### 10:00 — Første spill starter

Dette er egentlig Pilot Morgen-bingo som **skulle** startet 09:00, men første spill justeres ofte til 10:00 for å gi bingovertene inspilningstid. PM har ansvar for å oppdatere `scheduled_start_time` dagen før hvis ønsket.

For hver spill-økt i pilot-dagen (morgen/lunsj/kveld):

**T-30 min før start (for Morgen-bingo kl. 09:30):**
- [ ] PM åpner Master-konsoll for spillet. Status = `purchase_open`.
- [ ] Alle 4 haller har 4/4 bingoverter markert "klar".
- [ ] Grafana viser sockets climbing opp etter hvert som spillere logger inn.
- [ ] Første test-spiller kjøper 1 bong — verifiser at wallet trekker riktig beløp og bongen vises i "Mine bonger".

**T-10 min:**
- [ ] Sjekk at `halls-ready = 4/4` i Master-konsoll.
- [ ] Hvis én hall fortsatt er `venter`: ring bingoverten, ikke start uten bekreftelse.
- [ ] Sjekk Spillvett-fail-closed: be test-spiller i Skien kjøpe bong etter at dagstap er overskredet — skal få avslag.

**T-0 (start):**
- [ ] PM trykker **"Start spill"** i Master-konsoll.
- [ ] Socket-event `game:roundStarted` broadcastes til alle 4 haller (bekreft via `#bingo-pilot` at hver bingovert ser spiller-klientens popup/lobby-skifte).
- [ ] Første trekk kommer innen auto-draw-interval (typisk 10–30s).
- [ ] Grafana: claim-rate begynner å klatre.

**Under spill:**
- [ ] PM følger Master-konsoll og Grafana-dashboards. Sjekk hver 5 min.
- [ ] Bingoverter annonserer tallene i hallen manuelt (uansett om auto-draw går server-side).
- [ ] Ved vinn: Master-konsoll viser popup `pattern:won` med vinner-liste per fase. PM leser opp høyt i `#bingo-pilot`.

**T+X (fullt hus / spillslutt):**
- [ ] Master-konsoll viser `game:roundEnded` når siste fase er vunnet.
- [ ] Alle vinnere har fått wallet-kreditt (verifiser minst 2 i `app_wallet_transactions`).
- [ ] Bingoverter bekrefter at ingen spiller har uløst "jeg trodde jeg vant"-situasjon.
- [ ] PM poster mini-rapport: `<spillnavn> fullført. Vinnere: X (sum Y kr). Ingen avvik.`

### 12:00 — Lunsj-bingo (Elvis)

Samme flyt som 10:00, men:
- Elvis-variant: bonger har `is_elvis: true` i 20 % av tilfellene — verifiser at Elvis-prize triggrer i tilfelle heldig trekkrekkefølge.
- Per-farge-premier aktivert — verifiser at gul og hvit får separat payout-matrise.

### 18:00 — Kveld-bingo (Jackpot)

Samme flyt, men:
- Jackpot trigges hvis Fullt Hus skjer innen draw 50–59 (per config).
- Jackpot-beløpet er statisk per spill (ingen akkumulering — se §6 Kjente begrensninger).
- Hvis jackpot trigges: PM annonserer dette eksplisitt. Dobbel-verifiser at payout = `config.jackpot.amount` + standard Fullt Hus-premie.

### Etter siste spill — slutt-avstemming + rapport

Utføres av PM + alle bingoverter.

1. Hver bingovert avslutter sin vakt med kasse-avstemming (§3.8).
2. PM kjører nightly report dry-run:
   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     "https://<domain>/api/admin/reports/daily?date=$(date +%Y-%m-%d)"
   ```
3. Verifiser at rapporten viser:
   - Antall spill = 3
   - Antall spillere per hall (minst 1 per hall for GO-kriterium)
   - Sum innsatser = sum i wallet-transactions
   - Sum payouts = sum i `app_game1_wins` + jackpot-entries
4. Generer audit-rapport (§5.2).
5. PM poster avslutnings-rapport i `#bingo-pilot`: `Pilot-dag <dato> avsluttet. 3/3 spill kjørt. N avvik (lenket). Neste dag: <plan>.`

---

## 3. Operasjonelle prosedyrer

### 3.1 Opprette et nytt spill (GameManagement-rad)

Hvis et ekstra spill må legges til **under** piloten (ikke anbefalt, men støttet):

1. Admin → **Spill-forvaltning** → velg type = "Spill 1" → klikk **"Legg til spill"**.
2. Fyll ut:
   - `name` — beskrivende, f.eks. "Ekstra Kveld-bingo"
   - `startDate`, `endDate` — samme dag, ikke overlappende med eksisterende spill
   - `ticketPrice` — som bestemt (10/15/20 kr)
   - Per-farge-konfig: velg farge(r), sett pris, pattern-matrise (mode=percent eller fixed + amount)
   - Jackpot (valgfritt): sett draw-range + amount per farge
   - Elvis-replace-pris (valgfritt): typisk 0 kr for pilot
   - Lucky-prize (valgfritt): sett til 0 for pilot eller et fast beløp
3. Klikk **"Lagre"**. Suksess-toast + redirect til liste.
4. Vent 1 min for at `Game1ScheduleTickService` spawner en `scheduled_games`-rad.
5. Verifiser i Master-konsoll at det nye spillet er synlig med status `purchase_open`.

**NB:** det finnes **ingen edit-path** for eksisterende GameManagement-rader i pilot-UI. Hvis en rad har feil config: slett + re-lag. Dette er en **kjent begrensning**, dokumentert i PR 4e-design §3.2.4.

### 3.2 Starte et spill (Master-konsoll)

1. Admin → **Master-konsoll** (sidemenyen). Velg hall-gruppen **"Pilot-Link (Telemark)"**.
2. Liste over aktive scheduled-games vises. Klikk på ønsket spill.
3. Master-konsoll viser:
   - Halls-ready-badge per hall (venter/klar/ekskludert)
   - Bong-salg-telling per hall
   - Config-sammendrag (ticketPrice, farger, patterns)
4. Vent til `halls-ready = 4/4` (eller eksplisitt ekskluder hall som ikke er klar — §3.7).
5. Klikk **"Start spill"**. Status endres til `running`.
6. Auto-draw starter i henhold til `autoDrawIntervalSeconds` i config.

**Forventet:** alle 4 haller får socket-event `game:roundStarted` innen 1s. Grafana `bingo_active_rooms` klatrer med 1.

### 3.3 Pause / Resume (Master-konsoll)

**Pause:** brukes hvis bingovert rapporterer lokalt teknisk problem (f.eks. kall-TV henger). Ikke bruk pause mellom trekk for normal drift — auto-draw håndterer intervaller.

1. Master-konsoll → knapp **"Pause"** → fyll ut `reason` (f.eks. "Skien TV-feil, 2 min").
2. Status endres til `paused`. Auto-draw stopper. Sockets holdes åpne; spillere ser pause-overlay.
3. **Resume:** klikk **"Fortsett"**. Auto-draw fortsetter fra neste trekk. Allerede-trukne tall beholdes.

**Regel:** pause aldri mer enn 5 min totalt i løpet av ett spill — lengre pause = stopp + refund + nytt spill. Spillere blir urolige etter 5 min.

### 3.4 Stoppe spill med refund

Brukes ved katastrofisk feil (draw-engine-korrupsjon, wallet-feil, kritisk bug).

1. Master-konsoll → knapp **"Stopp spill"** → fyll ut `reason` (må være regulatorisk lesbar: "Draw-engine returned invalid sequence, aborting to preserve integrity" — ikke "ble rar").
2. Bekreftelse-dialog kommer. PM trykker "Bekreft — dette refunderer N digitale bonger (sum X kr)".
3. Backend utfører:
   - Status → `cancelled`
   - Alle digitale bonger refunderes via `WalletAdapter.refund()` i sekvens
   - `stop_reason` logges per PR 4d.4
   - §11-audit-entry for hver refund (pengespillforskriften)
   - Socket-broadcast `game:roundEnded` med `cancelled: true`
4. Spillere får popup: "Spillet er avbrutt. Ditt beløp er refundert."

**Verifisering:**
- Master-konsoll viser `status = cancelled` og `refund_count = N`.
- Grafana: `spillorama_payout_amount` får N nye entries merket `type=refund`.
- DB-spot-check:
  ```sql
  SELECT COUNT(*) FROM app_wallet_transactions
  WHERE scheduled_game_id = '<id>' AND type = 'refund';
  -- Forventet: antall kjøpte bonger
  ```
- Audit-log (`app_audit_log` eller `ComplianceLedger`): én `REFUND`-entry per bong, med `game_id` + `user_id` + `amount_cents`.

**Hvis refund feiler delvis:** se §4 Scenario R3.

### 3.5 Scannerflyt for fysisk-bong

**PLACEHOLDER** — Fysiske bonger er **ikke implementert i kode** for denne piloten. Specen [`../architecture/PHYSICAL_TICKETS_FINAL_SPEC_2026-04-22.md`](../architecture/PHYSICAL_TICKETS_FINAL_SPEC_2026-04-22.md) er låst og er **Bølge 2-leveranse**.

Hvis scannerflyt må testes eksperimentelt under pilot (ikke-kritisk):

1. Bingovert åpner "Fysiske bonger" i admin-UI — hvis det ikke er rutet enda, er denne seksjonen `N/A`.
2. Bingovert scanner bong-barcode → ticket-ID fylles inn i input-felt.
3. Ved live-implementering i Bølge 2: se full flyt i `PHYSICAL_TICKETS_FINAL_SPEC_2026-04-22.md` §Fase 2 (range-registrering) + §Fase 4 (batch-oppdatering).

**For denne piloten:** ignorer fysiske bonger. All bong-kjøp går via digital wallet.

### 3.6 Handover ved vakt-skift

Brukes når bingovert Kari går av vakt og Per tar over i samme hall.

**Digital-only (denne piloten):**
1. Kari trykker **"Logg ut"** i admin-UI.
2. Per logger inn med sin `HALL_OPERATOR`-konto.
3. Per ser samme hall-state som Kari forlot (Master-konsoll er server-side).
4. Hvis et spill er `running` når handover skjer:
   - Auto-draw stopper **ikke** — den er server-side og uavhengig av bingovert-sesjon.
   - Per må verifisere at hall-ready-badge fortsatt er `klar` (burde være det siden hallen ikke logges ut, kun brukeren).
5. Per annonserer tallene fra samme punkt Kari sluttet.

**Fysisk handover (Bølge 2, ikke aktivt nå):** se spec.

**Kasse-handover:** se §3.8 — Kari gjør kasse-avstemming først, deretter logger ut.

### 3.7 Eksklusjon av hall før start

Brukes hvis én hall ikke blir klar i tide eller har lokal feil.

1. Master-konsoll, før spillet er startet: klikk **"Ekskluder hall"** ved den aktuelle hallen.
2. Fyll ut `reason` (f.eks. "Kragerø mister nett, starter uten").
3. Den hallens spillere ser popup: "Dette spillet er ikke tilgjengelig i din hall."
4. Nye bong-kjøp fra den hallen blokkeres.
5. Master-konsoll viser `halls-ready = 3/4 (1 ekskludert)` — Start-knappen enabled.

**NB:** master-hallen kan **ikke** ekskluderes. Hvis master-hallen er borte, må PM opprette ny DailySchedule-rad med en annen master-hall, og cancele det pågående spillet. Dette er en kjent begrensning.

**Etter-spill-behandling av ekskludert hall:** ingen refund nødvendig (ingen bonger ble solgt etter eksklusjonen). Hvis noen bonger ble solgt før eksklusjonen: manuell refund per §3.4.

### 3.8 Kasse-avstemming ved vakt-slutt

Hver bingovert gjør dette ved slutten av sin vakt (typisk før logout).

1. Bingovert åpner **"Rapporter → Dagens hall-rapport"** i admin-UI.
2. Rapport viser:
   - Antall spill i dag i hallen
   - Antall bonger solgt (digitalt)
   - Sum innsats NOK
   - Sum premier utbetalt NOK
   - Netto hall-balanse
3. Bingovert krysssjekker mot fysisk kontantbeholdning (hvis noen kontantkjøp skjedde — ikke aktuelt i digital-only pilot).
4. Ved avvik > 1 kr: bingovert noterer avviket i Slack `#bingo-pilot` med tidspunkt + beløp + mulig årsak.
5. Bingovert trykker **"Avslutt vakt"** — logger audit-entry.
6. PM dobbelt-sjekker rapporten: sum innsats matcher sum av `app_wallet_transactions WHERE type='stake' AND hall_id=<hall>`.

**Bekreftelse:** hver hall skal ha en signert (digital eller fysisk) avstemmings-rapport før neste dag. Uavstemt hall = blokker for neste pilot-dag.

---

## 4. Feilsøking (FAQ)

### 4.1 Socket-disconnect — hvordan verifisere REST-fallback

**Symptom:** spiller ser "Reconnecting..." eller Master-konsoll slutter å oppdatere i real-time.

**Diagnose:**
1. Chrome DevTools (spiller-klient) → Network → WS-tab → sjekk om Socket.io-connection er røde/grønn.
2. Grafana `spillorama-connection-health` → Reconnect ratio. Hvis > 5 % over 5 min: systemisk problem.
3. Backend-log: `grep 'socket.*disconnect' | tail -30`.

**Action:**
- Spillerens klient skal auto-reconnecte via BIN-502-reconnect-flow.
- Master-konsoll har polling-fallback (5s) mens socket er nede per PR 4d.3. Hvis det står stille: F5 hele siden.
- Kritisk data hentes via REST: `GET /api/admin/game1/:id` returnerer fullt snapshot uavhengig av socket.
- Hvis enkeltspiller ikke reconnecter: be dem refreshe nettleseren. BIN-245-checkpoint-recovery-flow tar over.

**Eskaler:** hvis > 10 % av spillere ikke har socket etter 2 min → stopp spillet (§3.4), undersøk med on-call engineer.

### 4.2 Admin-UI fryser

**Symptom:** PM trykker knapp, ingenting skjer. Ingen toast.

**Diagnose:**
1. Chrome DevTools → Console → sjekk errors. Typiske:
   - `Failed to fetch` → backend er nede eller CORS-feil.
   - `Uncaught TypeError: Cannot read property 'X' of undefined` → klient-bug, sannsynligvis fra PR-rolldown.
   - `401 Unauthorized` → token utløpt, logg inn på nytt.
2. Network-tab → siste XHR → sjekk status-kode + response-body.

**Action:**
- F5 hele siden — løser 80 % av cases.
- Logg ut + inn igjen — løser 95 %.
- Hvis fortsatt frosset: åpne i inkognito-vindu for å utelukke cache-korrupsjon.
- Hvis problemet vedvarer på tvers av brukere: backend-problem — sjekk `/health` og Sentry.

**Eskaler:** hvis alle 4 hall-operatører rapporterer frost admin-UI samtidig → backend-incident, pause alle spill + ring Tobias.

### 4.3 Master-kontroll gir ikke respons — sjekk auto-draw-tick-status

**Symptom:** Master-konsoll viser `running`, men ingen nye trekk kommer.

**Diagnose:**
1. Backend-log: `grep 'game1.*auto-draw\|Game1ScheduleTickService' | tail -50`
2. Typiske mønstre:
   - `auto-draw tick fired` + `draw selected: N` → engine fungerer, klient viser ikke.
   - `auto-draw tick skipped: game paused` → noen har pauset uten å varsle PM.
   - `auto-draw error: LOCK_TIMEOUT` → Postgres-lås henger, vent 10s + sjekk igjen.
   - Ingen logg → tick-service er død, restart backend.
3. DB-spot-check:
   ```sql
   SELECT id, status, last_draw_at, current_draws
   FROM app_game1_scheduled_games
   WHERE id = '<id>';
   ```
   Hvis `last_draw_at` er > 60s gammel og status = `running` → auto-draw er stuck.

**Action:**
- Hvis stuck: pause spillet (§3.3), vent 10s, resume. Dette trigger ny tick.
- Hvis det ikke hjelper: stopp spillet med refund (§3.4), undersøk post-mortem.
- Grafana `bingo_draw_errors_total` → se om det er mønstre (lock-timeout = Postgres-problem, transient = ignorer).

### 4.4 Spiller rapporterer ikke-registrert vinn

**Symptom:** spiller roper "jeg har bingo!", men klient viser ikke vinn-popup.

**Diagnose:**
1. Be bingovert notere `ticketId` + `userId` + hvilken fase spilleren tror de vant.
2. DB-query:
   ```sql
   SELECT t.id, t.card_matrix, t.user_id, w.phase, w.won_at, w.payout_cents
   FROM app_game1_ticket_assignments t
   LEFT JOIN app_game1_wins w ON w.ticket_id = t.id
   WHERE t.id = '<ticketId>';
   ```
3. Sjekk `card_matrix` mot trukne tall i `scheduled_games.drawn_numbers`:
   - Hvis pattern matcher men `w.phase` er NULL → vin-detektoren feilet (bug).
   - Hvis pattern matcher og `w.phase` er satt men klient ikke viser → socket-event tapt, restart klient.
   - Hvis pattern **ikke** matcher → spilleren tok feil. Vis dem matrix vs trukne tall.

**Action:**
- Hvis bug: manuell win-credit via admin-UI `POST /api/admin/game1/:id/manual-win` (krever admin-rolle + reason).
- Audit-entry opprettes automatisk.
- Kommuniser til spiller: "Vi verifiserer nå. Hold deg synlig, så kommer det."

**Eskaler:** hvis flere enn 1 spiller rapporterer dette i samme spill → stopp spillet, pattern-evaluator er muligens korrupt.

### 4.5 Utbetaling feiler — fail-closed-flyt

**Symptom:** spiller vant, pattern-detektor triggrer, men wallet-kreditt kommer ikke.

**Diagnose:**
1. Backend-log: `grep 'wallet.*credit\|payout' | tail -30`. Typiske:
   - `WalletAdapter.credit: INSUFFICIENT_HOUSE_FUNDS` → hall-konto er tom.
   - `WalletAdapter.credit: ADAPTER_TIMEOUT` → ekstern wallet-service (Swedbank/topup) er nede.
   - `ComplianceLedger.recordPrize failed` → ledger-skriving feilet.
2. Grafana `spillorama-finance-gates` → `bingo_wallet_operation_duration_ms` p99 > 2000 ms indikerer adapter-treghet.

**Action (fail-closed-prinsipp):**
- Wallet-adapter er **fail-closed** — hvis kreditt-transaksjonen ikke fullfører, **roller den tilbake**. Spiller får ingenting, **ikke** delvis beløp.
- Spiller må få manuell payout via admin-UI: `POST /api/admin/wallet/credit` med user_id + amount + reason.
- Audit-entry settes med `source=manual_recovery` + PM som utførende.
- Hvis hall-konto er tom: PM kontakter Tobias umiddelbart — hallen må top-up før piloten kan fortsette.

**Regulatorisk:** manuell payout skal dokumenteres med skjermdump + audit-log-ID. Dette er spillemyndigheten-bevisbar.

---

## 5. Regulatorisk sjekkliste

### 5.1 Pengespillforskriften §11 compliance

§11 handler om ansvarlig spill (Spillvett). Under pilot-kjøring skal følgende være verifisert:

- [ ] **Spillvett-tekst synlig** i spiller-lobby (`/web/`-shellen). Versjon pinned via `VITE_SPILLVETT_TEXT_VERSION` env-var.
- [ ] **Per-hall tapsgrenser** håndheves server-side i `HallGameSpillvettGate`:
  - Dagstap: BINGO_DAILY_LOSS_LIMIT = 900 NOK (default)
  - Månedstap: BINGO_MONTHLY_LOSS_LIMIT = 4400 NOK (default)
  - Hvis spillerens akkumulerte tap i hallen overstiger grensen → `bet:arm` returnerer `hall_limit_exceeded` med fail-closed-invariant.
- [ ] **Voluntary pause** kan aktiveres av spiller via Spillvett-panelet. Hvis aktiv: `join:room` blokkeres i **alle haller** (cross-hall-Spillvett per BIN-541).
- [ ] **Selv-eksklusjon ≥ 1 år** regulatorisk minimum. Admin-UI rejecter kortere perioder.
- [ ] **Fail-closed-invariant:** hvis `responsibleGamingStore.checkAllowed` kaster, blokkeres all bet-aktivitet. Dette er spillemyndigheten-kill-switch — aldri bypass, aldri try/catch+continue.
- [ ] **§11-audit-entry** opprettes ved:
  - Hver refund (via `Game1StopService.refundAllTickets`, per PR 4d.4)
  - Spiller som treffer tapsgrense
  - Spiller som velger selv-eksklusjon
  - Admin-force-end med reason

**Pre-pilot-smoke (24 t før):** kjør QA-guide §2.5–§2.7 i [`../qa/PILOT_QA_GUIDE_2026-04-22.md`](../qa/PILOT_QA_GUIDE_2026-04-22.md) + fail-closed-scenario i `PILOT_CUTOVER_RUNBOOK.md` §4.

### 5.2 §64–65 audit-log-bevis

§64 krever full audit-trail på alle pengetransaksjoner. §65 regulerer oppbevaringstid.

- [ ] Alle stakes logges i `ComplianceLedger.recordStake` med `{userId, hallId, gameId, amountCents, timestamp}`.
- [ ] Alle premier logges i `ComplianceLedger.recordPrize` med `{userId, hallId, gameId, phase, ticketId, amountCents, timestamp}`.
- [ ] Alle refunds logges i `ComplianceLedger.recordRefund` med `{userId, hallId, gameId, ticketId, amountCents, reason, timestamp}`.
- [ ] Nightly rapport (`GET /api/admin/reports/daily`) inneholder checksum som kan verifiseres.
- [ ] `payout-audit`-endepunkt (`GET /api/admin/payout-audit`) gir ekstern-revisorbar oversikt.

**Etter pilot:** generer audit-rapport for hele pilot-vinduet:
```bash
curl -H "Authorization: Bearer <admin-token>" \
  "https://<domain>/api/admin/reports/audit?from=<start>&to=<end>" > pilot-audit.json
```
Arkiver filen i `docs/archive/pilot-<dato>/`.

### 5.3 10-års oppbevaring bekreftet

- [ ] Postgres-tabellene `app_wallet_transactions`, `app_game1_wins`, `app_audit_log`, `app_compliance_ledger_entries` har **ingen DELETE-policies**. Data beholdes til manuell purge.
- [ ] Backup-policy (Render eller egen pg_dump-cron) kjører minst daglig og backup-filer beholdes i 10 år. Dette er ikke dekket av denne runbooken — sjekk med infra-owner.
- [ ] Hvis en rad må slettes (GDPR erase-request): kun `app_users.email/phone/name` pseudonymiseres, ikke pengeflyt-tabeller. Disse beholdes for regulatorisk §65.

**Åpent spørsmål:** Se `PHYSICAL_TICKETS_PILOT_DESIGN_2026-04-22.md` §8 — "§65 sier 10 år for pengetransaksjoner — bekreft". **Flagg til Tobias** for endelig bekreftelse før pilot.

### 5.4 Redflag-player-detektor aktiv

Redflag-detektor identifiserer spillere med risiko-mønster (høyt tap + høy hastighet).

- [ ] `RedFlagPlayerDetector` kjører som scheduled task (sjekk `apps/backend/src/platform/AdminAccessPolicy.ts` + tilknyttede services).
- [ ] Under pilot: sjekk daglig `GET /api/admin/red-flag-players?hall=<slug>` — hvis listen er tom etter dag 1 → detektor er muligens ikke aktiv.
- [ ] Flagging triggers: ≥ 3 tapsgrensehitt på 1 uke + ≥ 4 timer spilletid/dag.
- [ ] Flaggede spillere skal ha Spillvett-banner med oppfordring til pause.

**NB:** redflag-detektor-pausering av spiller er **ikke automatisk** — det er bare indikasjon for bingovert/PM til å vurdere dialog med spiller. Automatisk blokkering er **ikke implementert** per denne piloten (flagg som post-pilot follow-up).

---

## 6. Etter-pilot

Utføres dagen etter siste pilot-dag.

### 6.1 Kasse-avstemming på tvers av haller

1. PM kjører konsolidert rapport:
   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     "https://<domain>/api/admin/reports/pilot-summary?from=<start>&to=<end>" > pilot-summary.json
   ```
2. Verifiser:
   - Sum innsats per hall matcher hallens rapport fra §3.8
   - Sum premier utbetalt per hall matcher wallet-credits
   - Ingen refund-events er `pending` (alle fullført)
   - Ingen pengespillforskriften-§64-entries mangler `game_id` (dvs. orphan-entries)
3. Hvis avvik > 1 kr per hall: åpne en egen granskings-oppgave. Ikke close pilot før avvik er forklart.

### 6.2 Audit-rapport-generering

1. Eksporter full audit-log for pilot-vinduet (se §5.2).
2. Arkiver i `docs/archive/pilot-2026-04-XX/` sammen med:
   - Nightly-rapporter per dag
   - Payout-audit-utdrag
   - Refund-hendelseslogg
   - Sentry-incident-liste (hvis noen)
3. Signér (digital eller fysisk) av Tobias + PM + compliance-eier.

### 6.3 Kjente limitations dokumentert

Flagg disse i pilot-avslutnings-rapport (kopier fra QA-guide §5):

- **Ingen minispill** — hjul/kiste/mystery/colordraft er i DB men ikke i runtime. Ikke blokker.
- **Ingen jackpot-akkumulering over dager** — hver dag starter jackpot på `config.jackpot.amount`. Ikke blokker.
- **Ingen Spill 2 / 3 / Kvikkis** — scope for pilot er kun Spill 1.
- **Ingen Candy iframe-embed** — arkitektur-gap, dokumentert separat.
- **Ingen GameManagement edit-path** — slett + re-lag workaround.
- **Fysiske bonger ikke aktive** — spec låst men ikke i kode for denne piloten.
- **Cross-hall vinner-varsel minimal i klient** — kun Master-konsoll får full vinner-liste.
- **Loyalty-poeng vises ikke i klient** — server-side fyrer hook, men klient-visning er delvis wired.

### 6.4 Lærdommer → Linear-issues for post-pilot

For hver mindre feil som ble observert (ikke pilot-stopp):

1. Opprett Linear-issue i team `spillorama` med label `post-pilot`.
2. Tittel: kort beskrivelse (f.eks. "Admin-UI: GameManagement trenger edit-path").
3. Body:
   - Observert under pilot (dato + spill-ID)
   - Forventet atferd
   - Faktisk atferd
   - Reproduksjonssteg
   - Foreslått fix
4. Link til `#bingo-pilot`-Slack-melding hvis relevant.
5. Assign PM — PM prioriterer i Bølge 2-planlegging.

**Eksempler på issues som forventes fra pilot:**
- Master-konsoll refund-preview mangler stop-dialog
- Scanner-HW-integrasjon ikke testet
- Cross-hall vinner-varsel for spillerne
- GameManagement edit-path
- Jackpot-akkumulering
- Minispill-runtime

---

## 7. Bruk av test-scripts

### 7.1 Oversikt

| Script | Formål | Når brukes |
| --- | --- | --- |
| `scripts/seed-pilot-halls.mts` | Opprett 4 haller + hall-gruppe | Én gang per miljø, pre-pilot |
| `scripts/seed-pilot-game-plan.mts` | Opprett 3 GameManagement-rader | Én gang per pilot-dag (eller idempotent re-kjør) |
| `scripts/pilot-teardown.mts` | Soft-slett alt pilot-data | Etter pilot eller ved reset |

Full dokumentasjon: [`../../scripts/PILOT_SETUP_README.md`](../../scripts/PILOT_SETUP_README.md).

### 7.2 Når bruke `seed`

- **Før første pilot-kjøring:** kjør `seed-pilot-halls.mts` én gang. Oppretter haller + gruppen.
- **Hver pilot-dag morgen:** kjør `seed-pilot-game-plan.mts` for å få dagens 3 GameManagement-rader. Scriptet er idempotent — kjører du det to ganger samme dag, oppdateres eksisterende rader.
- **Ved DB-reset i staging:** begge scripts i rekkefølge. Tar < 1 min totalt.

Eksempel (lokal staging):

```bash
# Førstegangs-oppsett
APP_PG_CONNECTION_STRING="postgres://localhost:5432/spillorama" \
  npx tsx scripts/seed-pilot-halls.mts

# Daglig rigging
APP_PG_CONNECTION_STRING="postgres://localhost:5432/spillorama" \
  npx tsx scripts/seed-pilot-game-plan.mts
```

For live-DB:

```bash
PILOT_TARGET=live PILOT_CREATED_BY="tobias" \
  APP_PG_CONNECTION_STRING="postgres://<live-url>" \
  npx tsx scripts/seed-pilot-halls.mts
```

Live-kjøring krever eksplisitt `PILOT_TARGET=live` for å hindre utilsiktet produksjonsskriv. Alle operasjoner er slug-prefikset (`pilot-*`) så produksjonsdata er urørt.

### 7.3 Når bruke `teardown`

- **Etter pilot (frivillig):** hvis du vil rydde opp pilot-data før produksjonsoppstart. Soft-delete (rader bevares med `deleted_at` + `is_active = false`).
- **Ved DB-problem mellom pilot-dager:** hvis noen rad har blitt korrupt og du vil starte fra null.
- **I staging når ny PR krever ren state.**

```bash
APP_PG_CONNECTION_STRING="postgres://<url>" \
  npx tsx scripts/pilot-teardown.mts
```

**NB:** teardown er **idempotent og soft**. Ingen historikk tapes. Hvis du vil **hard-purge** (egentlig slette): manuell SQL mot `app_halls`, `app_hall_groups`, `app_game_management` + tilhørende `app_game1_scheduled_games`, `app_wallet_transactions`, `app_game1_wins`. Ikke anbefalt uten eksplisitt Tobias-godkjenning — mister regulatorisk trail.

### 7.4 Workaround for pre-existing bugs

**`app_halls.status`-kolonne:**

`HallGroupService.loadMembers()` (apps/backend/src/admin/HallGroupService.ts:577) spør etter `app_halls.status` som **ikke eksisterer** i `app_halls`-schemaet. Scripts feiler på hall-gruppe-opprettelse hvis kolonnen mangler.

**Workaround:**

```sql
ALTER TABLE app_halls
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
```

Kjør mot DB-en én gang før `seed-pilot-halls.mts`. Ikke-destruktivt (DEFAULT 'active' for eksisterende rader).

**Langsiktig fix:** oppdater `HallGroupService.loadMembers()` til å referere `h.is_active` istedenfor `h.status` (eller legg til `status`-kolonne permanent i `PlatformService.initializeSchema()`). Dette er en separat issue for Bølge 2 — ikke del av pilot-runbooken.

**Dry-run-modus:**

Sett `PILOT_DRY_RUN=1` for å se hva scriptene ville gjort uten å skrive:

```bash
PILOT_DRY_RUN=1 APP_PG_CONNECTION_STRING="postgres://..." \
  npx tsx scripts/seed-pilot-halls.mts
```

Bruk alltid dry-run før live-DB-kjøring hvis i tvil.

---

## Referanser

- [`../qa/PILOT_QA_GUIDE_2026-04-22.md`](../qa/PILOT_QA_GUIDE_2026-04-22.md) — manuell QA-prosedyre
- [`../operations/PILOT_CUTOVER_RUNBOOK.md`](../operations/PILOT_CUTOVER_RUNBOOK.md) — hall-for-hall cutover
- [`../operations/OBSERVABILITY_RUNBOOK.md`](../operations/OBSERVABILITY_RUNBOOK.md) — Grafana + Sentry
- [`../operations/ROLLBACK_RUNBOOK.md`](../operations/ROLLBACK_RUNBOOK.md) — BIN-540 flag rollback
- [`../operations/HALL_PILOT_RUNBOOK.md`](../operations/HALL_PILOT_RUNBOOK.md) — generell pilot-runbook (BG-027)
- [`../operations/ADMIN_RUNBOOK_OPERATOR_RBAC.md`](../operations/ADMIN_RUNBOOK_OPERATOR_RBAC.md) — rolle + admin-felter
- [`../architecture/GAME1_PR4E_ADMIN_POLISH_PILOT_QA_DESIGN_2026-04-22.md`](../architecture/GAME1_PR4E_ADMIN_POLISH_PILOT_QA_DESIGN_2026-04-22.md) — PR 4e-design
- [`../architecture/PHYSICAL_TICKETS_FINAL_SPEC_2026-04-22.md`](../architecture/PHYSICAL_TICKETS_FINAL_SPEC_2026-04-22.md) — PT-spec (Bølge 2)
- [`../compliance/RELEASE_GATE.md`](../compliance/RELEASE_GATE.md) — pengeflyt-e2e-test
- [`../compliance/SPILLVETT_HANDOVER_CHECKLIST_2026-04-11.md`](../compliance/SPILLVETT_HANDOVER_CHECKLIST_2026-04-11.md) — Spillvett-status
- [`../../scripts/PILOT_SETUP_README.md`](../../scripts/PILOT_SETUP_README.md) — test-scripts

---

**Endringslogg**

| Dato | Endring | Av |
| --- | --- | --- |
| 2026-04-22 | Initial opprettelse for Bølge 1 siste leveranse (PR 4e.3). | Agent 2 (sub-agent under PM) |
