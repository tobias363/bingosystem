# Game Live-Readiness Checklist

> **Mal og revisjonslogg** — Bruk denne som utgangspunkt for hvert spill før det går live.  
> Første gang kjørt: Spill 1 (Bingo 75-kule), april 2026.

---

## Fremgangsmåte

For hvert spill:
1. Kopier seksjonen **Sjekkliste** og fyll ut kolonnene
2. For hvert punkt med status ⚠️ eller ❌ — gå til tilhørende **Detaljert gjennomgang** og utfør fix
3. Kjør kompilesjekk (`check_compile_errors` via Coplay MCP) etter alle Unity-endringer
4. Verifiser DB-konfigurasjonen mot faktisk verdi (ikke bare hva koden antar)
5. Sjekk 24–26 (E2E) krever manuell testing i staging-miljø
6. Sjekk 27–30 (drift) krever tilgang til prod-miljø og infrastruktur
7. Dokumenter funn og tidspunkt i **Revisjonslogg** nederst

### Kategorier

| Sjekk | Kategori | Krever |
|-------|----------|--------|
| 1–4 | Unity/Web Shell-integrasjon | Kode-review + browser-test |
| 5, 8, 11 | Database-konsistens | SQL-sjekk + kode-review |
| 6–7, 17–20 | Regulatorisk compliance | Kode-review + juridisk |
| 9–10 | Kode-kvalitet (stubs) | grep/søk i kode |
| 12–16 | Sikkerhet (pengeflyt) | Kode-review |
| 21–23 | Produksjons-robusthet | Kode-review |
| 24–26 | E2E-testing | Manuell test i staging |
| 27–30 | Drift/infrastruktur | Tilgang til prod-env |
| 31–33 | Brukeropplevelse (UX) | Browser-test |
| 34–37 | Forretningslogikk | Admin-panel + DB-sjekk |

---

## Sjekkliste

| # | Område | Sjekk | Spill 1 | Spill 2 | Spill 3 | Web 1 | Web 2 | Web 3 | Web 5 |
|---|--------|-------|---------|---------|---------|-------|-------|-------|-------|
| 1 | Klient → Socket | Kjøpsflyt kobler til ekte socket-event | ✅ | ✅ | ✅ | | | | |
| 2 | Klient — UI | «Se kjøpte billetter» åpner faktisk spillbrettet | ✅ | ✅ | ✅ | | | | |
| 3 | Web Shell | Saldo oppdateres live under spill (ikke bare ved oppstart) | ✅ | ✅ | ✅ | | | | |
| 4 | Web Shell | Lommebok-knapp i game-bar åpner profil/Spillvett-panel | ✅ | ✅ | ✅ | | | | |
| 5 | Database | `max_tickets_per_player` ≤ 30 og korrekt i `app_hall_game_config` | ✅ | ✅ | ✅ | ¹ | ¹ | ¹ | ¹ |
| 6 | Compliance | Tvangspause (60 min spill → 5 min pause) aktiv og testet | ✅ | ✅ | ✅ | | | | |
| 7 | Compliance | KYC + alderssjekk blokkerer ukjente spillere ved arming | ✅ | ✅ | ✅ | | | | |
| 8 | Database | Hall-bingo-konfig har `is_enabled = true` for aktive haller | ✅ | ✅ | ✅ | ¹ | ¹ | ¹ | ¹ |
| 9 | Kode | Ingen TODO/stub-metoder igjen i spillets purchase-panel | ✅ | ⚠️ | ✅ | | | | |
| 10 | Kode | Ingen TODO/stub-metoder i «Se kjøpte billetter»-flyt | ✅ | ✅ | ✅ | | | | |
| 11 | Kode | `ticketsPerPlayer`-grense konsistent mellom kode og DB | ✅ | ✅ | ✅ | | | | |
| 12 | Sikkerhet | Idempotency på alle wallet-overføringer (buyin, refund, prize) | ✅ | ✅ | | ² | ² | ² | ² |
| 13 | Sikkerhet | Double-payout guard (KRITISK-4) og unarmed-claim-guard (KRITISK-8) | ✅ | ✅ | | ² | ² | ² | ² |
| 14 | Sikkerhet | Rollback/refund ved feil midtveis i buy-in (BIN-250/HOEY-4) | ✅ | ✅ | | ² | ² | ² | ² |
| 15 | Sikkerhet | PlayerId fra access token, ikke klient-payload (BIN-46) | ✅ | ✅ | | ² | ² | ² | ² |
| 16 | Sikkerhet | Rate limiting på socket-events (`bet:arm`, `game:start`) | ✅ | ✅ | | ² | ² | ² | ² |
| 17 | Compliance | Tap-grenser (daglig/månedlig, per hall) sjekkes før runde | ✅ | ✅ | | ² | ² | ² | ² |
| 18 | Compliance | Selvutelukkelse (min 365 dager) og tidsbestemt pause fungerer | ✅ | ✅ | | ² | ² | ² | ² |
| 19 | Compliance | Premiepolicy — enkelpremiegrense og daglig ekstrapremiegrense | ✅ | ✅ | | ² | ² | ² | ² |
| 20 | Compliance | Entry fee-tak i kode samsvarer med regulatorisk grense | ⚠️ | ⚠️ | | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| 21 | Produksjon | Ingen `console.log` med persondata i produksjons-codepaths | ✅ | ✅ | | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| 22 | Test | Alle enhetstester og compliance-tester passerer | ✅ | ✅ | | | | | |
| 23 | Drift | Checkpoint-skriving etter utbetaling er robust | ✅ | ✅ | | ² | ² | ² | ² |
| 24 | E2E | Full runde arm → buy-in → draw → LINE → BINGO → utbetaling fungerer | ✅ | | | | | | |
| 25 | E2E | Spiller som mister tilkobling mid-runde kan reconnecte og se sine billetter | | | | | | | |
| 26 | E2E | Tom runde (0 eligible spillere) krasjer ikke — runden avsluttes ryddig | | | | | | | |
| 27 | Drift | Env-variabler i prod stemmer med forventede defaults (`BINGO_PAYOUT_PERCENT`, `AUTO_ROUND_*`) | | | | ³ | ³ | ³ | ³ |
| 28 | Drift | DB-migrasjoner er kjørt i riktig rekkefølge i prod-miljøet | | | | ³ | ³ | ³ | ³ |
| 29 | Drift | Alarm/varsling er konfigurert for CRITICAL-logger (wallet-feil, checkpoint-feil, refund-feil) | | | | | | | |
| 30 | Drift | Server-restart mid-runde: checkpoint-recovery gjenoppretter spilltilstand korrekt | | | | | | | |
| 31 | UX | Feilmeldinger til spiller er på norsk og forståelige (ikke tekniske koder) | | ✅ | | | | | |
| 32 | UX | Tap-grense/tvangspause/selvutelukkelse vises tydelig i Spillvett-panelet | | ✅ | | ² | ² | ² | ² |
| 33 | UX | Spiller ser visuelt at billettkjøp gikk gjennom (bekreftelsesmelding eller brettet åpnes) | | ✅ | | | | | |
| 34 | Forretning | `payoutPercent` er konfigurert korrekt per hall (default 80 %) | | ✅ | | ¹ | ¹ | ¹ | ¹ |
| 35 | Forretning | Auto-round-innstillinger stemmer (intervall, entry fee, min spillere) | | ✅ | | ¹ | ¹ | ¹ | ¹ |
| 36 | Forretning | Spilleplan-integrasjon: spill starter til riktige tidspunkt iht. § 64 | | ✅ | | ¹ | ¹ | ¹ | ¹ |
| 37 | Forretning | Overskuddsdistribusjon er konfigurert per hall/organisasjon | | ✅ | | ¹ | ¹ | ¹ | ¹ |

