# Game 2 — Rocket Bingo (Web-implementasjon)

**Status:** Funksjonell MVP — gameplay-loop verifisert mot backend
**Dato:** 2026-04-17 (opprinnelig: 2026-04-14)

> **Autoritativ spesifikasjon:** [`docs/engineering/game2-canonical-spec.md`](../../../../../docs/engineering/game2-canonical-spec.md) (BIN-529).
> Ved motsigelser vinner canonical spec. Denne README-filen er en teknisk oversikt over koden her; se spec §11 for kjente avvik fra legacy og fra G1-paritet.

## Hva er implementert

### Fullstendig gameplay-loop
1. **Lobby** → spilleren joiner rom via socket, ser spillerantall og nedtelling
2. **Arm/kjøp** → auto-arm ved join + re-arm etter hver runde
3. **Nedtelling** → GSAP-animert countdown med pulsering
4. **Gameplay** → 3x5 billettkort rendret i PixiJS, numre markeres i sanntid
5. **Claim** → LINE/BINGO deteksjon (klient-side sjekk → server-validering)
6. **Game end** → resultatskjerm med vinnere og premier
7. **Loop** → automatisk overgang tilbake til lobby for neste runde

### Filer

```
packages/game-client/src/games/
├── registry.ts                         # gameSlug → factory mapping
└── game2/
    ├── Game2Controller.ts              # State machine (LOADING→LOBBY→PLAYING→ENDED)
    ├── README.md                       # ← denne filen
    ├── screens/
    │   ├── LobbyScreen.ts             # Vente/kjøp-skjerm med countdown + buy popup
    │   ├── PlayScreen.ts              # Hovedspillskjerm med grids + kuler + claim
    │   └── EndScreen.ts               # Resultat-overlay etter game end
    ├── components/
    │   ├── TicketCard.ts              # BingoGrid (3x5) + "to-go" teller
    │   ├── TicketScroller.ts          # Horisontal scroll med mask + drag
    │   ├── CountdownTimer.ts          # GSAP scale/color pulse nedtelling
    │   ├── DrawnBallsPanel.ts         # Rad med NumberBall-instanser
    │   ├── ClaimButton.ts             # LINE/BINGO knapp med pulsering
    │   ├── PlayerInfoBar.ts           # Spillerantall + trekk + pott
    │   ├── BuyPopup.ts                # Billettantall-velger mellom runder
    │   └── LuckyNumberPicker.ts       # Modal tallvelger 1-21
    └── logic/
        ├── ClaimDetector.ts           # Port av backend ticket.ts mønstersjekk
        └── TicketSorter.ts            # Best-card-first sortering
```

### Backend-integrasjon

Bruker eksisterende backend-kontrakter uten endringer:

| Socket event | Retning | Brukt til |
|---|---|---|
| `room:create` | client→server | Joine/opprette rom |
| `bet:arm` | client→server | Kjøpe billetter (arme) |
| `lucky:set` | client→server | Sette heldig tall |
| `claim:submit` | client→server | Melde LINE/BINGO |
| `room:update` | server→client | Full spillstatus (scheduler, tickets, etc.) |
| `draw:new` | server→client | Nytt trukket tall |
| `pattern:won` | server→client | Mønster vunnet |

### Billett-format

Backend genererer 3x5 grids (3 rader × 5 kolonner, tall 1-60). Mønstersjekk:
- **LINE**: Hel rad (5 celler) eller kolonne (3 celler)
- **BINGO**: Alle 15 celler markert

### Kjente begrensninger (MVP)

- **Visuell polish mangler** — placeholder-grafikk, ingen sprites/design
- **Ingen chat-panel** — planlagt for senere iterasjon
- **Ingen jackpot-animasjoner** — data finnes, visning mangler
- **Ingen lydeffekter** — AudioManager er implementert men lydfiler mangler
- **Responsive layout** — fungerer men ikke optimalisert for mobil

### Testing

Åpne `http://localhost:4000/web/?webClient=game_2`, klikk Rocket. Feature flag i URL router til web-klient.

Alternativt: sett `clientEngine: "web"` i game settings via admin for permanent aktivering.

### Teknisk stack

- **PixiJS 8** — rendering
- **GSAP 3** — animasjoner (countdown pulse, blink, claim button)
- **socket.io-client 4** — sanntidskommunikasjon
- **TypeScript** — type-sikker hele veien

### Gjenbrukbare komponenter

Følgende Fase 0-komponenter brukes direkte:
- `BingoGrid` (3x5 grid med mark/blink/highlight)
- `BingoCell` (enkeltcelle med animasjon)
- `NumberBall` (trukket kule med farge)
- `SpilloramaSocket` (typed socket wrapper)
- `GameBridge` (snapshot→state oversetter)
- `TweenPresets` (GSAP presets)
- `AudioManager`, `PlayerPrefs`, `Telemetry`
