# Game 5 — Spillorama Bingo (Web-implementasjon)

**Status:** Funksjonell MVP — 3x5 grids + LINE/BINGO, ruletthjul utsatt
**Dato:** 2026-04-14

## Hva er implementert

Fullstendig gameplay-loop identisk med Game 2 (3x5 grid + LINE/BINGO claims).
Gjenbruker Game 2 PlayScreen, LobbyScreen og EndScreen direkte.

### Filer

```
packages/game-client/src/games/game5/
├── Game5Controller.ts    # State machine med gameSlug "spillorama"
└── README.md             # ← denne filen
```

### Backend-integrasjon

Identisk med Game 2. Backend slug: `"spillorama"`.

### Kjente begrensninger (MVP)

- **Ruletthjul utsatt** — Unity bruker Rigidbody2D + Collider2D. Krever matter.js eller ren GSAP-rotasjon.
- **Free Spin Jackpot utsatt** — Lykkehjul-variant, gjenbrukbar fra Game 1 når det implementeres
- **Billettkustomisering utsatt** — 4 farger (blå, grønn, rød, lilla) med swap-mekanisme
- **Hybrid socket-flow** — Rombasert + instant mini-spill. MVP bruker kun rombasert.

### Hva er unikt for Game 5 (planlagt)

| Komponent | Unity | Web (planlagt) |
|-----------|-------|----------------|
| Ruletthjul | RouletteWheelController + Rigidbody2D | matter.js eller GSAP rotateZ |
| Free Spin | Game5FreeSpinJackpot.cs | Gjenbruk lykkehjul fra Game 1 |
| Billettfarger | 4 farger + swap | CSS/sprite tinting |
| DrumRotation | Kulebevegelse rundt hjulet | GSAP timeline |

### Testing

```
http://localhost:4000/web/?webClient=game_5
```
Eller test alle: `?webClient=all`