> **Tegnforklaring for web-kolonner:**
> - ¹ = Backend-sjekk, identisk for Unity og web (trenger ikke ny verifisering)
> - ² = Backend-sjekk, men web-klientens integrasjon må verifiseres
> - ³ = Delt infrastruktur, verifiseres én gang for alle web-spill
> - ⚠️ = Kjent problem — se [WEB_MIGRATION_TASKS.md](WEB_MIGRATION_TASKS.md)
> - Tom = Ikke verifisert ennå|

---

## Detaljert gjennomgang

### Sjekk 1 — Kjøpsflyt → socket-event

**Hva sjekkes:**  
Unity-panelet for billettkjøp skal kalle `SpilloramaSocketManager.Instance.BetArm()` — ikke et gammelt AIS REST-kall eller en stub.

**Fil(er) å se på:**
- `Spillorama/Assets/_Project/_Scripts/Game{N}/Game{N}TicketPurchasePanel.cs`
  - Metode: `CallGame1PurchaseDataEvent()` (henter kjøpsdata)
  - Metode: `CallPurchaseEvent()` (utfører kjøp)

**Slik verifiseres:**  
Søk etter `TODO`, `stub`, `AIS`, `WebRequests`, `SpilloramaGameBridge.LatestSnapshot` i metodene.

**Spill 1 — funn og fix:**  
Begge metodene var stubs fra AIS-systemet. Erstattet med:
- `CallGame1PurchaseDataEvent()` → bygger `Game1PurchaseDataResponse` fra `SpilloramaGameBridge.LatestSnapshot` (entryFee, remaining tickets)
- `CallPurchaseEvent()` → kaller `BetArm(armed: true, onResult, onError)` med rollback ved feil

```csharp
// CallGame1PurchaseDataEvent — nøkkellogikk
var snap = SpilloramaGameBridge.LatestSnapshot;
float entryFee = snap.currentGame?.entryFee ?? snap.scheduler?.entryFee ?? 10f;
int remaining  = SpilloramaGameBridge.MAX_TICKETS - SpilloramaGameBridge.GetCurrentTicketCount();

// CallPurchaseEvent — nøkkellogikk
SpilloramaSocketManager.Instance.BetArm(
    armed: true,
    onResult: (_) => { /* lukk panel */ },
    onError:  (err) => { SpilloramaGameBridge.ResetTicketCount(); /* vis feil */ }
);
```

---

### Sjekk 2 — «Se kjøpte billetter»

**Hva sjekkes:**  
Knappen for å vise kjøpte billetter fra lobby-panelet skal navigere inn i spillbrettet og vise faktiske billetter — ikke en stub eller tom metode.

**Fil(er) å se på:**
- `Spillorama/Assets/_Project/_Scripts/Game{N}/Game{N}PurchaseTicket.cs`
  - Metode: `View_Purchased_Ticket()`

**Slik verifiseres:**  
Søk etter `TODO`, `Debug.LogWarning`, `DisplayLoader(false)` uten etterfølgende navigasjon.

**Spill 1 — funn og fix:**  
Metoden var en tom stub med `Debug.LogWarning`. Erstattet med:
1. Sjekk `SpilloramaGameBridge.LatestSnapshot` og `GetCurrentTicketCount() > 0`
2. Bygg `GameData` fra snapshot
3. Kall `UIManager.Instance.game1Panel.OpenGamePlayPanel(gameData)` — som kaller `CallSubscribeRoom()` → `BuildGame1History()` → `GenerateTicketList()`

