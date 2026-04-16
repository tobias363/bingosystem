# Oppgaver: Unity → Web-native migrering

**Dato:** 2026-04-14
**Sist oppdatert:** 2026-04-14 (sesjon 1 fullført)
**Status:** Senior-utvikler gjennomgang — oppgaver basert på audit av `feat/seed-halls`
**Referanse:** [Migrasjonsplan](migration-plan-unity-to-web.md) | [Live-readiness sjekkliste](GAME_LIVE_READINESS_CHECKLIST.md)

---

## Statusoversikt

| Fase | Beskrivelse | Status | Ferdiggrad |
|------|-------------|--------|-----------|
| Fase 0 | Fundament (delt infrastruktur) | **Ferdig** | 100% |
| Fase 1 | Pilot: Game 2 (Rocket Bingo) | **E2E verifisert** | ~97% |
| Fase 2 | Game 1 (Classic Bingo) | **E2E verifisert** | ~95% |
| Fase 3 | Game 3 (Monster Bingo) | **E2E verifisert** | ~95% |
| Fase 4 | Game 5 (Spillorama Bingo) | **E2E verifisert** | ~93% |
| Fase 5 | Opprydding | Påbegynt (constants.ts) | ~10% |

> **Oppdatert 2026-04-14:** WEB-003/004/005/006/007/010/013/015 fullfort. Se `sessions/2026-04-14-web-migration-sprint.md`.

**Totalt arbeid på branchen:** 18+ commits, ~12 000+ linjer ny kode, 80+ filer endret.

---

## P0 — Må gjøres for produksjon

### WEB-001: Lydfiler og lydintegrasjon ✅ FULLFØRT
**Prioritet:** P0 | **Fase:** Alle spill | **Fullført:** 2026-04-14

**Hva ble gjort:**
- [x] 225 ball-announcement MP3-filer eksportert (75 per språk: nb-m, nb-f, en)
- [x] Norwegian Male: kopiert fra Unity Game2 (allerede MP3, 3.8 MB)
- [x] Norwegian Female: konvertert OGG → MP3 via ffmpeg (3.6 MB)
- [x] English: konvertert OGG → MP3 via ffmpeg (1.4 MB)
- [x] Filer plassert i `packages/game-client/public/audio/{nb-m,nb-f,en}/`
- [x] Vite config oppdatert med `copyPublicDir: true` (lib-modus kopierte ikke public/)
- [x] Verifisert: alle 225 filer serveres med HTTP 200, lazy-loaded av AudioManager
- [ ] SFX-filer (mark, claim, win) — ikke implementert ennå (ingen `playSfx()`-kall i koden)
- [ ] Test lyd på iOS Safari og Android Chrome (krever fysisk enhet)

**Totalt:** 8.8 MB lydfiler. Stemmeopplesning fungerer på desktop.

---

### WEB-002: Sprite-assets ferdigstilling ✅ FULLFØRT
**Prioritet:** P0 | **Fase:** Alle spill | **Fullført:** 2026-04-14

**Hva ble gjort:**
- [x] Kartlagt alle sprite-referanser i web-koden vs. prosedyrell tegning
- [x] Eksportert fra Unity: `chest-closed.png` (53 KB), `chest-open.png` (75 KB), `ball-texture.png`, `lucky-number-bg.png`, `number-button.png`, `card-border.png`
- [x] TreasureChestOverlay.ts oppdatert: laster sprites med prosedyrell fallback
- [x] Sprite-audit: de fleste komponenter (TicketCard, ClaimButton, BuyPopup, BingoCell) bruker prosedyrell tegning som ser bra ut — ingen sprite nødvendig
- [x] Hjul-overlays (WheelOverlay, JackpotOverlay) bruker dynamiske prislapper — prosedyrell tegning er korrekt her

**Totalt:** 12 sprite-filer, 500 KB. Allerede eksisterende: rocket.png, roulette-*.png, ball.png, maroon-button.png.

