# Game 3 — Monster Bingo / Mønsterbingo (Web-implementasjon)

**Status:** Funksjonell MVP — 5x5 grids + chat, kuleanimasjon utsatt
**Dato:** 2026-04-14

## Hva er implementert

Fullstendig gameplay-loop identisk med Game 1 (5x5 grid + chat + LINE/BINGO claims).
Gjenbruker Game 1 PlayScreen og Game 2 LobbyScreen/EndScreen direkte.

### Filer

```
packages/game-client/src/games/game3/
├── Game3Controller.ts    # State machine med gameSlug "monsterbingo"
└── README.md             # ← denne filen
```

Alt annet gjenbrukes fra Game 1 og Game 2.

### Backend-integrasjon

Identisk med Game 1/Game 2. Backend slug: `"monsterbingo"`.

### Kjente begrensninger (MVP)

- **Kuleanimasjon utsatt** — Unity-versjonen har velocity+akselerasjon kulebevegelse (BallScript.cs) og waypoint-bane (BallPathRottate.cs). Implementeres i visuell polish-fase med GSAP.
- **Mønsteranimasjon utsatt** — Ping-pong skala-animasjon for mønstre (PrefabBingoGame3Pattern.cs)
- **Kulekø utsatt** — FIFO-pool med maks 5 synlige kuler (BingoNumberBalls.cs)

### Hva er unikt for Game 3 (planlagt for visuell polish)

| Komponent | Unity | Web (planlagt) |
|-----------|-------|----------------|
| BallScript | velocity(80) + acc(50) per frame | `gsap.to()` med power2.out ease |
| BallPathRottate | Waypoint-lerp med speed modifier | GSAP timeline med lerp mellom punkter |
| BingoNumberBalls | FIFO pool, maks 5 | Array pool med GSAP stagger |
| Mønsteranimasjon | LeanTween ping-pong | `gsap.to({yoyo: true, repeat: -1})` |

### Testing

```
http://localhost:4000/web/?webClient=game_3
```
Eller test alle spill: `?webClient=all`