```csharp
public void View_Purchased_Ticket()
{
    var snap = SpilloramaGameBridge.LatestSnapshot;
    if (snap == null || SpilloramaGameBridge.GetCurrentTicketCount() <= 0) { ... return; }

    string gameId   = snap.currentGame?.id ?? Game_Data?.gameId ?? "";
    string gameName = Game_Data?.gameName ?? "Bingo";
    UIManager.Instance.game{N}Panel.OpenGamePlayPanel(new GameData { gameId = gameId, gameName = gameName });
}
```

---

### Sjekk 3 — Saldo live i game-bar

**Hva sjekkes:**  
`#game-bar-balance` i HTML-shellet skal oppdateres etter runder, ikke bare ved oppstart av Unity.

**Fil(er) å se på:**
- `backend/public/web/lobby.js`
  - Funksjon: `renderLobby()`
  - Funksjon: `loadUnityAndStartGame()`
  - Funksjon: `returnToShellLobby()`

**Slik verifiseres:**  
Søk etter `game-bar-balance` i `lobby.js`. Sjekk om det finnes polling eller synk utover `syncGameBar()` ved oppstart.

**Spill 1 — funn og fix:**  
`syncGameBar()` kopierte bare saldo én gang ved Unity-start. Løsning i tre deler:

1. **`renderLobby()`** — syncer `#game-bar-balance` hver gang lobby-data oppdateres:
```javascript
var gameBarBalEl = document.getElementById('game-bar-balance');
if (gameBarBalEl && lobbyState.wallet?.account) {
  gameBarBalEl.textContent = formatKr(lobbyState.wallet.account.balance);
}
```

2. **`startGameBarBalancePoll()`** — 30s interval som henter `/api/wallet/me` mens Unity kjører:
```javascript
_gameBarWalletInterval = setInterval(async function () {
  var wallet = await apiFetch('/api/wallet/me');
  if (wallet?.account) { /* oppdater begge balance-elementer */ }
}, 30000);
```

3. **`stopGameBarBalancePoll()`** — kalles i `returnToShellLobby()` for å rydde opp intervallet.

---

### Sjekk 4 — Lommebok-knapp i game-bar

**Hva sjekkes:**  
Lommebok-knappen i HTML game-baren skal åpne profil/Spillvett-panelet — ikke navigere bort fra spillet til lobbyen.

**Fil(er) å se på:**
- `backend/public/web/index.html` — `#lobby-back-bar` → Lommebok `<button>`

**Slik verifiseres:**  
Søk etter `game-bar-right` i `index.html` og sjekk `onclick` på Lommebok-knappen.

**Spill 1 — funn og fix:**  
Knappen kalte `window.returnToShellLobby()`. Endret til:
```html
<button class="lobby-wallet-btn" type="button"
        onclick="window.ShowSpillvettPanel && window.ShowSpillvettPanel()">
```
`ShowSpillvettPanel()` er definert i `index.html` og åpner `#profile-overlay` uten å forlate spillet.

---

### Sjekk 5 — `max_tickets_per_player` i databasen

**Hva sjekkes:**  
`app_hall_game_config.max_tickets_per_player` for `game_slug = 'bingo'` skal være ≤ 30 (norsk forskrift §2-10) og tilsvare det klienten (`MAX_TICKETS`) og env (`AUTO_ROUND_TICKETS_PER_PLAYER`) forventer.

**SQL-sjekk:**
```sql
SELECT h.name, hgc.max_tickets_per_player, hgc.is_enabled
FROM app_hall_game_config hgc
JOIN app_halls h ON h.id = hgc.hall_id
WHERE hgc.game_slug = 'bingo'
ORDER BY h.name;
```

**Sjekk også:**
- `envConfig.ts`: `AUTO_ROUND_TICKETS_PER_PLAYER` (env-var)
- `SpilloramaGameBridge.cs`: `MAX_TICKETS` (klient-konstant)
- DB-constraint: `\d app_hall_game_config` — sjekk `CHECK`-constraint

**Spill 1 — funn og fix:**  
Alle 22 haller hadde `max_tickets_per_player = 5`. DB hadde også en `CHECK`-constraint som begrenset til maks 5. Env og klient forventet 30.

Fix:
```sql
BEGIN;
ALTER TABLE app_hall_game_config
  DROP CONSTRAINT app_hall_game_config_max_tickets_per_player_check;
ALTER TABLE app_hall_game_config
  ADD CONSTRAINT app_hall_game_config_max_tickets_per_player_check
  CHECK (max_tickets_per_player >= 1 AND max_tickets_per_player <= 30);
UPDATE app_hall_game_config SET max_tickets_per_player = 30 WHERE game_slug = 'bingo';
COMMIT;
```

---

### Sjekk 6 — Tvangspause (pengespillforskriften §2-8)

**Hva sjekkes:**  
Etter 60 minutters kontinuerlig spill skal systemet tvinge en 5-minutters pause før spilleren kan spille videre.

**Fil(er) å se på:**
- `backend/src/util/envConfig.ts` — `bingoPlaySessionLimitMs`, `bingoPauseDurationMs`
- `backend/src/game/ComplianceManager.ts` — `checkPlaySessionLimit()`
- `backend/src/compliance/compliance-suite.test.ts` — integrasjonstester

**Slik verifiseres:**
```bash
grep -n "playSessionLimitMs\|pauseDurationMs" backend/src/util/envConfig.ts
grep -n "playSessionLimitMs\|pauseDurationMs" backend/.env
```

**Godkjente verdier:**
| Variabel | Env-var | Default | Krav |
|----------|---------|---------|------|
| `bingoPlaySessionLimitMs` | `BINGO_PLAY_SESSION_LIMIT_MS` | `3 600 000` (60 min) | ≤ 60 min |
| `bingoPauseDurationMs` | `BINGO_PAUSE_DURATION_MS` | `300 000` (5 min) | ≥ 5 min |

