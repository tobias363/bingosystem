# Ball Animation Bug — Handoff til utvikler

## Problem

Ballen vises **to ganger** med to forskjellige animasjoner ved hver trekning. Skal kun vises EN gang: liten → stor.

## Hva som fungerte tidligere (staging-branch)

Staging-branch (`origin/staging`) hadde 53 commits som fikset ball-animasjon. Alt fungerte. Disse commits er IKKE pa main.

## Arkitektur — to ball-elementer

Ved hver trekning rendres to SEPARATE DOM-elementer:

1. **Output ball** (`.theme1-draw-machine__output-ball`) — vises under globen etter maskinanimasjon (1600ms)
2. **Flying ball** (`.playfield__flying-ball`) — RAF-animasjon fra globe til rail

`suppressedOutputBallNumber` skal skjule output-ballen mens flying-ballen er aktiv. Men koordineringen er broken.

## Koden

### Output ball (maskin)
- **Fil:** `candy-web/src/features/theme1/components/Theme1DrawMachine.tsx`
- **Linje ~419-425:** `setOutputBallNumber(sequence.drawNumber)` — viser output ball etter 1600ms
- **CSS:** `candy-web/src/features/theme1/components/theme1DrawMachine.css` linje ~352

### Flying ball (flight)
- **Fil:** `candy-web/src/features/theme1/components/Theme1Playfield.tsx`
- **Linje ~252-339:** `useLayoutEffect` starter flight nar `queuedFlightBallNumber` settes
- **Linje ~341-460:** RAF-animasjon loop

### Koordinering (suppression)
- **Fil:** `candy-web/src/features/theme1/components/Theme1Playfield.tsx`
- **Linje ~313:** `outputSuppressedForActiveFlightRef.current = true` — setter suppression
- **Linje ~314:** `setSuppressedOutputBallNumber(queuedFlightBallNumber)` — forteller DrawMachine a skjule output
- **Linje ~372:** `outputSuppressedForActiveFlightRef.current = false` — fjerner suppression etter landing
- **DrawMachine linje ~917:** `outputBallNumber === suppressedOutputBallNumber` → legger til `--hidden` klasse

### State-flyt (Zustand store)
- **Fil:** `candy-web/src/features/theme1/hooks/useTheme1Store.ts`
- **`draw:new` handler (~linje 870):** `applyPendingDrawPresentation` setter `featuredBallNumber` og `featuredBallIsPending=true`
- **`room:update` handler (~linje 888):** `applyLiveSnapshot` remapper hele snapshot — kan overskrive ball-state
- **`drawPresentationActiveUntilMs` (~linje 1201):** Beskyttelsesvindu som holder `recentBalls` stabil under animasjon

## Hva jeg endret (og som kan ha broken ting)

### 1. `drawPresentationActiveUntilMs` (useTheme1Store.ts ~linje 1875)
Lagt til 3.9s beskyttelsesvindu. Beskytter `recentBalls` fra `room:update`.
**Risiko:** Kan forsinke nar baller dukker opp i rail.

### 2. Draw protection i `applyLiveSnapshot` (useTheme1Store.ts ~linje 1198-1209)
Holder `recentBalls` fra current state under draw-animasjon. Lar `featuredBallNumber` og `featuredBallIsPending` flyte fritt.
**Risiko:** `room:update` kan nulle `featuredBallNumber` for tidlig → output ball forsvinner → flying ball starter → output ball dukker opp igjen.

### 3. CSS scale-in pa output ball (theme1DrawMachine.css ~linje 352)
La til `transform: scale(0)` default og transition til `scale(1)`.
**Risiko:** Transition kan kjore SAMTIDIG med at flying ball starter → to baller synlig.

## Sannsynlig rotarsak

Output-ballen far `scale(1)` transition (350ms) SAMTIDIG som flying-ballen starter sin RAF-animasjon. `suppressedOutputBallNumber` legger til `--hidden` klasse, men CSS-transition fra `scale(0)→scale(1)` kan overstyre `opacity: 0` pga transition timing.

## Foreslatt fix

1. **Fjern CSS transition pa output ball** — bruk `opacity: 0/1` uten transition (som originalt)
2. **Eller:** Sett `display: none` i stedet for `opacity: 0` pa `--hidden` for a umiddelbart fjerne elementet
3. **Rull tilbake mine CSS-endringer** i `theme1DrawMachine.css` til original state

## Filer endret i denne sesjonen

Alle endringer er pa branch `fix/candy-tile-auth-gating` (PR #63):

| Fil | Endring |
|-----|---------|
| `backend/src/game/ticket.ts` | 3x5 grid (var 5x5) |
| `backend/src/platform/PlatformService.ts` | DB error logging |
| `candy-web/src/features/theme1/hooks/useTheme1Store.ts` | Draw protection, debug cleanup, markBoards fix |
| `candy-web/src/features/theme1/hooks/theme1LiveSync.ts` | `drawPresentationActiveUntilMs` felt |
| `candy-web/src/features/theme1/hooks/useTheme1Store.stake.test.ts` | Test for auto-bootstrap |
| `candy-web/src/features/theme1/components/Theme1GameShell.tsx` | Board mark clearing mellom runder |
| `candy-web/src/features/theme1/components/theme1DrawMachine.css` | Output ball scale-in (TROLIG BUGGEN) |
| `candy-web/src/domain/theme1/mappers/theme1TicketResolution.ts` | Behold tall mellom runder |
| `candy-web/src/styles/global.css` | Board cell fade transition |
| `bingo_in_20_3_26_latest/public/web/index.html` | Auth-gating, debug panel fjernet |
| `bingo_in_20_3_26_latest/public/web/external-games.js` | Tile redesign |
| `bingo_in_20_3_26_latest/App/Routes/integration.js` | Auth-beacon Online filter |

## Staging-branch som referanse

`origin/staging` har en fungerende ball-animasjon. Diff mellom main og staging for candy-web/src:
```
git diff origin/main..origin/staging -- candy-web/src/
```
Kun `useTheme1Store.ts` er endret — 12 linjer inn, 38 ut. Staging har IKKE mine nye endringer (draw protection, board clearing, etc.)

## Slik tester du

1. `./scripts/dev.sh` — starter backend (4000) + frontend (4174)
2. Admin: `http://localhost:4000/admin/` (test@test.no / test1234)
3. Sett `Trekk-intervall` til 2-3 sekunder for a se animasjonen tydelig
4. Observer output-ballen under globen og flying-ballen — skal ALDRI vises samtidig
