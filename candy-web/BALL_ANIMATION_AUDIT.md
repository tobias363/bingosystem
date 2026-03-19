# Ball Animation System — Kritisk Audit & Utbedringsplan

## Krav (ufravikelige)
1. **Kun 1 ball i maskinens output om gangen** — aldri 2 synlige baller samtidig
2. **Null blinking** — ingen ball i railen skal noen gang blinke/flashe
3. **Animasjon feiler aldri** — uansett timing, nettverksforsinkelse, eller edge case

---

## Identifiserte sårbarheter

### KRITISK-1: Stuck flight — animasjon som aldri lander
**Fil:** `Theme1Playfield.tsx` linje 319–424

**Problem:** Hvis `flyingBallRef.current` er `null` når flight-effekten kjører, returneres det tidlig uten cleanup. `flyingRailBall` forblir satt, og alle nye baller køes i `pendingDisplayedRecentBallsQueueRef` for evig. Railen fryser helt.

**Scenario:** React kan i sjeldne tilfeller kjøre effekten før DOM-elementet er mountet (Strict Mode, concurrent features, eller nettleser med treg rendering).

**Fix:** Legg til en safety-timeout som tvangslander ballen etter maks varighet + margin.

---

### KRITISK-2: Measurement failure fallback rydder state men starter ingen animasjon
**Fil:** `Theme1Playfield.tsx` linje 250–254, 270–274

**Problem:** Når `measureFlight` bruker opp alle 16 forsøk uten å finne DOM-elementer, nullstiller den `queuedFlightBallNumber` og `queuedFlightTargetIndex`, men legger IKKE den nye ballen inn i `renderedRecentBalls`. Ballen forsvinner fra både output OG rail — den er tapt.

**Fix:** Ved measurement failure, commit ballen direkte til `renderedRecentBalls` uten animasjon.

---

### KRITISK-3: Effect cleanup kansellerer flight og mister ball
**Fil:** `Theme1Playfield.tsx` linje 414–423

**Problem:** Hvis React re-kjører flight-effekten (f.eks. pga. `onRailFlightSettled` prop-endring), kansellerer cleanup-funksjonen `flightAnimationFrameRef` og `landingSettleTimeoutRef`. Ballen som var midt i flyvning lander aldri — `setFlyingRailBall(null)` kalles aldri, og systemet henger.

**Fix:** I cleanup, force-land ballen: commit `resolvedBalls` til `renderedRecentBalls` og reset all flight state.

---

### HØY-1: Queue drain kan prosessere feil rekkefølge ved round-reset
**Fil:** `Theme1Playfield.tsx` linje 184–224

**Problem:** Når railen ryddes mellom runder (`recentBalls = []`), og umiddelbart etter får nye baller (`recentBalls = [42]`), kan køen inneholde `[]` etterfulgt av `[42]`. Hovedeffekten prosesserer `[42]`, tømmer køen. Men hvis timing er slik at `[]` ble prosessert først, ryddes railen og ballen forsvinner.

**Fix:** `previousRecentBallsRef` bør ALLTID oppdateres synkront i hovedeffekten, selv når snapshot køes.

---

### HØY-2: `renderedRecentBalls` initialiseres fra `displayedRecentBalls` — stale initial state
**Fil:** `Theme1Playfield.tsx` linje 132

**Problem:** `renderedRecentBalls` initialiseres med `displayedRecentBalls` (en prop fra GameShell), men `displayedRecentBalls` er en gammel state som ikke nødvendigvis matcher `recentBalls`. Ved mount kan railen vise feil baller i ett render-frame.

**Fix:** Initialiser `renderedRecentBalls` fra `recentBalls` i stedet, eller synkroniser med en `useLayoutEffect`.

---

### HØY-3: `onRailFlightSettled` i dependency array forårsaker unødvendig re-render
**Fil:** `Theme1Playfield.tsx` linje 424

**Problem:** `onRailFlightSettled` er en inline callback (`onRailFlightSettled?.(settledBallNumber)`) som kan ha ny referanse hver render. Hvis parent re-rendrer under en flight, kansellerer cleanup den aktive animasjonen.

**Fix:** Bruk en ref for `onRailFlightSettled` slik at flight-effekten ikke har den i dependency array.

---

### MIDDELS-1: `key={`slot-${index}`}` i BallRail er stabil men innholdet swapper
**Fil:** `Theme1BallRail.tsx` linje 52

**Problem:** Keyen er basert på index, ikke ballnummer. Når baller legges til og `railBalls` forskyves (`.slice(-30)`), bytter samme slot fra én ball til en annen. React oppdaterer `<img src>` in-place, men nettleseren kan vise et kort flash mens nytt bilde lastes.