**Spill 1 — funn:**  
✅ Implementert og automatisk testet. Defaults er korrekte. Pause aktiveres ved spillets slutt (ikke midt i runde) — korrekt per forskrift. `.env` bekreftet: `3600000` / `300000`.

---

### Sjekk 7 — KYC og alderssjekk ved arming

**Hva sjekkes:**  
`bet:arm`-kallet skal avvises for spillere som ikke er KYC-verifisert eller under minstealder (18 år) i produksjon.

**Fil(er) å se på:**
- `backend/src/platform/PlatformService.ts` — `assertUserEligibleForGameplay()`
- `backend/src/sockets/gameEvents.ts` — `requireAuthenticatedPlayerAction()` → kalles ved `bet:arm`

**Slik verifiseres:**  
Søk etter `requireAuthenticatedPlayerAction` i `gameEvents.ts` for `bet:arm`-handleren og trace til `assertUserEligibleForGameplay`.

**Spill 1 — funn:**  
✅ `bet:arm` kaller `requireAuthenticatedPlayerAction()` som kaller `platformService.assertUserEligibleForGameplay(user)`.  
I produksjon (`NODE_ENV=production`) blokkeres:
- Brukere uten `kycStatus === "VERIFIED"`
- Brukere uten gyldig fødselsdato
- Brukere under 18 år

I development hoppes alle disse over (tillater lokal testing uten KYC). Korrekt oppsett.

---

### Sjekk 8 — Hall-bingo-konfig er aktivert

**Hva sjekkes:**  
Bingo-konfigurasjonen for aktive haller har `is_enabled = true`. Uten dette kaster backenden `GAME_DISABLED_FOR_HALL`.

**SQL-sjekk:**
```sql
SELECT h.name, hgc.is_enabled
FROM app_hall_game_config hgc
JOIN app_halls h ON h.id = hgc.hall_id
WHERE hgc.game_slug = 'bingo' AND hgc.is_enabled = false;
-- Bør returnere 0 rader for alle aktive haller
```

**Spill 1 — funn:**  
✅ Alle haller hadde `is_enabled = true` for bingo.

---

### Sjekk 9 & 10 — Ingen gjenværende stubs i purchase-flow

**Hva sjekkes:**  
Søk etter TODO, stub-markeringer og `Debug.LogWarning` i purchase-panelet og billettvisning.

**Kommando:**
```bash
grep -rn "TODO\|stub\|Spillorama endpoint not yet\|AIS socket call" \
  Spillorama/Assets/_Project/_Scripts/Game{N}/
```

**Spill 1 — funn og fix:**  
Fant to stubs i `Game1TicketPurchasePanel.cs` og én i `Game1PurchaseTicket.cs`. Alle tre erstattet (se sjekk 1 og 2).

---

### Sjekk 11 — `ticketsPerPlayer`-grense konsistent mellom kode og DB

**Hva sjekkes:**  
`max_tickets_per_player` i databasen (maks 30 etter migration `20260413000002`) må samsvare med hardkodede grenser i koden. Mismatch betyr enten at `game:start` via socket feiler, eller at koden tillater verdier DB avviser.

**Fil(er) å se på:**
| Fil | Linje | Hardkodet grense |
|-----|-------|------------------|
| `backend/src/game/compliance.ts` | 7 | `hallMaxTicketsPerPlayer > 5` → throw |
| `backend/src/game/BingoEngine.ts` | 421 | `ticketsPerPlayer > 5` → throw |
| `backend/src/util/httpHelpers.ts` | 167 | `parsed > 5` → throw |
| `backend/src/util/validation.ts` | 79 | `parsed > 5` → throw |
| `backend/src/util/bingoSettings.ts` | 104 | `Math.min(5, ...)` clamp |

**Slik verifiseres:**
```bash
grep -rn "ticketsPerPlayer.*> 5\|ticketsPerPlayer.*>.*5\|hallMaxTicketsPerPlayer.*> 5\|Math.min(5" \
  backend/src/game/compliance.ts \
  backend/src/game/BingoEngine.ts \
  backend/src/util/httpHelpers.ts \
  backend/src/util/validation.ts \
  backend/src/util/bingoSettings.ts
```

**Spill 1 — funn:**  
❌ **KRITISK mismatch.** DB har `max_tickets_per_player = 30` for alle haller, men koden avviser alt over 5. Konsekvens:
- `game:start` via socket → `assertTicketsPerPlayerWithinHallLimit(_, 30)` → kaster `INVALID_HALL_CONFIG` på linje 7 i compliance.ts
- Auto-round-scheduler **bypasser** denne sjekken (kaller `engine.startGame()` direkte med clamped `autoRoundTicketsPerPlayer ≤ 5`), så auto-round fungerer
- Manuell game start fra admin/klient feiler alltid
- Unity-klienten har `MAX_TICKETS = 30` som aldri kan utnyttes

**Anbefalt fix:** Enten oppdater alle 5 steder til maks 30, eller reverter DB til maks 5. Oppdater tester tilsvarende.

---

### Sjekk 12–16 — Sikkerhet (wallet, claims, autentisering)

**Hva sjekkes:**  
Sentrale sikkerhetskontroller i pengeflyten:

1. **Idempotency**: Alle wallet-overføringer bruker unike nøkler som forhindrer dobbelbetaling ved retry
2. **Double-payout guard**: KRITISK-4 (re-check `game.bingoWinnerId`) og KRITISK-8 (kun deltakere kan kreve premie)
3. **Rollback/refund**: BIN-250/HOEY-4 — alle debiterte spillere refunderes ved feil midtveis
4. **PlayerId fra token**: BIN-46 — playerId utledes fra access token, ikke klient-payload
5. **Rate limiting**: Socket-events rate-limited (bet:arm 5s/10, game:start walletId-basert)

