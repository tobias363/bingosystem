# Spill 1 — Porteringsguide: Fra Unity til Web-Native

> Erfaringer og lærdom fra porteringen av Spill 1 (Classic Bingo) fra Unity WebGL
> til web-native (PixiJS + TypeScript). Denne guiden er ment som oppslagsverk for
> utviklere som skal gjøre tilsvarende arbeid på Spill 2 og Spill 3.

---

## Innholdsfortegnelse

1. [Hva vi gjorde — oppsummering](#1-hva-vi-gjorde--oppsummering)
2. [Arkitekturbeslutninger og begrunnelser](#2-arkitekturbeslutninger-og-begrunnelser)
3. [Bugs vi fant og fikset](#3-bugs-vi-fant-og-fikset)
4. [Mønster som fungerer (bruk disse)](#4-mønster-som-fungerer-bruk-disse)
5. [Fallgruver (unngå disse)](#5-fallgruver-unngå-disse)
6. [Steg-for-steg: Koble et spill til backend](#6-steg-for-steg-koble-et-spill-til-backend)
7. [Sjekkliste for Spill 2 og 3](#7-sjekkliste-for-spill-2-og-3)
8. [Testoppsett](#8-testoppsett)
9. [Endringsoversikt per fil](#9-endringsoversikt-per-fil)

---

## 1. Hva vi gjorde — oppsummering

### Sessjon: 15. april 2026

**Hovedmål:** Koble Spill 1 korrekt til backend for innsatsvisning, bongkjøp og
spilltilstand — slik at pengebeløp alltid kommer fra serveren og aldri beregnes
på klienten.

### Endringer i kronologisk rekkefølge

| # | Hva | Hvorfor | Filer |
|---|-----|---------|-------|
| 1 | Lagt til `armedPlayerIds` i `RoomUpdatePayload` | Backend visste hvem som var armet, men frontend fikk ikke vite det | `shared-types`, `roomHelpers.ts`, `GameBridge.ts` |
| 2 | Lagt til `isArmed` i `GameState` | Frontend trengte å skille "har kjøpt" fra "ser bare display-tickets" | `GameBridge.ts` |
| 3 | Fikset stale `preRoundTickets` | Gammel verdi hang igjen fordi koden kun oppdaterte ved truthy verdi | `GameBridge.ts` |
| 4 | Fikset 600 kr-bug for spectators | Uarmede spillere viste innsats fra backend-genererte display-tickets | `PlayScreen.ts` |
| 5 | Ekstrahert `StakeCalculator.ts` | Isolert kritisk logikk i egen modul med full testdekning | Ny fil + 19 tester |
| 6 | Fikset dobbel `armBet`-kall | PlayScreen OG Controller kalte begge `socket.armBet()` | `PlayScreen.ts`, `Game1Controller.ts` |
| 7 | Server-autoritativ `playerStakes` | Eliminerte all klient-side pengeberegning | `roomHelpers.ts`, `shared-types`, `GameBridge.ts`, `StakeCalculator.ts` |
| 8 | Fjernet fallback i kjøp-popup | "Standard bingo-brett" vistes når ticketTypes ikke var lastet ennå | `Game1BuyPopup.ts`, `PlayScreen.ts` |
| 9 | Redesignet kjøp-popup | 3-kolonners grid med +/- per bongtype, gjennomsiktig bakgrunn | `Game1BuyPopup.ts` |
| 10 | Fikset `window.dispatchEvent` i tester | `typeof window` guard for Node.js testmiljø | `GameBridge.ts` |
| 11 | Skrevet dokumentasjon | Kritiske faser, arkitekturprinsipper, regulatorisk | `logic/README.md` |

### Resultat

- **74 tester** passerer (25 StakeCalculator + 20 GameBridge + 24 ClaimDetector + 5 TicketSorter)
- **0 klient-side pengeberegninger** — alt kommer fra `playerStakes` i `room:update`
- **Ingen fallback-UI** — popup viser kun bongtyper fra backend, aldri klient-genererte

---

## 2. Arkitekturbeslutninger og begrunnelser

### 2.1 Server-autoritativ innsatsvisning

**Beslutning:** Backend beregner `playerStakes: Record<string, number>` og sender
i hvert `room:update`. Klienten viser tallet direkte.

**Begrunnelse:** Frontend hadde en bug der `preRoundTickets` (som backend genererer
for ALLE spillere, også uarmede) ble brukt til å beregne innsats. Dette ga 600 kr
for spectators. Klient-side beregning av pengebeløp er en hel feilklasse vi
eliminerte ved å flytte beregningen til serveren.

**Alternativet vi forkastet:** Klient-beregning med `isArmed`-sjekk. Fungerte
funksjonelt, men enhver klient som beregner beløp kan vise feil hvis
`entryFee`, `priceMultiplier` eller `ticketTypes` er ute av sync.

### 2.2 Enveis dataflyt for kjøp

**Beslutning:** PlayScreen eier aldri socket-kall. Kjøp-popup signalerer kun
intent (`onBuy()`), Controller håndterer nettverket.

```
BuyPopup.click → onBuy() → Controller.handleBuy() → socket.armBet()
                                                    → playScreen.showBuyPopupResult()
```

**Begrunnelse:** Tidligere kalte BÅDE popup og controller `armBet()`, som ga
dobbelt nettverkskall. Ved å la controller eie nettverkslaget har vi ett
sted å debugge kjøp-flyten.

### 2.3 Ingen client-side fallback for bongtyper

**Beslutning:** Kjøp-popupen viser INGENTING hvis `ticketTypes` er tom.
Den venter på at `room:update` leverer typer fra backend.

**Begrunnelse:** En "Standard bingo-brett — 20 kr"-fallback ville la spillere
tro de kjøper noe som ikke finnes i backend. Pris og typer SKAL alltid
matche det backend tilbyr.

### 2.4 StakeCalculator som isolert modul

**Beslutning:** All innsatslogikk i `logic/StakeCalculator.ts` med ren
`calculateStake(input)` funksjon og full testdekning.

**Begrunnelse:** Innsats er regulatorisk kritisk. Ved å isolere logikken
kan den testes uavhengig av PixiJS, DOM og socket-tilkobling. Ren funksjon
= ren testbarhet.

---

## 3. Bugs vi fant og fikset

### 3.1 600 kr for spectators (KRITISK)

**Symptom:** Spiller som ikke hadde kjøpt bonger viste "Innsats: 600 kr".

**Rotårsak:** Backend genererer `preRoundTickets` for ALLE spillere via
`getOrCreateDisplayTickets()`. Disse er "display-tickets" for å vise brett
på skjermen uten markering. Klienten brukte disse til å beregne innsats
uten å sjekke om spilleren faktisk hadde armet.

**Løsning:** Lagt til `armedPlayerIds` i payload + `isArmed` i GameState.
Deretter: server-autoritativ `playerStakes` som eliminerer hele problemet.

**Lærdom for Spill 2/3:** `preRoundTickets` ≠ "har kjøpt". Bruk alltid
`armedPlayerIds` eller `playerStakes` for å avgjøre om spilleren har aktiv innsats.

### 3.2 Innsats hang igjen etter runde

**Symptom:** Etter at en runde var ferdig, endret innsats seg fra "—" til 600 kr.

**Rotårsak:** Koden `if (payload.preRoundTickets[myId]) { ... }` oppdaterte
kun når truthy. Når backend fjernet spillerens tickets (tom array), ble den
gamle verdien stående.

**Løsning:** Endret til `payload.preRoundTickets[myId] ?? []` — alltid oppdater.

**Lærdom for Spill 2/3:** Alle felter som leses fra payload MÅ ha nullish
coalescing (`?? defaultVerdi`). Aldri stol på at et felt er truthy.

### 3.3 Dobbelt armBet-kall

**Symptom:** `bet:arm` ble kalt to ganger per kjøp — ufarlig på backend
(idempotent), men rot i koden.

**Rotårsak:** PlayScreen constructor hadde `socket.armBet()` direkte i
`buyPopup.setOnBuy()` handler. Controller registrerte `setOnBuy(() => handleBuy())`
som callback, og `handleBuy()` kalte også `socket.armBet()`.

**Løsning:** Fjernet `socket.armBet()` fra PlayScreen. Popup signalerer
kun `onBuy()`, controller eier nettverkskallet.

**Lærdom for Spill 2/3:** View-lag (Screen/Component) skal ALDRI kalle
socket direkte. Kun Controller eier nettverksoperasjoner.

### 3.4 Fallback-popup med feil bongtype

**Symptom:** "Standard bingo-brett — 20 kr/brett" vistes når ticketTypes
ikke var lastet ennå.

**Rotårsak:** `showWithTypes(fee, [])` hadde fallback som genererte en
hardkodet type. `show(fee)` var en wrapper som passerte tom array.

**Løsning:** Fjernet all fallback-logikk. Popup viser ingenting hvis
`ticketTypes.length === 0`. `updateWaitingState()` viser popup automatisk
når types ankommer i neste `room:update`.

**Lærdom for Spill 2/3:** Aldri vis klient-genererte pengebeløp eller
produkter. Vent på at backend leverer data.

---

## 4. Mønster som fungerer (bruk disse)

### 4.1 GameBridge som eneste state-kilde

```typescript
// ✅ RIKTIG: Les fra GameBridge state
const state = bridge.getState();
playScreen.updateInfo(state);

// ❌ FEIL: Beregn lokalt fra socket-payload
socket.on("roomUpdate", (payload) => {
  const myStake = calculateStakeLocally(payload); // NEI
});
```

### 4.2 Controller eier nettverket

```typescript
// ✅ RIKTIG: Screen signalerer intent, Controller handler
playScreen.setOnBuy(() => this.handleBuy());

private async handleBuy(): Promise<void> {
  const result = await this.deps.socket.armBet({ roomCode, armed: true });
  this.playScreen?.showBuyPopupResult(result.ok, result.error?.message);
}

// ❌ FEIL: Screen kaller socket direkte
buyPopup.setOnBuy(async () => {
  await socket.armBet({ roomCode, armed: true }); // NEI
});
```

### 4.3 Isolert logikk med rene funksjoner

```typescript
// ✅ RIKTIG: Ren funksjon, testbar isolert
export function calculateStake(input: StakeInput): number {
  if (input.myStake !== undefined) return input.myStake;
  // ...fallback
}

// ❌ FEIL: Logikk innbakt i render-metode
updateInfo(state: GameState): void {
  const totalStake = state.myTickets.reduce((sum, t) => {
    const tt = state.ticketTypes.find(x => x.type === t.type);
    return sum + Math.round(state.entryFee * (tt?.priceMultiplier ?? 1));
  }, 0);
  // ... vanskelig å teste
}
```

### 4.4 Alltid nullish coalescing på payload-felter

```typescript
// ✅ RIKTIG
this.state.preRoundTickets = payload.preRoundTickets[this.myPlayerId] ?? [];
this.state.isArmed = (payload.armedPlayerIds ?? []).includes(this.myPlayerId);
this.state.myStake = payload.playerStakes?.[this.myPlayerId] ?? 0;

// ❌ FEIL
if (payload.preRoundTickets[this.myPlayerId]) {
  this.state.preRoundTickets = payload.preRoundTickets[this.myPlayerId];
}
// ^ Oppdaterer aldri til [] når spilleren ikke har tickets
```

### 4.5 Vent på backend-data, aldri generer fallback

```typescript
// ✅ RIKTIG: Ikke vis popup uten data
showWithTypes(entryFee, ticketTypes) {
  if (ticketTypes.length === 0) return; // Vent
  // ...bygg UI fra backend-data
}

// ❌ FEIL: Generer fallback-data
showWithTypes(entryFee, ticketTypes) {
  if (ticketTypes.length === 0) {
    this.buildRow({ name: "Standard", price: entryFee }); // NEI
  }
}
```

---

## 5. Fallgruver (unngå disse)

### 5.1 `preRoundTickets` betyr IKKE "har kjøpt"

Backend genererer display-tickets for alle spillere som ikke er i en aktiv
runde — inkludert spillere som aldri har armet. Disse er for å vise brett
på skjermen. Bruk `armedPlayerIds` eller `playerStakes` for å avgjøre
kjøpsstatus.

### 5.2 `window` finnes ikke i Node.js tester

GameBridge bruker `window.dispatchEvent()` for balance-sync. Vitest kjører
i Node.js uten `window`. Guard med `typeof window !== "undefined"`.

### 5.3 `ticketTypes` er tom i første snapshot

Første `room:join` response har ofte tom `ticketTypes`. De kommer i
`gameVariant` feltet i den første `room:update`. Design UI-et til å
håndtere dette — vis ingenting og oppdater når data ankommer.

### 5.4 Flere screens kan ha overlappende callbacks

Når controller oppretter ny PlayScreen (f.eks. ved WAITING → PLAYING),
må alle callbacks settes på nytt. Gammel screen kan ha stale referanser.

### 5.5 `entryFee` er per spill, ikke per ticket-type

`entryFee` er base-prisen. Hver ticket-type har `priceMultiplier`.
Faktisk pris = `entryFee × priceMultiplier`. Backend debiterer dette
korrekt — klienten trenger kun å vise `playerStakes`.

---

## 6. Steg-for-steg: Koble et spill til backend

### Steg 1: GameBridge felter

Sørg for at `GameState` har disse feltene (allerede i koden):

```typescript
interface GameState {
  // ...eksisterende felter
  isArmed: boolean;          // Fra armedPlayerIds
  myStake: number;           // Fra playerStakes (server-autoritativ)
  preRoundTickets: Ticket[]; // Display-tickets (IKKE kjøpsbekreftelse)
  ticketTypes: TicketTypeInfo[]; // Fra gameVariant
  entryFee: number;          // Base-pris
}
```

### Steg 2: Controller-arkitektur

```
GameXController {
  handleBuy()    → socket.armBet()    → screen.showBuyResult()
  handleClaim()  → socket.submitClaim()
  handleCancel() → socket.armBet(false)

  onGameStarted(state) → transitionTo("PLAYING")
  onGameEnded(state)   → transitionTo("WAITING")
  onNumberDrawn(n)     → screen.onNumberDrawn()
  onPatternWon(result) → screen.onPatternWon()
  onStateChanged(state)→ screen.updateInfo()
}
```

### Steg 3: Screen/View-lag

- **ALDRI** kall socket direkte fra Screen
- **ALLTID** bruk `stakeFromState(state)` for innsatsvisning
- **ALLTID** bruk `ticketTypes` fra `state` for popup
- Signal intent via callbacks (`onBuy`, `onClaim`, `onCancel`)

### Steg 4: Innsatsvisning

```typescript
import { stakeFromState } from "../logic/StakeCalculator.js";

updateInfo(state: GameState): void {
  const totalStake = stakeFromState(state); // Server-autoritativ
  this.leftInfo.update(state.playerCount, totalStake, state.prizePool, ...);
}
```

### Steg 5: Kjøp-popup

```typescript
// Vis kun med backend-data
this.buyPopup.showWithTypes(state.entryFee, state.ticketTypes ?? []);
// showWithTypes returnerer tidlig hvis ticketTypes er tom

// Controller-side:
playScreen.setOnBuy(() => this.handleBuy());
```

### Steg 6: Tester

Opprett `logic/StakeCalculator.test.ts` (eller gjenbruk) med scenarioer:
- Server-autoritativ (myStake definert)
- Fallback: RUNNING + tickets, RUNNING + no tickets, armed, not armed
- Edge cases: 0 kr, desimaler, ukjente typer

---

## 7. Sjekkliste for Spill 2 og 3

### Spill 2 (Rocket Bingo) — status og oppgaver

Spill 2 er allerede godt implementert men mangler de forbedringene vi
gjorde for Spill 1.

| Oppgave | Status | Prioritet |
|---------|--------|-----------|
| Bruk `playerStakes` for innsatsvisning | ❌ Bruker ikke | Høy |
| Fjern klient-side innsatsberegning | ❌ | Høy |
| Flytt `armBet()` fra BuyPopup til Controller | ⚠️ Auto-arm i flere steder | Høy |
| Ekstraher StakeCalculator (eller gjenbruk fra game1) | ❌ | Medium |
| Fjern fallback i BuyPopup | ⚠️ Ukjent | Medium |
| Bruk `isArmed` fra GameBridge | ❌ Bruker ikke | Medium |
| Legg til `typeof window` guard i tester | ❌ | Lav |

**Spesifikt for Spill 2:**
- `Game2Controller.ts` auto-armer ved join (linje 96-99) og etter game end
  (linje 190-193). Sjekk om dette er ønsket oppførsel eller en bug.
- `BuyPopup.ts` (game2) er enklere — kun antall uten type-valg.
  Vurder om den trenger multi-type støtte.

### Spill 3 (Mønsterbingo) — status og oppgaver

Spill 3 gjenbruker mye fra Spill 2 (LobbyScreen, EndScreen, BuyPopup,
TicketCard, ClaimButton).

| Oppgave | Status | Prioritet |
|---------|--------|-----------|
| Bruk `playerStakes` for innsatsvisning | ❌ | Høy |
| Sjekk at gjenbrukte Game2-komponenter er oppdatert | ⚠️ | Høy |
| Egen PlayScreen (ikke gjenbruk Game2 sin) | ✅ Har egen | OK |
| Claim-logikk (bruker Game2 ClaimDetector) | ⚠️ Verifiser at den matcher backend | Medium |
| AnimatedBallQueue (unik for Spill 3) | ✅ | OK |

**Spesifikt for Spill 3:**
- Gjenbruker Game2 sin `ClaimDetector.ts` — verifiser at mønsterlogikken
  matcher backend for 5x5 grid (Spill 3 bruker 5x5, Spill 2 bruker 3x5).
- Mangler egen `logic/`-mappe — vurder å opprette med Spill 3-spesifikk logikk.

---

## 8. Testoppsett

### Struktur

```
games/game1/logic/
    StakeCalculator.ts          ← Ren funksjon
    StakeCalculator.test.ts     ← 25 tester
bridge/
    GameBridge.ts               ← State management
    GameBridge.test.ts          ← 20 tester (inkl. myStake)
games/game2/logic/
    ClaimDetector.ts            ← Claim-validering
    ClaimDetector.test.ts       ← 24 tester
    TicketSorter.ts             ← Best-card-first
    TicketSorter.test.ts        ← 5 tester
```

### Test-hjelpere

```typescript
// Minimal ticket for testing
function ticket(type = "small-yellow"): Ticket {
  return { type, grid: [[1, 2, 3, 4, 5]], color: "yellow" };
}

// StakeInput med defaults
function input(overrides: Partial<StakeInput> = {}): StakeInput {
  return {
    gameStatus: "NONE",
    myTickets: [],
    preRoundTickets: [],
    isArmed: false,
    ticketTypes: TICKET_TYPES,
    entryFee: 20,
    ...overrides,
  };
}
```

### Kjøring

```bash
# Alle tester
cd packages/game-client && npx vitest run

# Kun StakeCalculator
npx vitest run src/games/game1/logic/StakeCalculator.test.ts

# Med watch-mode under utvikling
npx vitest src/games/game1/logic/
```

### Viktig: `as const` og Ticket-typen

Bruk ALDRI `as const` på test-tickets — `Ticket.grid` er `number[][]` (mutable),
og `as const` gjør den readonly. Bruk eksplisitt type-annotasjon:

```typescript
// ✅ RIKTIG
function ticket(): Ticket {
  return { type: "small", grid: [[1,2,3]], color: "yellow" };
}

// ❌ FEIL — gir TS-feil
function ticket() {
  return { type: "small", grid: [[1,2,3]], color: "yellow" } as const;
}
```

---

## 9. Endringsoversikt per fil

### Nye filer

| Fil | Formål |
|-----|--------|
| `games/game1/logic/StakeCalculator.ts` | Server-autoritativ innsatsberegning med fallback |
| `games/game1/logic/StakeCalculator.test.ts` | 25 tester for alle innsats-scenarioer |
| `games/game1/logic/README.md` | Dokumentasjon: kritiske faser, compliance, sikkerhet |

### Endrede filer — Backend

| Fil | Endring |
|-----|---------|
| `backend/src/util/roomHelpers.ts` | Lagt til `playerStakes` beregning + `armedPlayerIds` i type |
| `backend/src/sockets/__tests__/testServer.ts` | Lagt til `playerStakes: {}` og `armedPlayerIds` i forenklet payload |

### Endrede filer — Shared Types

| Fil | Endring |
|-----|---------|
| `packages/shared-types/src/socket-events.ts` | `playerStakes: Record<string, number>` lagt til `RoomUpdatePayload` |

### Endrede filer — Frontend

| Fil | Endring |
|-----|---------|
| `bridge/GameBridge.ts` | `myStake`, `isArmed` i GameState. `typeof window` guard. Alltid oppdater `preRoundTickets` med `?? []` |
| `bridge/GameBridge.test.ts` | 3 nye tester for `myStake`. `playerStakes: {}` i mock. |
| `games/game1/screens/PlayScreen.ts` | Bruker `stakeFromState()`. Fjernet inline beregning. Fjernet direkte `socket.armBet()`. Lagt til `showBuyPopupResult()`. |
| `games/game1/Game1Controller.ts` | `handleBuy()` kaller `showBuyPopupResult()` i stedet for bare `hideBuyPopup()`. |
| `games/game1/components/Game1BuyPopup.ts` | Redesignet: 3-kolonners grid med +/- per type. Fjernet `show()` fallback. Gjennomsiktig bakgrunn. Kun backend ticket-types. |

---

## Oppsummering for nye utviklere

1. **Serveren er sannheten.** Vis kun det serveren sender. Beregn aldri pengebeløp på klienten.
2. **GameBridge er state-laget.** All data fra socket → GameBridge → Screen. Aldri direkte.
3. **Controller eier nettverket.** Screen signalerer, Controller handler, Screen viser resultat.
4. **Test tidlig.** Isoler logikk i `logic/`-mappen med rene funksjoner og skriv tester FØR du integrerer med UI.
5. **`preRoundTickets` ≠ kjøp.** Det er display-tickets. Bruk `playerStakes` og `isArmed`.
6. **Les denne guiden før du starter på Spill 2/3.** De har de samme problemene som Spill 1 hadde — de er bare ikke fikset ennå.