**Status:** Lav risiko nå fordi baller bare appender (ikke forskyver) til 30. Men etter 30 baller begynner slice å forskyve.

**Fix:** Preload alle 75 ball-sprites ved oppstart for å eliminere flash.

---

### MIDDELS-2: Ingen maks-størrelse på animation queue
**Fil:** `Theme1Playfield.tsx` linje 658–665

**Problem:** `queueRecentBallsSnapshot` pusher ubegrenset. Ved nettverksproblemer der mange snapshots ankommer samtidig, kan køen bli stor. Stale-sjekken (linje 192-203) itererer lineært.

**Fix:** Begrens køstørrelsen til f.eks. 5 entries. Når den overflyter, dropp eldre entries.

---

### MIDDELS-3: `outputSuppressedForActiveFlightRef` resettes ikke ved force-reset
**Fil:** `Theme1Playfield.tsx` linje 126, 291, 363–369

**Problem:** Hvis `applyRecentBallsSnapshot` force-resetter flight state (linje 682-690, f.eks. ved round clear), nullstilles `setSuppressedOutputBallNumber` men `outputSuppressedForActiveFlightRef` forblir `true`. Neste flight kan starte med feil suppression-state.

**Fix:** Reset `outputSuppressedForActiveFlightRef.current = false` i force-reset-grenen.

---

## Utbedringsplan (prioritert rekkefølge)

### Steg 1: Safety-timeout for stuck flights (KRITISK-1)
Legg til en `setTimeout` som force-lander ballen etter `THEME1_RAIL_FLIGHT_HOLD_MS + THEME1_RAIL_FLIGHT_DURATION_MS + 500ms`. Denne trigges kun hvis normal landing ikke skjer.

### Steg 2: Measurement failure → commit ball uten animasjon (KRITISK-2)
Ved 16 mislykkede measurement-forsøk, legg ballen direkte inn i `renderedRecentBalls` i stedet for å bare nullstille state.

### Steg 3: Effect cleanup → force-land i stedet for å droppe (KRITISK-3)
Erstatt cleanup-funksjonen i flight-effekten med en force-landing som committer current state.

### Steg 4: Stabiliser `onRailFlightSettled` via ref (HØY-3)
Wrap callbacken i en ref slik at flight-effekten ikke re-kjører ved prop-endring.

### Steg 5: Reset `outputSuppressedForActiveFlightRef` ved force-reset (MIDDELS-3)
Enkel fix i `applyRecentBallsSnapshot`.

### Steg 6: Cap queue størrelse (MIDDELS-2)
Begrens `pendingDisplayedRecentBallsQueueRef` til maks 5 entries.

### Steg 7: Preload ball sprites (MIDDELS-1)
Last alle 75 sprite-URLer i en `useEffect` ved mount for å eliminere image-loading flash.

---

## Verifiseringstest: 5 000 spill

### Teststrategi
Headless Playwright-test som kjører mot lokal dev-server med mock-backend som simulerer 5 000 komplette runder (30 trekk hver, 2s intervall). Testen observerer DOM-tilstanden etter hvert trekk og verifiserer invariantene.

### Invarianter som sjekkes per trekk:
1. **Maks 1 output-ball synlig** — `querySelectorAll('.theme1-draw-machine__output-ball:not(.theme1-draw-machine__output-ball--hidden)')` har length ≤ 1
2. **Ingen blink** — sammenlign rail-snapshot før og etter hvert trekk; eksisterende baller skal aldri forsvinne og dukke opp igjen
3. **Ball-telling monoton** — antall baller i railen går bare opp (innenfor en runde) eller ned til 0 (mellom runder)
4. **Alle 30 baller til slutt i railen** — ved runde-slutt har railen eksakt 30 baller
5. **Ingen stuck flights** — `flyingBallRef` er null innen 3s etter siste trekk
6. **Rail ryddes korrekt** — baller forsvinner først når det er ≤4s til neste runde, og de kommer aldri tilbake

### Implementering:
- Ny fil: `candy-web/src/features/theme1/__tests__/ballAnimationStress.spec.ts`
- Bruker Playwright med `page.evaluate()` for å inspisere DOM-state
- Mock WebSocket-server som sender draw-events med 2s intervall
- Kjøretid: ~5000 * 30 * 0.1s (akselerert) ≈ ~4 timer med normal timing, men vi kan kjøre med `AUTO_DRAW_INTERVAL_MS=100` for stress-testing → ~25 min