**Fil(er) å se på:**
- `BingoEngine.ts`: linjer 462-497 (buy-in), 706-1000 (claims), 1870-1894 (refund)
- `gameEvents.ts`: linjer 238 (token-validering), 491-508 (bet:arm)
- `socketRateLimit.ts`: rate limit-konfig

**Spill 1 — funn:**  
✅ Alle fem kontroller er implementert og testet. Idempotency keys:
- Buy-in: `buyin-{gameId}-{playerId}`
- Refund: `refund-{gameId}-{playerId}`
- LINE-premie: `line-prize-{gameId}-{claimId}`
- BINGO-premie: `bingo-prize-{gameId}-{claimId}`

---

### Sjekk 17–19 — Compliance (tap-grenser, selvutelukkelse, premiepolicy)

**Hva sjekkes:**
1. **Tap-grenser**: `wouldExceedLossLimit()` sjekkes i `filterEligiblePlayers()` før runden
2. **Selvutelukkelse**: Minimum 365 dager, kan ikke oppheves. Sjekkes i `isPlayerBlockedByRestriction()`
3. **Premiepolicy**: Enkelpremiegrense 2 500 kr, daglig ekstrapremiegrense 12 000 kr. SHA-256 audit trail.

**Fil(er) å se på:**
- `ComplianceManager.ts`: tap-grenser, play session, selvutelukkelse
- `PrizePolicyManager.ts`: premiecaps, applySinglePrizeCap(), audit trail
- `PayoutAuditTrail.ts`: SHA-256-kjede med hash-chain og chainIndex

**Spill 1 — funn:**  
✅ Alle tre kontroller er implementert. Compliance-suite tests (6/6) dekker:
- Daglig/månedlig tap-grense per hall
- Tvangspause etter 60 min
- Selvutelukkelse min 365 dager
- Premiegrenser og audit trail

---

### Sjekk 20 — Entry fee regulatorisk grense

**Hva sjekkes:**  
`entryFee`-validering i `BingoEngine.ts:417` tillater inntil 10 000 NOK. Verifiser at dette samsvarer med pengespillforskriften for databingo.

**Spill 1 — funn:**  
⚠️ Koden tillater 10 000 kr per innsats. Pengespillforskriften (§2-10) kan ha lavere grense for databingo. **Krever juridisk avklaring før go-live.**

---

### Sjekk 21 — Produksjonslogging

**Hva sjekkes:**  
Ingen `console.log`-statements med persondata (spillernavn, walletId, hallId) i kode som kjører i produksjon.

**Kommando:**
```bash
grep -n "console.log" backend/src/sockets/gameEvents.ts
```

**Spill 1 — funn:**  
⚠️ 7 `console.log`-kall i `gameEvents.ts` (linje 248, 321, 324, 347, 364, 384, 478) logger walletId, hallId og spillernavn. Bør erstattes med strukturert logger (pino) eller fjernes. Risiko: persondata i ukontrollerte loggstrømmer i prod.

---

### Sjekk 22 — Enhetstester passerer

**Hva sjekkes:**  
Alle tester i `BingoEngine.test.ts` og `compliance-suite.test.ts` passerer uten feil.

**Kommando:**
```bash
cd backend && npx tsx --test src/game/BingoEngine.test.ts
cd backend && npx tsx --test src/compliance/compliance-suite.test.ts
```

**Spill 1 — funn:**  
✅ 30/30 BingoEngine-tester passerer. 6/6 compliance-tester passerer. Dekker KRITISK-4, KRITISK-8, HOEY-4, refund, checkpoint, premiepolicy, tap-grenser.

---

### Sjekk 23 — Checkpoint-robusthet

**Hva sjekkes:**  
Checkpoint-skriving etter utbetaling (BIN-48) logger feil men stopper ikke spillet. Vurder om dette er akseptabel risiko.

**Fil(er) å se på:**
- `BingoEngine.ts`: linje 865-881 (LINE checkpoint), 975-991 (BINGO checkpoint)

**Spill 1 — funn:**  
⚠️ Checkpoint-feil etter utbetaling er `catch`-et og logget som CRITICAL, men spillet fortsetter. Romstatus persisteres separat via `rooms.persist()` (linje 883, 993), men den fullstendige `RecoverableGameSnapshot` kan gå tapt. Lav sannsynlighet, men konsekvens er at en serverdød etter feil-checkpoint kan føre til inkonsistent tilstand ved gjenoppretting.

---

### Sjekk 24 — Full E2E-runde

**Hva sjekkes:**  
En komplett spillrunde fra start til slutt med ekte pengeflyt:  
`bet:arm` → `game:start` (buy-in debiteres) → `draw:next` (trekninger) → `claim:submit LINE` (30 % premie) → `claim:submit BINGO` (resterende premie) → spill avsluttes → saldo oppdatert korrekt.

**Slik verifiseres:**  
1. Koble til med 2+ spillere via socket
2. Arm begge spillere
3. Start runde med `entryFee > 0`
4. Verifiser at begge spillernes saldo er redusert med `entryFee`
5. Trekk tall til en spiller har linje — submit LINE claim
6. Verifiser utbetaling (30 % av prizePool, maks 2 500 kr)
7. Trekk til full bingo — submit BINGO claim
8. Verifiser utbetaling (resterende prizePool)
9. Sjekk at huskontoen balanserer (innbetalinger = utbetalinger + margin)
10. Sjekk compliance ledger har korrekte STAKE og PRIZE events

**Automatisert alternativ:**  
Dekkes delvis av `BingoEngine.test.ts` (30 tester), men full socket-flyt med wallet krever integrasjonstest.