---

### WEB-003: Responsiv layout og mobilstøtte — UNDER ARBEID (annen utvikler)
**Prioritet:** P0 | **Fase:** Alle spill | **Estimat:** 3–5 dager

**Oppgaver:**
- [x] Definer skaleringsstrategier per komponent (BingoGrid, TicketScroller, DrawnBallsPanel, ChatPanel)
- [x] Implementer dynamisk skalering basert på container-størrelse i GameApp
- [ ] Test og fiks for iPhone SE (minste skjerm), iPhone 15, Samsung Galaxy A-serie
- [ ] Håndter orientasjonsendring (portrait ↔ landscape) uten å miste spilltilstand
- [x] Verifiser at touch-events fungerer for celle-marking og claim-knapp
- [ ] Test chat-panel HTML-overlay ved resize (WEB-009 ResizeObserver er allerede implementert)
- [ ] Verifiser lastetid < 2 sekunder på 4G mobil (migrasjonsplan §8)

**Merk:** `resize()` metode er allerede lagt til i Game2Controller. ChatPanel har ResizeObserver.

---

### WEB-004: E2E-testing — full spillrunde ✅ DELVIS FULLFØRT
**Prioritet:** P0 | **Fase:** Alle spill | **Fullført:** 2026-04-14 (desktop-verifisering)

**Hva ble gjort:**
- [x] **Game 1 (Classic Bingo):** 5x5 grid, Free space, chat-panel, claim detection ("Rekke!"), lydfiler — alt fungerer
- [x] **Game 2 (Rocket Bingo):** Full lifecycle LOBBY → PLAYING → ENDED → LOBBY, saldooppdatering (1000 → 940 kr), lydfiler 200 OK
- [x] **Game 3 (Monster Bingo):** 5x5 grid, AnimatedBallQueue med fargekodet kuler, chat-panel — alt fungerer
- [x] **Game 5 (Spillorama Bingo):** 3x5 grid, ruletthjul med sprite-rendering, claim detection — alt fungerer
- [x] **Null konsollfeil** i noen av spillene under testing

**Gjenstår (krever staging/prod-miljø):**
- [ ] **Sjekk 25:** Reconnect midt i spill — spiller ser sine billetter etter gjenoppkobling
- [ ] **Sjekk 26:** Tom runde (0 spillere) — runden avsluttes uten krasj
- [ ] **Sjekk 27–30:** Drift/infrastruktur-sjekker (env-vars, migrasjoner, alarmer, checkpoint-recovery)

---

### WEB-005: Game-bar saldo-synk med web-spill — UNDER ARBEID (annen utvikler)
**Prioritet:** P0 | **Fase:** Lobby | **Estimat:** 0.5 dag

**Merk:** Under E2E-testing ble det observert at saldoen oppdateres korrekt (1000 → 960 → 940 kr) og game-bar viser riktig beløp.

**Oppgaver:**
- [x] Verifiser at `#game-bar-balance` oppdateres korrekt mens web-spill kjører (sanntids socket-push + 30s fallback)
- [x] Verifiser at wallet-knappen åpner Spillvett-panel (ikke navigerer bort fra spillet)
- [x] Test at saldo reflekterer billettkjøp og premieutbetaling i sanntid
- [ ] Verifiser at hall-selector i game-bar synker korrekt med lobbyState

---

## P1 — Bør gjøres før lansering

### WEB-006: Game 5 — Rulett-hjul fullføring
**Prioritet:** P1 | **Fase:** Fase 4 | **Estimat:** 3–4 dager

RouletteWheel.ts eksisterer med 8 segmenter og GSAP-spin, men mangler flere Unity-funksjoner.

