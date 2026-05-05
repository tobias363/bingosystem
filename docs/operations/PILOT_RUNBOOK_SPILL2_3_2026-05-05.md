# Pilot-runbook — Spill 2 (rocket) + Spill 3 (monsterbingo)

**Dato:** 2026-05-05
**Scope:** Pilot-readiness for Spill 2 og Spill 3, **online-only**, ETT globalt rom per spill, perpetual loop. Spill 1 (multi-hall master-modell) er dekket separat — se [`PILOT_4HALL_DEMO_RUNBOOK.md`](./PILOT_4HALL_DEMO_RUNBOOK.md) og [`PILOT_SMOKE_TEST_CHECKLIST_2026-04-28.md`](./PILOT_SMOKE_TEST_CHECKLIST_2026-04-28.md).

**Hvorfor dette dokumentet finnes separat:** Spill 2/3's pilot-modell er fundamentalt forskjellig fra Spill 1. Ingen master, ingen group-of-halls, ingen physical bonger, ingen agent-rolle for round-control. Å mash det inn i 4-hall-runbookene gjør begge dokumenter mindre lesbare. Dette dokumentet pluss Spill 1-runbookene = komplett pilot-paket for alle tre hovedspill.

---

## §1 Modell-forskjell vs Spill 1

| Aspekt | Spill 1 | Spill 2 + 3 |
|---|---|---|
| Rom-modell | Per group-of-halls med master | **ETT globalt rom** (`ROCKET` / `MONSTERBINGO`) |
| Master/start/stop | Master-rolle starter runder | **Aldri stopper** — perpetual loop |
| Physical bonger | Ja, scannes av agent | **Nei** — kun online-bonger |
| Agent-portal-flyt | Cash-in/out, settlement, register-tickets, check-for-bingo | **Ikke relevant** for Spill 2/3 |
| Schedule | Per-hall-vindu (start/end) | **Ingen schedule** — alltid på |
| Compliance per hall | Multi-hall-actor-binding (§71) | **Multi-hall-actor-binding** (samme bug-fix gjelder, PR #443) |
| §11-prosent | 15 % (hovedspill) | 15 % (begge er hovedspill) |
| Mini-games | Wheel/Chest/Mystery/ColorDraft | **Ingen** |
| Lucky Number | Bonus ved Fullt Hus | **Spill 2: ja**; Spill 3: nei |
| Ticket-typer | 8 farger | **1 type ("Standard")** |
| Pause mellom runder | Master-styrt | **30 s automatisk** (`PERPETUAL_LOOP_DELAY_MS`) |
| Pause mellom baller | Per-room config | **2 s globalt** (`AUTO_DRAW_INTERVAL_MS`) |

Konsekvenser:
- Pre-flight er kortere fordi det er færre koordinerings-overflater.
- Pilot-cutover er ikke "per hall" som Spill 1 — det er én globalt-toggle av "lar vi spillere kjøpe inn på `rocket` / `monsterbingo`".
- Avbruddshåndtering er enklere: hvis perpetual loop fryser, restart ny runde via debug-endpoint. Ingen master-handover å worry om.

---

## §2 Pre-flight checklist (kvelden før pilot-launch)

### Infrastruktur
- [ ] `GET https://spillorama-system.onrender.com/health` → 200
- [ ] `GET https://spillorama-system.onrender.com/api/status` viser `bingo`, `rocket`, `monsterbingo` alle som `operational`
- [ ] Render dashboard: ingen crashed/restarting services, ingen nylige restart-loops
- [ ] Postgres: connection-count godt under limit
- [ ] Redis: tilgjengelig, ingen lagging-warnings

### Aktive env-vars verifiseres
```bash
SERVICE_ID=srv-d7bvpel8nd3s73fi7r4g
RENDER_TOKEN=rnd_DBuI0RvZ0LxEsZRCjiXXAhQrDa1W

curl -s "https://api.render.com/v1/services/$SERVICE_ID/env-vars" \
  -H "Authorization: Bearer $RENDER_TOKEN" | jq '.[] | select(.envVar.key | test("AUTO_DRAW_INTERVAL_MS|PERPETUAL_LOOP_DELAY_MS|RESET_TEST_PLAYERS"))'
```

Forventet:
- `AUTO_DRAW_INTERVAL_MS=2000` (2 s mellom baller)
- `PERPETUAL_LOOP_DELAY_MS=30000` (30 s mellom runder)
- `RESET_TEST_PLAYERS_TOKEN=spillorama-2026-test` (debug-endpoints)
- `RESET_TEST_PLAYERS` ikke satt i prod (skal være fjernet — ellers boot-script gjenoppretter test-bruker hver deploy)

### Engine-state
```bash
# ROCKET-rom finnes og er i kjørende state
curl -s 'https://spillorama-system.onrender.com/api/_dev/game2-state?token=spillorama-2026-test&roomCode=ROCKET' | jq '{status: .room.status, players: (.room.players | length), prizePool: .room.prizePool, drawCount: (.room.drawnNumbers | length)}'

# MONSTERBINGO-rom samme
curl -s 'https://spillorama-system.onrender.com/api/_dev/game2-state?token=spillorama-2026-test&roomCode=MONSTERBINGO' | jq '{status: .room.status, players: (.room.players | length), prizePool: .room.prizePool, drawCount: (.room.drawnNumbers | length)}'
```

Forventet for hvert rom:
- `status` ∈ {`LOBBY`, `WAITING`, `RUNNING`, `ENDED`} — ALDRI `STUCK` eller mangler
- `players` ≥ 0
- `prizePool` ≥ 0
- Hvis `drawCount` står stille på samme verdi i flere kall etter hverandre under `RUNNING` → engine henger (avbruddshåndtering, §6)

### Compliance-binding (§71 multi-hall)
Spill 2/3 er ETT globalt rom, men spillere kjøper inn fra forskjellige haller. Compliance-ledger skal binde hvert kjøp til kjøpe-hallen. Bekreft via en testtransaksjon:

```bash
# Logg inn test-bruker → kjøp 1 brett i Spill 2
# Sjekk app_compliance_ledger via admin API for siste rad:
curl -s 'https://spillorama-system.onrender.com/api/admin/ledger/entries?limit=1' \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data[0] | {hallId, gameType, eventType, amount}'
```

Forventet: `hallId` matcher hallen test-brukeren er bundet til (ikke null, ikke en placeholder), `gameType=MAIN_GAME`, `eventType=STAKE`, `amount=10`. Bug-fix i PR #443 sikrer dette.

### Ingen pre-existing pilot-blokkere
- [ ] Ingen åpne CRITICAL-saker for Spill 2/3 i Linear
- [ ] Sjekk siste 24 t Render-logs for `error`-nivå eller `unhandled`/`crash`
- [ ] Visual-harness/lokalt: kjøp + draw-flyt funker uten console-errors

---

## §3 Smoke-test (10-15 min, kjør 1-2 t før launch)

Bruk test-brukeren mot prod. Disse 15 sjekkpunktene er den autoritative pilot-godkjennelses-listen — alle MÅ være grønne.

```
URL:      https://spillorama-system.onrender.com/web/
Login:    test@spillorama.no / Test1234!
Hall:     auto (Demo Bingohall)
```

### Spill 2 (ROCKET)
- [ ] **#1** Logg inn → klikk "Spill 2" → spill-skjerm laster uten console-errors
- [ ] **#2** BallTube viser "Neste trekning: MM:SS" mellom runder; "Trekk N/21" under aktiv runde
- [ ] **#3** Klikk "Kjøp flere brett" → Game1BuyPopup (HTML) åpner — IKKE 32-bonge-skjerm
- [ ] **#4** Velg 2 brett → Kjøp → 2 bonger sentrert i grid + "Innsats: 20 kr"
- [ ] **#5** Vent på runde-start → bonger blir aktive (auto-mark fungerer)
- [ ] **#6** Klikk "Forhåndskjøp neste runde" mid-runde → kjøp 3 → INGEN bonger vises (skjult under RUNNING)
- [ ] **#7** Vent på game-end + countdown → 3 bonger blir synlige umiddelbart
- [ ] **#8** Jackpot-priser forblir synlige under countdown (ikke 0)

### Spill 3 (MONSTERBINGO)
- [ ] **#9** Klikk "Spill 3" → 5×5 grid uten free-center
- [ ] **#10** T/X/7/Pyramide-mønstre vises i pattern-pills
- [ ] **#11** Buy-popup identisk med Spill 2 (begge bruker Game1BuyPopup)
- [ ] **#12** Auto-draw kjører — ball hver 2 s

### Reconnect-resilience (begge spill)
- [ ] **#13** Mid-runde: DevTools Network-throttle "Offline" 10 s → "Online" → klient gjenoppretter automatisk uten F5
- [ ] **#14** Tab-refresh midt i runde: bongene står på samme state (server-authoritative)
- [ ] **#15** Console: ingen unhandled-rejection eller WebSocket-errors etter reconnect

**Akseptkriterium:** alle 15 grønne. Hvis 1+ rød → ikke launch. Eskaler.

Den siste E2E-rapporten ligger i [`E2E_TEST_REPORT_2026-05-05.md`](./E2E_TEST_REPORT_2026-05-05.md) (genereres av automatisert test-agent).

---

## §4 Roller på pilot-dagen (Spill 2/3)

Modellen er enklere enn Spill 1 fordi det ikke er en agent-rolle for round-control.

| Rolle | Ansvar | Antall |
|---|---|---|
| **PM / Tobias** | Final go/no-go. Eier kommunikasjon mot supportkjede. | 1 |
| **Backend on-call** | Watcher logs + status-side. Kan trigge debug-endpoints ved henging. | 1 |
| **L1 hall-support (per hall)** | Hjelper spillere med login/wallet — ikke spilllogikk siden Spill 2/3 er online-only. | 1 per hall |
| **Compliance owner** | Tilgjengelig for myndighets-spørsmål. Ikke aktiv på pilot-dagen. | 1 |

> **Merknad om hall-rollen:** Spillere kan spille Spill 2/3 fra hvilken som helst hall (de er ETT globalt rom). Hallens jobb er kun å hjelpe spilleren komme på nett, kjøpe inn wallet-saldo, etc. — ikke å koordinere selve spillet.

---

## §5 Live drift — overvåking under pilot

### Sjekk hvert 15. min
```bash
# Status-side
curl -s 'https://spillorama-system.onrender.com/api/status' | jq '{overall, rocket: .components[] | select(.component=="rocket"), monsterbingo: .components[] | select(.component=="monsterbingo")}'

# Engine-state
curl -s 'https://spillorama-system.onrender.com/api/_dev/game2-state?token=spillorama-2026-test&roomCode=ROCKET' | jq '{status: .room.status, players: (.room.players | length), drawCount: (.room.drawnNumbers | length)}'
curl -s 'https://spillorama-system.onrender.com/api/_dev/game2-state?token=spillorama-2026-test&roomCode=MONSTERBINGO' | jq '{status: .room.status, players: (.room.players | length), drawCount: (.room.drawnNumbers | length)}'
```

### Tegn på problem
| Symptom | Diagnose | Tiltak |
|---|---|---|
| `drawCount` står stille i 30+ s under `RUNNING` | Auto-draw cron henger | §6 force-end + ny runde |
| `status=ENDED` i mer enn 60 s | Perpetual loop tikker ikke | §6 force-end + ny runde |
| `prizePool=0` med `players > 0` mid-runde | Ledger-binding svikter | Eskaler L2 backend, ikke selvfix |
| Status-side viser `outage` for `rocket` eller `monsterbingo` | Engine-helsesjekk feilet | Sjekk Render-logs for stack-trace, eskaler |
| Console-feil hos test-bruker (egen test-tab) | Klient-bug | Capture screenshot + console, eskaler |

### Compliance-overvåking
Sjekk at hvert kjøp havner i `app_compliance_ledger` med riktig hall-binding:
```bash
curl -s 'https://spillorama-system.onrender.com/api/admin/ledger/entries?limit=20' \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data[] | {createdAt, hallId, gameType, eventType, amount}'
```

`gameType=MAIN_GAME` for alle Spill 2/3-rader. `hallId` skal aldri være `null`.

---

## §6 Avbruddshåndtering

### A) Perpetual loop fryser (drawCount står stille)
```bash
# Force-end nåværende runde + spawn ny
curl -X POST 'https://spillorama-system.onrender.com/api/_dev/game2-force-end' \
  -H 'Content-Type: application/json' \
  -d '{"token":"spillorama-2026-test","roomCode":"ROCKET"}'

# Spill 3 samme
curl -X POST 'https://spillorama-system.onrender.com/api/_dev/game2-force-end' \
  -H 'Content-Type: application/json' \
  -d '{"token":"spillorama-2026-test","roomCode":"MONSTERBINGO"}'
```

Etter dette: poll engine-state. Innen 30 s skal ny runde være i `LOBBY` eller `WAITING`. Hvis ikke → eskaler.

### B) Status-side viser `outage` for et spill
1. Sjekk Render-logs for stack-trace siste 5 min
2. Hvis `engine.getAllRoomCodes()` feiler → engine selv er ødelagt → Render restart
3. Hvis Postgres-feil → trolig DB-related, eskaler L2

### C) Klient-feil hos test-bruker etter deploy
Indikerer regresjon. Last forrige deploy via Render dashboard ("Redeploy previous"). Pause pilot. Postmortem.

### D) Wallet/compliance-anomali (saldo feil, dobbeltrader i ledger)
**Stopp pilot umiddelbart.** Eskaler til L2 + compliance. Capture state-snapshot:
```bash
curl -s 'https://spillorama-system.onrender.com/api/admin/ledger/entries?limit=100' \
  -H "Authorization: Bearer $ADMIN_TOKEN" > ledger-snapshot.json
```

---

## §7 Cutover-strategi (når flipper vi til ekte spillere?)

Spill 2/3 har ingen per-hall-flag som Spill 1's `client_variant`. Tilgang styres av:
- **Tilgjengelighet:** Spill 2 og Spill 3 er enabled per `app_games.is_enabled`. Default er `true` på prod nå.
- **Test-bruker isolasjon:** dagens setup på prod tillater alle innloggede å se og spille Spill 2/3.

Anbefalt cutover-rekkefølge:
1. **Soft launch:** Inviter en liten gruppe pilot-spillere (5-10 stk) som sponsorer. La dem spille i 24-48 t. Watch debug-endpoints + compliance-ledger.
2. **Bredere åpning:** Hvis ingen issues, åpne for alle spillere på en av pilot-hallene.
3. **Full pilot:** Etter 1 uke uten incident → alle haller.

Dette må koordineres med Spill 1-piloten siden test-spillere kan velge spill fra lobby. Anbefaling: launch Spill 1 pilot **først**, så Spill 2/3 1 uke senere når Spill 1 viste seg stabilt.

---

## §8 Rollback

> **Viktig:** Verifisert 2026-05-05 at engine IKKE sjekker `app_games.is_enabled` for Spill 2/3 buy/arm-flyt eller perpetual-loop-spawning. `is_enabled=false` skjuler kun spillet fra lobby (`GET /api/games?includeDisabled=false`). Korrekt rollback krever begge stegene under.

### Soft rollback (begge må kjøres for full pause)

**Steg 1 — skjul fra lobby** (hindrer at nye spillere ser/joiner spillet):
```bash
# Via admin API — disable Spill 2 og 3 fra lobby-oppslag
curl -X PUT 'https://spillorama-system.onrender.com/api/admin/games/rocket' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"isEnabled": false}'

curl -X PUT 'https://spillorama-system.onrender.com/api/admin/games/monsterbingo' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"isEnabled": false}'
```

**Steg 2 — stopp perpetual loop** (hindrer at ny runde spawner etter pågående er ferdig):
```bash
SERVICE_ID=srv-d7bvpel8nd3s73fi7r4g
RENDER_TOKEN=rnd_DBuI0RvZ0LxEsZRCjiXXAhQrDa1W

curl -X PUT "https://api.render.com/v1/services/$SERVICE_ID/env-vars/PERPETUAL_LOOP_DISABLED_SLUGS" \
  -H "Authorization: Bearer $RENDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"rocket,monsterbingo"}'
```

Render trigger automatisk redeploy ved env-var-endring. Tar ~5-7 min.

**Konsekvenser:**
- Pågående runde fullfører normalt — spillere som er armet får siste sjanse til å vinne.
- Ingen ny runde spawner etter den fullfører.
- Nye spillere ser ikke Spill 2/3 i lobby.
- Eksisterende spillere som fortsatt har spill-tab åpen kan se "Lukket" eller tomt rom — verifiser i smoke-test.

**For å reaktivere:** sett `isEnabled=true` på `app_games` + slett (eller fjern slugs fra) `PERPETUAL_LOOP_DISABLED_SLUGS`.

### Hard rollback: forrige deploy
Render dashboard → "Redeploy previous" → forrige stabile bygg. Tar ~5 min. Bruk dette hvis problemet er kode-relatert (ny PR introduserte regression).

---

## §9 Etter pilot-dag

- [ ] Eksporter alle `app_compliance_ledger`-rader for pilot-perioden
- [ ] Sjekk hash-chain-integritet (BIN-764)
- [ ] Generer §11-distribusjons-rapport, valider 15 % til org-konto for Spill 2/3
- [ ] Sjekk Render-logs for warnings
- [ ] Notér alle bugs / friksjon-punkter
- [ ] Kjør smoke-test på nytt for å bekrefte at pilot ikke etterlot rar state
- [ ] Retro: hva fungerte, hva ikke

---

## §10 Referanser

- [PM-handoff 2026-05-05](./PM_HANDOFF_2026-05-05_spill2-3-pilot-ready.md) — kontekst på siste sesjon
- [game2 canonical spec](../engineering/game2-canonical-spec.md) — frosset Spill 2-spec
- [game3 canonical spec](../engineering/game3-canonical-spec.md) — frosset Spill 3-spec
- [Status-page-runbook](./STATUS_PAGE.md) — komponentstatus-overvåking
- [Spill 1 4-hall-runbook](./PILOT_4HALL_DEMO_RUNBOOK.md) — søsken-runbook for Spill 1
- [Spill 1 smoke-test sjekkliste](./PILOT_SMOKE_TEST_CHECKLIST_2026-04-28.md) — sjekkliste for Spill 1 pilot-dag
- [Spillkatalog](../architecture/SPILLKATALOG.md) — autoritativ kilde for spill-klassifisering

---

## §11 Endringslogg

- 2026-05-05 — opprettet, basert på PM-handoff 2026-05-05 + canonical specs + Spill 1-runbookenes mal.

---

**Eier:** Tobias / operativ-PM. Oppdater når engine-modellen for Spill 2/3 endres.