---

### Sjekk 25 — Reconnect mid-runde

**Hva sjekkes:**  
Hvis en spiller mister tilkobling (nettverksfeil, telefon låser seg) midt i en runde, skal de kunne reconnecte og:
1. Se sine eksisterende billetter
2. Se trekningshistorikk (allerede trukne tall)
3. Fortsette å markere tall og gjøre krav

**Fil(er) å se på:**
- `gameEvents.ts` — `room:join` handler (reconnect-path)
- `BingoEngine.ts` — `attachPlayerSocket()`, `getRoomSnapshot()`
- Unity: `SpilloramaSocketManager` — reconnect-logikk

**Slik verifiseres:**  
1. Start runde med 2 spillere
2. Koble fra spiller 2 (lukk socket)
3. Trekk noen tall
4. Koble til spiller 2 igjen
5. Verifiser at spiller 2 ser sine billetter og trekningshistorikk i snapshot

---

### Sjekk 26 — Tom runde (0 eligible spillere)

**Hva sjekkes:**  
Hvis alle spillere feiler eligibility-sjekken (alle har nådd tap-grense, tom saldo, eller er blokkert), skal runden ikke krasje. Systemet skal enten:
- Starte med 0 deltakere og `prizePool = 0`, eller
- Avbryte runden med forståelig melding

**Fil(er) å se på:**
- `BingoEngine.ts` — `startGame()` linje 444–450 (filtering), linje 530 (prizePool beregning)

**Slik verifiseres:**
```bash
# Sjekk at eligiblePlayers kan bli tom uten å kaste exception
grep -A5 "eligiblePlayers.length" backend/src/game/BingoEngine.ts
```

---

### Sjekk 27 — Env-variabler i produksjon

**Hva sjekkes:**  
Alle spillrelevante env-variabler i prod-deploy skal ha korrekte verdier — ikke dev-defaults.

**Kritiske variabler:**
| Variabel | Forventet prod-verdi | Default | Risiko ved feil |
|----------|---------------------|---------|-----------------|
| `NODE_ENV` | `production` | — | KYC/alder-sjekk deaktivert |
| `BINGO_PAYOUT_PERCENT` | Kontraktfestet (f.eks. 80) | `80` | Feil RTP |
| `BINGO_PLAY_SESSION_LIMIT_MS` | `3600000` | `3600000` | Forskriftsbrudd |
| `BINGO_PAUSE_DURATION_MS` | `300000` | `300000` | Forskriftsbrudd |
| `AUTO_ROUND_TICKETS_PER_PLAYER` | Hallens maks (f.eks. 4) | `4` | For mange/få billetter |
| `AUTO_ROUND_ENTRY_FEE` | Per kontrakt | `0` | Gratis-spill i prod |
| `AUTO_ROUND_START_INTERVAL_MS` | ≥ 30 000 | `180000` (3 min) | For hurtige runder |

**Slik verifiseres:**
```bash
# I prod-miljøet:
env | grep -E "NODE_ENV|BINGO_|AUTO_ROUND_"
```

---

### Sjekk 28 — DB-migrasjoner i prod

**Hva sjekkes:**  
Alle migrasjoner under `backend/migrations/` er kjørt i prod-databasen, i riktig rekkefølge.

**Slik verifiseres:**
```sql
-- Sjekk at migrasjon-tabellen finnes og at alle migrasjoner er kjørt:
SELECT * FROM migrations ORDER BY id;

-- Verifiser spesifikt at max_tickets-constraint er oppdatert:
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'app_hall_game_config'::regclass;
```

---

### Sjekk 29 — Alarm/varsling for CRITICAL-feil

**Hva sjekkes:**  
Logger med nivå `error` og tekst som inneholder `CRITICAL` skal utløse varsling (Slack, e-post, PagerDuty o.l.). Uten dette kan pengerelaterte feil gå uoppdaget.

**CRITICAL-scenarier å varsle på:**
- `CRITICAL: Failed to refund buy-in after game start failure` — spiller har mistet penger
- `CRITICAL: Checkpoint failed after LINE/BINGO payout` — gjenopprettingsdata kan mangle
- Wallet adapter-feil under utbetaling

**Slik verifiseres:**  
1. Søk etter alle CRITICAL-logg-meldinger: `grep -rn "CRITICAL" backend/src/`
2. Bekreft at logg-infrastruktur fanger disse (f.eks. Datadog, CloudWatch, Grafana)
3. Verifiser at varsling er konfigurert med korrekt severity

---

### Sjekk 30 — Checkpoint-recovery etter server-restart

**Hva sjekkes:**  
Hvis serveren restartes midt i en aktiv runde (deploy, krasj, OOM), skal checkpoint-recovery gjenopprette spilltilstanden korrekt:
- Spillere som betalte buy-in skal fortsatt ha sine billetter
- Allerede trukne tall skal bevares
- Allerede utbetalte premier skal ikke utbetales på nytt (idempotency)

**Fil(er) å se på:**
- `BingoEngine.ts` — `reconstructGameFromCheckpoints()`
- `game_checkpoints`-tabellen i PostgreSQL
- Idempotency keys i wallet adapter

**Slik verifiseres (manuell test):**
1. Start runde med buy-in
2. Trekk noen tall
3. Restart backend-prosessen
4. Verifiser at rommet og spillet gjenopprettes fra siste checkpoint
5. Verifiser at spillere kan fortsette å markere tall

---

### Sjekk 31 — Feilmeldinger til spiller

**Hva sjekkes:**  
Alle feilmeldinger som vises til spilleren skal være på norsk, forståelige og uten tekniske detaljer.