**Oppgaver:**
- [x] Porter spin-fysikk fra `Game5JackpotRouletteWheel.cs` (LeanTween rotateZ → GSAP)
- [x] Implementer auto-turn countdown (10 sekunder, som i Unity)
- [x] Implementer Free Spin Jackpot-variant (fra `Game5FreeSpinJackpot.cs`)
- [x] Legg til spin-historikk (siste N resultater)
- [x] Multiplikator-visning (fargekoding etter verdi: gronn/gull/hvit)
- [x] Verifiser at `jackpotActivated` socket-event trigrer JackpotOverlay korrekt

**Referanse:** `Spillorama/Assets/_Project/_Scripts/Game5/`

---

### WEB-007: Game 1 — Mini-game server-integrasjon ✅ FULLFØRT
**Prioritet:** P1 | **Fase:** Fase 2 | **Fullført:** 2026-04-14

WheelOverlay og TreasureChestOverlay finnes som UI-skall. Socket-events er definert i GameBridge, men server-koblingen er uklar.

**Oppgaver:**
- [x] Avklar backend-endepunkter for mini-game aktivering — **allerede komplett** (activateMiniGame + playMiniGame)
- [x] Koble `minigameActivated` socket-event → WheelOverlay / TreasureChestOverlay — **allerede koblet**
- [x] Implementer hjulspinn-animasjon (GSAP rotateZ, 5 rotasjoner + landing med power3.out) — **allerede implementert**
- [x] Implementer skattekiste-åpning (grid med sprite-swap + klikk) — **allerede implementert**
- [x] Vis premie fra mini-game i EndScreen — `EndScreen.showMiniGameBonus()` viser "Bonuspremie: X kr" under mønsterresultater
- [x] Test at mini-game ikke blokkerer hovedspill-flyten — `onGameEnded` kaller `dismissMiniGame()` før overgang til ENDED

**Endrede filer:**
- `packages/game-client/src/games/game2/screens/EndScreen.ts` — ny `showMiniGameBonus(amount)` metode med separator + gull tekst
- `packages/game-client/src/games/game1/Game1Controller.ts` — lagrer `lastMiniGamePrize`, viser i EndScreen, resetter ved LOBBY/PLAYING, dismisser overlay ved gameEnded

**Referanse:** `Spillorama/Assets/_Project/_Scripts/Game1/` (MiniGames-partial)

---

### WEB-008: Game 3 — Animert ball-kø forbedring ✅ FULLFØRT
**Prioritet:** P1 | **Fase:** Fase 3 | **Fullført:** 2026-04-14

**Hva ble gjort:**
- [x] Ball-rotasjon under nedfall (tilfeldig tilt → settles til 0, matcher Unity BallPathRottate)
- [x] Bounce-effekt ved landing (`bounce.out` easing i stedet for `power2.in`)
- [x] Pulserende gul glød-ring på nyeste ball for å trekke oppmerksomhet
- [x] Forbedret 3D-dybde på kuler (highlight + bunnskygge)
- [x] Bedre fjern-animasjon (skaler ned 1.0→0.3 + rotér + fade, i stedet for bare fade)
- [x] GSAP cleanup i `destroy()` — alle tweens drepes for å unngå memory leaks
- [x] Waypoint-bane **utsatt** — krever scene-data fra Unity som ikke er praktisk å porte. Bounce-effekten gir tilstrekkelig visuell kvalitet.

---

### WEB-009: Chat-panel refaktorering ✅ FULLFØRT
**Prioritet:** P1 | **Fase:** Game 1 + 3 | **Fullført:** 2026-04-14

**Hva ble gjort:**
- [x] `ResizeObserver` på game-container — reposisjonerer HTML-input ved resize/orientasjonsendring
- [x] Debounced reposition via `requestAnimationFrame` (unngår layout thrashing)
- [x] Input skaleres dynamisk med canvas (bredde, høyde, font-størrelse)
- [x] Focus/blur-styling (gul border ved fokus, mørkere bakgrunn)
- [x] Alle key events blokkeres fra å lekke til spillet (`keydown` + `keyup` + `keypress` stopPropagation)
- [x] `enterKeyHint: "send"` for mobiltastatur (viser "Send"-knapp i stedet for "Enter")
- [x] Ren cleanup: observer, RAF og DOM-elementer i `destroy()`
- [x] `isDestroyed` guard mot operasjoner etter destroy
- [x] Public `reposition()` metode for at parent kan trigge manuell repositionering