**Slik verifiseres:**
```bash
# Sjekk at DomainError-meldinger er på norsk:
grep -rn "new DomainError" backend/src/game/BingoEngine.ts | head -20

# Sjekk at frontend håndterer error-koder og viser norsk tekst:
grep -rn "onError\|errorMessage\|ErrorText" \
  Spillorama/Assets/_Project/_Scripts/Game{N}/
```

**Eksempler som skal fungere:**
| Error-kode | Spiller ser |
|------------|-------------|
| `NOT_ENOUGH_PLAYERS` | «Du trenger minst X spillere for å starte.» |
| `INVALID_ENTRY_FEE` | «Innsats må være mellom 0 og X kr.» |
| `KYC_REQUIRED` | «KYC må verifiseres før spill kan startes.» |
| `AGE_RESTRICTED` | «Spiller må være minst 18 år.» |
| `LOSS_LIMIT_EXCEEDED` | (Spiller filtreres ut — ingen feilmelding, men heller ikke debitert) |

---

### Sjekk 32 — Spillvett-panelet viser komplett informasjon

**Hva sjekkes:**  
Spillvett-/profilpanelet skal vise følgende til spilleren:
1. Gjeldende tap-grenser (daglig og månedlig)
2. Nåværende netto tap (daglig og månedlig)
3. Eventuell aktiv tvangspause (med nedtelling)
4. Mulighet til å sette tidsbestemt pause
5. Mulighet til å selvutelukke (min 1 år)
6. Knapp/lenke til Spillevett-rapport (PDF)

**Fil(er) å se på:**
- `backend/public/web/index.html` — `#profile-overlay`, `#spillvett-*` elementer
- `backend/src/routes/wallet.ts` — `/api/wallet/me` og `/api/spillevett/*` endpoints

**Slik verifiseres:**  
Åpne Spillvett-panelet i nettleseren og bekreft at alle 6 punktene er synlige og oppdaterte.

---

### Sjekk 33 — Bekreftelse ved billettkjøp

**Hva sjekkes:**  
Når spilleren kjøper billetter (`bet:arm`), skal de få en tydelig visuell bekreftelse:
- Billettkjøp bekreftet (panel lukkes, spillbrett vises, eller bekreftelsesmelding)
- Ved feil: feilmelding + billetttelleren tilbakestilles (ikke visning av «kjøpt» uten faktisk kjøp)

**Fil(er) å se på:**
- `Game{N}TicketPurchasePanel.cs` — `CallPurchaseEvent()` → `onResult` og `onError` callbacks

---

### Sjekk 34 — Payout percent konfigurert per hall

**Hva sjekkes:**  
`payoutPercent` (RTP) skal være konfigurert per hall i admin-panelet eller runtime settings. Denne verdien bestemmer hvor stor andel av prizePool som utbetales som premier.

**SQL-sjekk:**
```sql
-- payoutPercent styres via runtime settings, ikke DB.
-- Verifiser at den ikke er satt til 100 % (som betyr at huset ikke tar margin):
```

**Slik verifiseres:**
```bash
grep -n "payoutPercent" backend/.env
# Forventet: BINGO_PAYOUT_PERCENT=80 (eller lignende)
```

**Godkjente verdier:** 50–95 % er normalt for databingo. 100 % = ingen margin = ikke bærekraftig. 0 % = ingen premier = ikke lovlig.

---

### Sjekk 35 — Auto-round-innstillinger

**Hva sjekkes:**  
Auto-round (automatisk oppstart av runder) skal ha fornuftige innstillinger for produksjon:

| Innstilling | Variabel | Anbefalt prod-verdi |
|-------------|----------|---------------------|
| Auto-start aktivert | `AUTO_ROUND_START_ENABLED` | `true` |
| Intervall mellom runder | `AUTO_ROUND_START_INTERVAL_MS` | ≥ 30 000 ms |
| Entry fee per runde | `AUTO_ROUND_ENTRY_FEE` | > 0 (ellers gratis-spill) |
| Min spillere for å starte | `AUTO_ROUND_MIN_PLAYERS` | ≥ 1 |
| Billetter per spiller | `AUTO_ROUND_TICKETS_PER_PLAYER` | 1–30 |
| Auto-draw aktivert | `AUTO_DRAW_ENABLED` | `true` |

**Slik verifiseres:**
```bash
grep -E "AUTO_ROUND_|AUTO_DRAW_" backend/.env
```

---

### Sjekk 36 — Spilleplan-integrasjon (§ 64)

**Hva sjekkes:**  
Spilleplanen (game schedule) definerer hvilke spill som kjøres når, med hvilke innstillinger. Per forskrift § 64 skal operatøren ha en offentlig spilleplan.

**Fil(er) å se på:**
- `backend/src/draw-engine/DrawScheduler.ts` — automatisk trekningslogikk
- Spilleplan-data i DB eller admin-panel
- Frontend: viser spilleplanen til spilleren i lobbyen

**Slik verifiseres:**
1. Bekreft at spilleplanen er publisert (synlig i lobby)
2. Bekreft at auto-round starter til riktig tid iht. plan
3. Bekreft at entry fee, premiestruktur og payout % stemmer med spilleplanen

---

### Sjekk 37 — Overskuddsdistribusjon

**Hva sjekkes:**  
Overskudd (margin etter premier) skal distribueres korrekt per hall og organisasjon, i henhold til kontrakt og forskrift.

**Fil(er) å se på:**
- `BingoEngine.ts` — overskudd-beregning etter runde
- `ComplianceLedger.ts` — daglig rapport med STAKE/PRIZE/SURPLUS
- Admin-panel: overskudd-konfigurasjon per hall