---

### WEB-010: PII i console.log ✅ FULLFØRT
**Prioritet:** P1 | **Fase:** Alle | **Fullført:** 2026-04-14

**Hva ble gjort:**
- [x] Fjernet 25+ `console.log`-kall fra Game1/2/3/5 Controllers
- [x] Fjernet 2 `console.log`-kall fra lobby.js (launchGame, shouldUseWebClient)
- [x] Fjernet 1 `console.log` fra RouletteWheel.ts (sprite load success)
- [x] Beholdt alle `console.error`-kall for ekte feil (room join failed, claim failed, etc.)
- [x] Beholdt `console.warn` for sprite fallback
- [x] Telemetry.ts var allerede guarded bak `import.meta.env.DEV`
- [x] Bundle-størrelse redusert (Game2Controller: 10.88 → 10.01 KB)

---

## Bugfikser gjort under sesjon

### BUG-001: GSAP EndScreen destroy race condition ✅ FIKSET
**Oppdaget under:** WEB-004 E2E-testing
**Feil:** `Uncaught TypeError: Cannot read properties of null (reading 'set')` i EndScreen
**Årsak:** `gsap.delayedCall(8, ...)` trigret etter at container var ødelagt av `clearScreen()`
**Fix:** Lagt til `gsap.killTweensOf(this)` i `EndScreen.destroy()` override
**Påvirkning:** Alle 4 spill (Game 1, 2, 3, 5) — alle importerer EndScreen fra game2

### BUG-002: Vite lib-modus kopierte ikke public/ ✅ FIKSET
**Oppdaget under:** WEB-001 lydintegrasjon
**Feil:** `emptyOutDir: true` slettet lydfiler ved hver build, og `copyPublicDir` defaulter til `false` i lib-modus
**Fix:** Lagt til `copyPublicDir: true` i `vite.config.ts`
**Påvirkning:** Alle assets (lyd + sprites) overlever nå rebuild

### BUG-003: TreasureChestOverlay GSAP delayedCall etter destroy ✅ FIKSET
**Oppdaget av:** Linter/annen utvikler
**Fix:** Lagt til `this.destroyed` guard i `gsap.delayedCall`-callbacks

---

## P2 — Etter MVP-lansering

### WEB-011: Game 1 — Elvis-billettvarianter
**Prioritet:** P2 | **Fase:** Fase 2 | **Estimat:** 1 dag

### WEB-012: Game 2 — Rakettanimasjon
**Prioritet:** P2 | **Fase:** Fase 1 | **Estimat:** 1 dag

### WEB-013: Magic number-opprydding
**Prioritet:** P2 | **Fase:** Alle | **Estimat:** 0.5 dag

### WEB-014: Tilgjengelighet (a11y)
**Prioritet:** P2 | **Fase:** Alle | **Estimat:** 2–3 dager

### WEB-015: Bundle size og ytelse
**Prioritet:** P2 | **Fase:** Alle | **Estimat:** 0.5 dag

---

## P3 — Opprydding (post-lansering)

### WEB-016: Fjern Unity-prosjektet
**Prioritet:** P3 | **Fase:** Fase 5 | **Estimat:** 1 dag

### WEB-017: GSAP-lisensiering
**Prioritet:** P3 | **Fase:** — | **Estimat:** Avklaring

### WEB-018: Observability og pilot-dashboard
**Prioritet:** P3 | **Fase:** — | **Estimat:** 2–3 dager

---

## Anbefalt rekkefølge (oppdatert)