**Slik verifiseres:**
```sql
-- Sjekk at overskudd-distribusjon er konfigurert:
SELECT h.name, h.organization_id, h.settlement_account_id
FROM app_halls h
WHERE h.settlement_account_id IS NOT NULL;
```

---

## Spill-spesifikke notater

### Spill 1 — Bingo (75-kule)
- Socket-event for kjøp: `bet:arm`
- Snapshot-klasse: `SpilloramaGameBridge.LatestSnapshot` (`SpilloramaSnapshotRaw`)
- Ticket-type i DB: `game_slug = 'bingo'`
- Purchase-panel: `Game1TicketPurchasePanel.cs` + `Game1PurchaseTicket.cs`
- Max billetter (klient): `SpilloramaGameBridge.MAX_TICKETS = 30`
- Sjekket og godkjent: **april 2026**

### Spill 2 — Rocket (3x3)
- Socket-event for kjøp: `bet:arm` ✅ (`PrefabGame2UpcomingGames.cs::Buy_Tickets()`)
- Socket-event for avbestilling: `bet:arm(false)` ✅ (`PrefabGame2UpcomingGames.cs::Cancel_Tickets_Btn()`)
- Socket-event for lykkenummer: `lucky:set` ✅ (`Game2GamePlayPanel.cs::OnLuckyNumberSelection()` — fikset april 2026)
- Ticket-type i DB: `game_slug = 'rocket'`
- Purchase-panel: `PrefabGame2UpcomingGames.cs` (bet:arm-flyt) — `Game2TicketPurchasePanel.cs` er delvis stub (dead code fra AIS-flyt, ikke blokkerende)
- «Se kjøpte billetter»: `PrefabGamePlan2Ticket.OnPlayButtonTap()` → `OpenGamePlayPanel()` → `CallSubscribeRoom()` → `GenerateTicketList()`
- Max billetter klient: `SpilloramaGameBridge.MAX_TICKETS = 30` ✅
- Max billetter DB: 30 for alle 22 haller (`game_slug = 'rocket'`) ✅
- Feilmelding til spiller ved bet:arm-feil: ✅ (fikset april 2026 — «Kjøp feilet: {err}»)
- Sjekk 9 ⚠️: `Game2TicketPurchasePanel.cs` har 3 stubs i dead code paths (AIS-arv) — ikke blokkerende, men bør ryddes
- Kompilert uten feil: ✅
- Status: **sjekket og godkjent — april 2026** (sjekk 24–30 gjenstår som for alle spill)

### Spill 3 — Mønsterbingo
- Socket-event for kjøp: `bet:arm` ✅ (`Game3TicketPurchasePanel.cs`, `PrefabGame3UpcomingGame.cs`)
- Socket-event for avbestilling: `bet:arm(false)` ✅ (`BingoTicket.cs`, `PrefabGame3UpcomingGame.cs`)
- Socket-event for lykkenummer: `lucky:set` ✅ (`Game3GamePlayPanel.cs::OnLuckyNumberSelection`)
- Ticket-type i DB: `game_slug = 'monsterbingo'`
- Purchase-panel: `Game3TicketPurchasePanel.cs` + `PrefabGame3UpcomingGame.cs`
- «Se kjøpte billetter»: `PrefabGamePlan3Ticket.OnPlayButtonTap()` → `OpenGamePlayPanel()` → `CallSubscribeRoom()` → `GenerateTicketList()`
- Max billetter klient: `SpilloramaGameBridge.MAX_TICKETS = 30` ✅
- Max billetter DB: Fikset via migration `20260413000002_max_tickets_30_all_games.sql` ✅
- Kompilert uten feil: ✅
- Status: **sjekket og godkjent — april 2026**

---

## Revisjonslogg

| Dato | Spill | Utført av | Alle sjekker OK? | Notater |
|------|-------|-----------|------------------|---------|
| 2026-04-13 | Spill 1 (Bingo) | Claude + Tobias | ✅ Ja (sjekk 1–10) | DB-constraint for max_tickets utvidet 5→30; to stubs fjernet i purchase-flow; saldo-polling lagt til game-bar |
| 2026-04-13 | Spill 3 (Mønsterbingo) | Claude + Tobias | ✅ Ja | Kritisk funn: max_tickets constraint var fortsatt ≤ 5 i kildekode og monsterbingo-rader ikke oppdatert — fikset i migration 20260413000002 + PlatformService.ts + initial_schema.sql; Show_Upcoming_Game_UI() gjort public (kompilefeil); alle socket-flows (bet:arm kjøp/avbestilling, lucky:set) er på plass |
| 2026-04-13 | Spill 1 (Bingo) | Senior review | ❌→✅ 3 av 4 fikset | **K1 FIKSET**: ticketsPerPlayer grense 5→30 i 6 filer + tester; **H1 FIKSET**: console.log→pino logger; **M1 FIKSET**: checkpoint retry (1x) etter utbetaling; **H2 GJENSTÅR**: entry fee 10k NOK — krever juridisk avklaring. 80/80 tester OK. |
| 2026-04-13 | Spill 2 (Rocket) | Claude + Tobias | ✅ Ja (sjekk 1–23, 31–37) | **FIKSET**: lucky:set lagt til OnLuckyNumberSelection() — var stub uten server-emit; **FIKSET**: bet:arm-feil viser nå norsk feilmelding til spiller («Kjøp feilet: {err}»); **FIKSET**: SendMessage-navnekollisjon i Unity-scene (child «Panel - Buy More Boards» omdøpt til «Panel - Buy Tickets Inner»); **⚠️ GJENSTÅR**: 3 dead-code stubs i Game2TicketPurchasePanel.cs (ikke blokkerende); **⚠️ GJENSTÅR**: entry fee juridisk avklaring (deles med Spill 1); Sjekk 24–30 krever staging/prod-tilgang. |