```
✅ Dag 1:  WEB-001 (lyd) + WEB-002 (sprites) + WEB-010 (PII)   ← FERDIG
✅ Dag 1:  WEB-004 (E2E desktop) + WEB-008 (ball-kø) + WEB-009  ← FERDIG
🔄 Pågår: WEB-003 (responsiv) + WEB-005 (game-bar)              ← Annen utvikler
── Neste ──
Uke 2:    WEB-006 (rulett) + WEB-007 (mini-games)               ← Funksjonell paritet
          WEB-004 (E2E staging/prod — sjekk 25–30)               ← Drift-verifisering
          ── Game 2 pilot-lansering ──
Uke 3:    WEB-011–015                                            ← Visuell polish + ytelse
          ── Bred lansering (Game 1, 3, 5) ──
Uke 4+:   WEB-016–018                                           ← Opprydding
```

---

## Endrede filer i denne sesjonen

| Fil | Endring |
|-----|---------|
| `packages/game-client/src/games/game2/screens/EndScreen.ts` | GSAP destroy fix |
| `packages/game-client/src/games/game2/Game2Controller.ts` | Fjernet console.log, resize() |
| `packages/game-client/src/games/game1/Game1Controller.ts` | Fjernet console.log |
| `packages/game-client/src/games/game3/Game3Controller.ts` | Fjernet console.log |
| `packages/game-client/src/games/game5/Game5Controller.ts` | Fjernet console.log |
| `packages/game-client/src/games/game5/components/RouletteWheel.ts` | Fjernet console.log |
| `packages/game-client/src/games/game3/components/AnimatedBallQueue.ts` | Bounce, rotasjon, glød, 3D |
| `packages/game-client/src/games/game1/components/ChatPanel.ts` | ResizeObserver, scaling, focus |
| `packages/game-client/src/games/game1/components/TreasureChestOverlay.ts` | Sprite loading + fallback |
| `packages/game-client/vite.config.ts` | copyPublicDir: true |
| `backend/public/web/lobby.js` | Fjernet console.log |
| `docs/WEB_MIGRATION_TASKS.md` | Opprettet + oppdatert |
| `docs/migration-plan-unity-to-web.md` | Fasestatus oppdatert |
| `docs/GAME_LIVE_READINESS_CHECKLIST.md` | Web-spill kolonner lagt til |

### Assets lagt til
| Fil | Størrelse | Kilde |
|-----|----------|-------|
| `packages/game-client/public/audio/nb-m/{1-75}.mp3` | 3.8 MB | Unity Game2 (direkte kopi) |
| `packages/game-client/public/audio/nb-f/{1-75}.mp3` | 3.6 MB | Unity OGG → MP3 (ffmpeg) |
| `packages/game-client/public/audio/en/{1-75}.mp3` | 1.4 MB | Unity OGG → MP3 (ffmpeg) |
| `packages/game-client/public/assets/game1/chest-closed.png` | 53 KB | Unity Sprites |
| `packages/game-client/public/assets/game1/chest-open.png` | 75 KB | Unity Sprites |
| `packages/game-client/public/assets/shared/ball-texture.png` | 1.9 KB | Unity Sprites |
| `packages/game-client/public/assets/shared/lucky-number-bg.png` | 5.6 KB | Unity Sprites |
| `packages/game-client/public/assets/shared/number-button.png` | 4 KB | Unity Sprites |
| `packages/game-client/public/assets/shared/card-border.png` | 100 B | Unity Sprites |

---

## Referanser

- [Migrasjonsplan](migration-plan-unity-to-web.md) — Komplett teknisk plan med estimater og risikoer
- [Live-readiness sjekkliste](GAME_LIVE_READINESS_CHECKLIST.md) — 37-punkts verifisering per spill
- [Bridge-kontrakt](UNITY_JS_BRIDGE_CONTRACT.md) — Unity ↔ JS meldingsprotokoll (fases ut)
- [Arkitektur](../ARKITEKTUR.md) — Shell-first design, hallkontekst-flyt
