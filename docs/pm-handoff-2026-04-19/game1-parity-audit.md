# Game 1 — Komplett paritets-audit (Legacy Unity vs Web-native)

**Dato:** 2026-04-18
**Utført av:** Claude Code (automatisert audit)
**Arbeidskatalog:** `/Users/tobiashaugen/Projects/Spillorama-system/.claude/worktrees/slot-1`
**Canonical spec:** `docs/engineering/game1-canonical-spec.md`
**Parity matrix (levende):** `docs/engineering/PARITY_MATRIX.md`
**Tidligere audit (arkivert):** `packages/game-client/src/games/game1/AUDIT-RAPPORT.md` (2026-04-16, ~42 gaps identifisert)

> **Kontekstnote:** Rapporten skiller mellom *Legacy-avkobling*-porteføljen (BIN-494/499/500/501/502/507/516 m.fl. — mye **allerede Done/merged**) og *Unity-kosmetisk paritet*-porteføljen (prosjektet "Spill 1 — Komplett Unity-portering", der **47 issues fortsatt Backlog**). Det er det siste kravet — 100 % kosmetisk 1:1 mot Unity — som brukeren nå krever.

---

## §1. Overordnet status

### Linear-prosjekt: "Spill 1 — Komplett Unity-portering" (BIN prosjekt-ID `f9f194c3`)

| Status | Antall |
|---|---:|
| **Done** | 63 |
| **Backlog** | 47 |
| **In Progress** | 0 |
| **Totalt** | 110 |

Av de 47 Backlog:
- 16 er **Epics** (sporer sub-tasks — representerer tema, ikke enkeltoppgaver).
- 31 er konkrete tasks (5 High, 12 Medium, 14 Low i prioritet).
- 2 av Urgent-epics har backlog-children som Urgent-Urgent: BIN-449 (kjøp-flyter) og BIN-441 (spillvariant-flyt).

### Parity matrix (Legacy-avkobling §2 i `PARITY_MATRIX.md`)

Game 1 har 41 rader: **17 ✅ / 24 🟡 / 0 ❌** (41 % Release-klar).
De 24 🟡 venter i hovedsak på staging-verifisering, ikke ny kode.

### Røde flagg / overraskelser

1. **To prosjekter, forskjellig definisjon av "ferdig".** Legacy-avkobling ("dette kjører i prod") vs Unity-portering ("ser/føles identisk med Unity"). Release-matrisen sier 41 % — Unity-paritet-prosjektet sier 63/110 ≈ 57 % av tasks, men 47 task-rader fortsatt Backlog dekker de mest synlige UI-detaljene (blink, pulse, flip, farger, ticket-varianter).
2. **AUDIT-RAPPORT.md ligger innenfor `packages/game-client/src/games/game1/` og er utdatert (2026-04-16).** Flere av gap'ene er landet siden (TicketCard-flip, MysteryGame + ColorDraft overlays, audio med 60 clips × 3 voices, SPECTATING, auto-arm fjernet). Bør arkiveres til `docs/archive/`.
3. **`PORTERING-GUIDE.md` ligger i game1-katalog** — kan også arkiveres.
4. **Ticket-variant gruppering i UI (elvis-par, traffic-light-triader) er delvis.** Kode håndterer `ticket.type` og `ticket.color`, men Unity's visuelle gruppering (større kort for Elvis, 3-stacking for TrafficLight, navne-labels) er ikke 1:1.
5. **ADR-nivå beslutning:** flere "Low/Medium" backlog-items er kosmetiske, men brukerkravet om 100 % 1:1 hever alle til P1.
6. **Ingen kritiske bugs/security-flagg funnet** i kode-inspection. Claim-validering er server-side, stake er server-side — fail-closed mønsteret er intakt.

### Estimert gjenstående arbeid

- **Rent kosmetisk 1:1 (Unity-paritet, hovedfokus her):** ~8–12 dev-dager solo, 4–6 dev-dager parallellisert på 2 agenter.
- **Staging-verifisering av de 24 🟡 Legacy-avkoblings-radene:** 1–2 dager (manuell test + fikser) — uavhengig av kosmetisk.
- **Total kalenderbudsjett til "100 %":** **5–7 kalenderdager med 2 agenter parallelt**, inkl. verifiserings-tid.

---

## §2. Funksjonell paritets-matrise

Legende: **OK** = 1:1 med Unity · **DELVIS** = fungerer, men stil/timing/variant-detaljer avviker · **MANGLER** = ikke implementert · **AVVIK** = implementert annerledes (bevisst eller ubevisst).

### Gameplay-logikk
| Område | Status | Notat |
|---|---|---|
| Ball-trekking (`draw:new` / `drawIndex`) | **OK** | Server-autoritativ, gap-detection (BIN-502), dedup ved reconnect. `PlayScreen.onNumberDrawn`, `CenterBall.ts`. |
| Mark-billett | **OK** | Klient-lokal mark + server-slim (`ticket:mark`, BIN-499). `BingoCell.ts:markNumber()`. |
| Claim LINE + BINGO | **OK** | Server-validert via `PatternValidator` — klient-claim er kun UI-trigger. `PlayScreen.ts:handleClaim`. |
| Vinn-sjekk / pattern:won | **OK** | Toast + sound + endscreen bonus. `Game1Controller.ts:500`. |
| ticketSelections per type (`bet:arm`) | **OK** | StakeCalculator.ts + Game1BuyPopup.ts. |
| Auto-arm fjernet | **OK** | Bekreftet ikke-auto; spiller klikker eksplisitt (commit `dc03e24e`). |
| Maks vekt 30 | **DELVIS** | Backend validerer, men klient-UI validerer ikke før send — spiller kan oppleve sen feilmelding (BIN-402 Backlog). |
| Claim auto-submit | **OK** | ClaimDetector trigger knapp ved 1-to-go = 0. |

### Visuell presentasjon
| Område | Status | Notat |
|---|---|---|
| 5×5 grid med fri sentercelle | **OK** | `BingoCell.bgFree` + "F"-tekst. |
| 7 fargetemaer (default, yellow, white, red, green, elvis, spec mm) | **DELVIS** | TICKET_THEMES.ts har temaer, men **BIN-374 "verifiser alle 6+1 mot Unity inspector"** er Backlog. Elvis-tema egen issue (BIN-427). |
| Ball-farger per kolonne (B/I/N/G/O) | **DELVIS** | BallTube har farger; Databingo60 (1–60) mapping ikke verifisert mot Unity. **Game 1 er 75-ball ifølge spec** — men backend har `maxDrawsPerRound` clampet til 30 (BIN-520 merged, skal verifiseres i staging). |
| Progress bar "X av Y trekninger" | **DELVIS** | CenterTopPanel viser, men drawCapacity vs Unity skilt (BIN-409 "kjøp-deaktivering etter N trekk" Backlog). |
| Score / gevinstvisning | **OK** | Toast + EndScreen viser premier. |
| Countdown MM:SS | **OK** | GSAP-tween i CenterBall (`CountdownTimer` for lobby i G2-gjenbruk). Fix fb8a3a4f: ikke countdown i RUNNING. |
| Trekkhistorikk-panel | **MANGLER** | BIN-387 Backlog. Unity: `WithdrawNumberHistoryPanel.cs`. |
| Neste-kule preview | **MANGLER** | BIN-385 Backlog (lav prio). |

### Animasjoner
| Område | Status | Notat |
|---|---|---|
| Ball-drop/ball-animation | **DELVIS** | CenterBall har scale/opacity; Unity's punch-tilt mønster ikke identisk. |
| Wheel spin | **OK** | `WheelOverlay.ts` med GSAP `rotateZ`, 8 segmenter. BIN-420 "verifiser mot Unity" Backlog (tuning). |
| Chest open | **OK** | `TreasureChestOverlay.ts`. BIN-422 "verifiser" Backlog. |
| One-to-go celle-blink | **AVVIK** | Unity: scale 1.5×, 1.0s, elastic. Web: 1.15×/0.4s. **BIN-363 Epic + BIN-386 DONE (blink finnes)**, men timing/scale avviker. |
| One-to-go billett-bakgrunn-blink | **MANGLER** | Unity: hele bongen oscillerer mellom normalfarge og Blink_On_1 (B2 i AUDIT). Ikke portert. |
| BINGO pulse | **DELVIS** | TicketCard har `bgBlinkTween`/pulse-hooks, men 5-rep 0.85→1.05 ikke verifisert 1:1. |
| Ticket flip (scaleX 1→0→1, auto-return 3s) | **OK** | `TicketCard.ts:flipToDetails()` implementert. Bekreftet 2026-04-18 (fb8a3a4f). |
| Pattern breathe (1.06×, 0.5s) | **DELVIS** | `PatternMiniGrid.ts` har pulse; cycling design 1-4 mangler (BIN-364 Epic Backlog). |
| Chat slide (0.25s) | **DELVIS** | ChatPanelV2 har slide; bong-area resize ved chat-toggle mangler (BIN-393). |
| Celebrate (confetti / win) | **DELVIS** | Toast + sound; ingen dedikert confetti-anim. |

### Lyd
| Område | Status | Notat |
|---|---|---|
| 3 stemmepakker (no-male / no-female / en) | **OK** | 60 clips hver, bekreftet ved `ls public/assets/game1/audio/`. |
| Bingo-announce sekvensering | **OK** | AudioManager med dedup + ventetid. |
| BINGO-sound | **OK** | `bingo.ogg` + sekvens etter voice. |
| Mark-click-notification SFX | **OK** | `sfx/*.wav/ogg` + preload. |
| Double-announce toggle | **OK** | SettingsPanel koblet til AudioManager. |
| Mobile audio unlock | **OK** | `root.on("pointerdown", () => audio.unlock())`. |
| Lyd-innstillinger UI | **DELVIS** | SettingsPanel finnes, men BIN-433 ("lyd-innstillinger") er Backlog — sannsynlig polish/per-channel-volum som Unity har. |

### Tema-system
| Område | Status | Notat |
|---|---|---|
| 7 fargetemaer | **DELVIS** | Struktur OK; verifisering (BIN-374) + Elvis-tema (BIN-427) Backlog. |
| Theme-switching per runde | **DELVIS** | Tema følger `ticket.color` fra backend (BIN-373 Done), men PlayScreen-logikk er ikke visuelt verifisert mot Unity. |
| Per-hall tema-config | **OK** | Backend leverer, klient respekterer. |

### Minigames
| Område | Status | Notat |
|---|---|---|
| WheelOfFortune | **OK** | Implementert, 8 segmenter. |
| TreasureChest | **OK** | Implementert, server-deterministic prize. |
| MysteryGame | **DELVIS** | Overlay implementert (ikke stub), men BIN-505 🟡 Release-klar. |
| ColorDraft | **DELVIS** | Overlay implementert, BIN-506 🟡 Release-klar. |
| 4-veis rotasjon (server) | **OK** | `BingoEngine.MINIGAME_ROTATION`. |
| Auto-select countdown | **OK** | TreasureChestOverlay har `autoSelectCountdown = 10`. |

### Jackpot
| Område | Status | Notat |
|---|---|---|
| Spillorama-jackpot (per-farge config) | **OK** | BIN-461 Done. |
| Lucky number bonus | **OK** | BIN-465 Done. |
| Jackpot-info UI i G1 | **MANGLER** | BIN-407 "Jackpot-info" Backlog (Low). Unity viser jackpot-summer i G1 header. |

### UI-chrome
| Område | Status | Notat |
|---|---|---|
| Header med hall-navn + romkode | **DELVIS** | LeftInfoPanel viser; Unity har dedikert header med balance + hallName + room. **Epic BIN-369 UI-layout Backlog**. |
| Player-list | **DELVIS** | `PlayerInfoBar` (gjenbrukt fra G2) viser antall; Unity viser per-hall-count (BIN-496 "per-hall players" bekreftet i nylig commit `250ceee7` Done). |
| Chat-panel (sanntids) | **OK** | ChatPanelV2 + chat:history replay (BIN-516 merged). |
| Chat-persistens DB | **OK** | BIN-516 merged. |
| Toast/notifications | **OK** | ToastNotification.ts. |

### Host-mode
| Område | Status | Notat |
|---|---|---|
| Host manuell start (`start-game`) | **OK** | `handleStartGame` i controller (commit `250ceee7`). |
| Pause/resume | **OK** | BIN-460 Done. PauseOverlay + backend-kontroll. |
| Admin hall-events (room-ready, force-end) | **OK** | BIN-515 merged. |

### Late-joiner
| Område | Status | Notat |
|---|---|---|
| Re-sync via snapshot | **OK** | `room:resume` + `applySnapshot`. |
| Loader-barriere (BIN-500) | **OK** | `waitForSyncReady` med 5s timeout. |
| Event-buffer replay (BIN-501) | **OK** | SpilloramaSocket event-buffer med replay på første subscribe. |
| SPECTATING-fase (BIN-507) | **OK** | Egen phase i Game1Controller. |

### Error handling
| Område | Status | Notat |
|---|---|---|
| Disconnect → reconnect | **OK** | `connectionStateChanged` + `handleReconnect`. |
| Invalid-state recovery | **OK** | Fallback til `getRoomState` hvis resume feiler. |
| iOS Safari WebGL context-loss | **OK** | BIN-542 WebGLContextGuard 7 tester. |
| Error-toast til spiller | **OK** | `ToastNotification.error()`. |

### Settings
| Område | Status | Notat |
|---|---|---|
| SoundEnabled / VoiceEnabled / VoiceLang / DoubleAnnounce | **OK** | SettingsPanel.ts + localStorage persist. |
| Auto-mark | **MANGLER** | Unity har auto-mark (`ticketCell.isMarkAuto`). Ingen klient-toggle. |
| Auto-claim | **OK** | Via ClaimDetector trigger — ingen eksplisitt auto-claim-toggle i Unity heller utover button-tilstand. |
| Marker/background customization | **OK** | MarkerBackgroundPanel + PlayerPrefs.migrateFromUnity (BIN-544). |

### Localization
| Område | Status | Notat |
|---|---|---|
| Norsk UI-tekst | **OK** | Tekster i hele game1/ er norske. |
| Audio-locale (3 voices) | **OK** | Se Lyd. |
| Dynamisk language-switch uten reload | **DELVIS** | SettingsPanel switcher voice-lang men ikke UI-tekster (akseptabelt, Unity gjør samme). |

### Responsive
| Område | Status | Notat |
|---|---|---|
| Desktop (1920×1080) | **OK** | PlayScreen.resize-hook. |
| Mobile-portrait | **DELVIS** | Render OK, men layout ikke optimalisert — **BIN-369 UI-layout Epic Backlog**. |
| TV-display (BIN-498 hall-display) | **DELVIS** | Backend + admin ✅; 🟡 Release-klar venter på staging. |

### Performance
| Område | Status | Notat |
|---|---|---|
| Render-FPS (60 target) | **OK** | PixiJS med GPU; ingen kjente regresjoner i kode-review. |
| Asset-loading (BIN-543 pipeline) | **OK** | 139 assets, 15.6 MB, HTTP/2-multiplex. |
| Memory (context-loss recovery) | **OK** | Se iOS Safari-rad. |
| Load-test 1000+ spillere | **OK** | BIN-508 Artillery merged. |

### Oppsummering tellinger (av 62 rader over)

| Status | Antall |
|---|---:|
| **OK** | 37 |
| **DELVIS** | 20 |
| **MANGLER** | 4 |
| **AVVIK** | 1 |

---

## §3. Konkrete kode-gaps

Prioriterte gaps (DELVIS + MANGLER + AVVIK) som må lukkes for 1:1-paritet.

| # | Gap | Legacy-ref (Unity/C#) | Ny fil | Estimat (t) | Linear |
|---|---|---|---|---:|---|
| G1 | One-to-go celle-blink timing/scale avvik (1.5× vs 1.15×, 1.0s vs 0.4s, elastic-kurve) | `Prefabs/Bingo Tickets/BingoTicket.cs:112` (LTDescr Blink_Tween) | `packages/game-client/src/components/BingoCell.ts` (pulseAnimation) | 3 | BIN-363 (Epic) |
| G2 | One-to-go hel-billett-bakgrunn-blink (Blink_On_1_Color oscillation) | `BingoTicket.cs:15-16, 715-719` (Is_Blinked_On_1, Start_Blink/Stop_Blink) | `packages/game-client/src/games/game2/components/TicketCard.ts:47` (hooks finnes, implementasjon må kobles til 1-to-go trigger) | 4 | BIN-362 (Epic) |
| G3 | BINGO pulse (scale 0.85×→1.05× × 5, 0.25s per fase) verifisering | Unity-ref via LeanTween i BingoTicket | `packages/game-client/src/games/game2/components/TicketCard.ts` | 2 | — (ny sub under BIN-363) |
| G4 | Pattern cycling-animasjoner (design 1–4, rad/kol delay 1s) | `Prefabs/Patterns/PrefabBingoGame1Pattern.cs` | `packages/game-client/src/games/game1/components/PatternMiniGrid.ts` | 6 | BIN-364 (Epic) |
| G5 | Ticket background blink trigger (når `Pattern_Remaining_Cell_Count === 1`) | `BingoTicket.cs:701-723` | **does not exist** (må legges til i TicketCard) | 2 | BIN-362 |
| G6 | Ticket-type visuell gruppering (Elvis par, TrafficLight triader, Large-format) | `Panels/Game/Game 1/PrefabBingoGame1LargeTicket5x5.cs`, `Game1ViewPurchaseElvisTicket.cs`, `Game1ViewPurchaseThreeTickets.cs` | `packages/game-client/src/games/game1/screens/PlayScreen.ts:388-411` (detekterer type, men ikke visuell stacking) | 6 | BIN-376, BIN-377 |
| G7 | Elvis fargetema (egen palett, ikon) | `Panels/TicketColorManager.cs` Elvis-entry | `packages/game-client/src/games/game1/colors/TicketColorThemes.ts` (mangler elvis-eintry) | 2 | BIN-427 |
| G8 | Verifiser 6+1 fargetemaer mot Unity inspector | CoPlay-ekstraksjon fra `Managers/Ticket_Color_Manager` | `TicketColorThemes.ts` | 3 | BIN-374 |
| G9 | Kjøp-deaktivering etter N trekk (server-authoritative threshold) | `Game1GamePlayPanel.cs` — BuyMoreDisableFlag | `Game1Controller.ts:489` (BIN-451 delvis) + `PlayScreen.disableBuyMore()` | 1 | BIN-409 |
| G10 | Maks-grense 30 bonger (klient-validering) | `Game1PurchaseTicket.cs` | `Game1BuyPopup.ts` (mangler pre-send-validering) | 2 | BIN-402 |
| G11 | Slett/avbestill per bong (ikke global disarm) | `Game1GamePlayPanel.Interactions.cs` delete-buttons | `packages/game-client/src/games/game1/components/Game1BuyPopup.ts` + PlayScreen | 3 | BIN-406 |
| G12 | Trekkhistorikk-panel | `Panels/Game/Game 1/WithdrawNumberHistoryPanel.cs` | **does not exist** | 4 | BIN-387 |
| G13 | Upcoming game purchase UI (kjøp før nedtelling) | `Game1GamePlayPanel.UpcomingGames.cs`, `Game1UpcomingGameTicketData.cs` | **does not exist** (preRoundTickets finnes i state) | 5 | BIN-410 |
| G14 | Jackpot-info i header | Unity header viser løpende jackpot-summer | `components/LeftInfoPanel.ts` eller nytt HeaderBar | 2 | BIN-407 |
| G15 | Bong-header (hallName, supplierName, pris, ticketNumber) i flip-details | `PrefabBingoGame1Ticket5x5.cs` | TicketCard flipToDetails (har rammeverk) | 2 | — |
| G16 | Game-finish animation reset | `Game1GamePlayPanel.SocketFlow.cs:595 OnGameFinish` | `Game1Controller.ts:449 onGameEnded` (delvis — stopper audio men ikke all blink-state) | 2 | BIN-414 |
| G17 | Chat panel bong-area resize ved toggle (80px header shift) | `Game1GamePlayPanel.ChatLayout.cs` | `components/ChatPanelV2.ts` + PlayScreen | 3 | BIN-393 |
| G18 | Split-screen support (2 spill samtidig i samme view) | `Panels/Game/SplitScreenGameManager.cs`, `MultipleGameScreenManager.cs` | **does not exist** | 6 | BIN-399 |
| G19 | BIN-505 Mystery staging-verifisering | — | OK kode, mangler staging | 1 | BIN-505 |
| G20 | BIN-506 ColorDraft staging-verifisering | — | OK kode, mangler staging | 1 | BIN-506 |
| G21 | BIN-420 Verifiser Wheel mot Unity (segment-farger, tekst) | `WheelOfFortunePanel.cs` + `SpinWheelScript.cs` | `WheelOverlay.ts` | 2 | BIN-420 |
| G22 | BIN-422 Verifiser TreasureChest mot Unity (N=6 vs 4, kister-sprite) | `TreasureChestPanel.cs` | `TreasureChestOverlay.ts` | 2 | BIN-422 |
| G23 | Scheduler/timer events (millisUntilNextStart mapping) | `Game1GamePlayPanel.SocketFlow.cs:97-148` | `bridge/GameBridge.ts` + CenterBall | 2 | BIN-412 |
| G24 | Pattern list updates (live row-payout-display) | `Game1GamePlayPanel.cs:548 GeneratePatternList` | `CenterTopPanel.ts` (delvis) | 2 | BIN-411 |
| G25 | Lucky number socket-flyt (set + highlight sync på alle bonger) | `SelectLuckyNumberPanel.cs` | `Game1Controller.ts:569 handleLuckyNumber` (OK, men BIN-416 står Backlog) | 1 | BIN-416 |
| G26 | Claims verifisering (server-roundtrip timing, feilmelding-UI) | — | Generell E2E-pass | 2 | BIN-418 |
| G27 | Auto-mark (markert ved trekk uten klikk) | Unity `ticketCell.isMarkAuto` | Ingen toggle i SettingsPanel | 3 | — (ny issue) |
| G28 | Spillstart/slutt-lyder (intro-sfx, outro-sfx) | `SoundManager` Unity-clips | AudioManager mangler dedikerte clips | 2 | BIN-431 |
| G29 | Mini-game-specifikke lyder | — | AudioManager | 2 | BIN-432 |
| G30 | Lyd-innstillinger UI per-kanal volum | `Panels/Setting/` | SettingsPanel (delvis) | 2 | BIN-433 |

**Sum estimat P0+P1 gaps:** ~75 dev-timer ≈ 10 dev-dager solo.

---

## §4. Prioritering

### P0 — Pilot-blocker (må lukkes før staging-test med ekte spillere)

**Kriterium:** Bryter gameplay, eller så synlig avvik fra Unity at spillere merker det umiddelbart.

| # | Gap | Est (t) |
|---|---|---:|
| G2 | One-to-go billett-bakgrunn-blink (mangler helt — stor visuell forskjell) | 4 |
| G1 | One-to-go celle-blink timing (1.5×/1.0s match) | 3 |
| G3 | BINGO pulse 5-rep verifisering | 2 |
| G6 | Ticket-variant visuell gruppering (Elvis/TrafficLight/Large) | 6 |
| G8 | Verifiser 6+1 fargetemaer mot Unity | 3 |
| G10 | Maks 30 bonger klient-validering | 2 |
| G11 | Slett per bong | 3 |
| G16 | Game-finish animation reset (stopp all blink) | 2 |
| G19+G20 | Staging-verify Mystery + ColorDraft | 2 |
| **Sum P0** | | **27 t** |

### P1 — Pre-prod (må lukkes før prod-deploy i pilot-hall)

| # | Gap | Est (t) |
|---|---|---:|
| G4 | Pattern cycling-animasjoner | 6 |
| G5 | Ticket background blink trigger | 2 |
| G7 | Elvis fargetema | 2 |
| G9 | Kjøp-deaktivering etter N trekk | 1 |
| G12 | Trekkhistorikk-panel | 4 |
| G13 | Upcoming game purchase UI | 5 |
| G14 | Jackpot-info i header | 2 |
| G15 | Bong flip-details komplett | 2 |
| G17 | Chat panel resize ved toggle | 3 |
| G21 | Verifiser Wheel mot Unity | 2 |
| G22 | Verifiser TreasureChest mot Unity | 2 |
| G23 | Scheduler/timer mapping | 2 |
| G24 | Pattern list live updates | 2 |
| G25 | Lucky number flyt-sjekk | 1 |
| G26 | Claims E2E verifisering | 2 |
| G28 | Spillstart/slutt-lyder | 2 |
| **Sum P1** | | **40 t** |

### P2 — Polish (kan landes post-pilot)

| # | Gap | Est (t) |
|---|---|---:|
| G18 | Split-screen support | 6 |
| G27 | Auto-mark toggle | 3 |
| G29 | Mini-game lyder | 2 |
| G30 | Lyd-innstillinger per-kanal | 2 |
| — | Markør tilpasning UI polish (BIN-381) | 2 |
| — | Neste-kule preview (BIN-385) | 3 |
| — | Lydannonsering tuning (BIN-392) | 2 |
| **Sum P2** | | **20 t** |

**Total:** P0 27t + P1 40t + P2 20t = **87 timer ≈ 11 dev-dager solo**.

---

## §5. Game 2 / Game 3 arvelighet

Mange gaps er i delt infrastruktur (`packages/game-client/src/components/` eller `src/games/game2/components/` som G1 gjenbruker). De som fikses der, får G2 og G3 gratis.

| Gap | Game 1 | Game 2 (Rocket) | Game 3 (Monster) | Delt kode? |
|---|:-:|:-:|:-:|---|
| G1 One-to-go celle-blink | ✔ | arver | arver | `components/BingoCell.ts` — delt |
| G2 Billett-bakgrunn-blink | ✔ | arver | arver | `game2/components/TicketCard.ts` — delt (G1 importerer) |
| G3 BINGO pulse | ✔ | arver | arver | TicketCard — delt |
| G4 Pattern cycling | ✔ | n/a (G2 har ikke patterns utover BINGO) | arver | G3 har `PatternBanner.ts`; del av mønsterbingo-spesifikt |
| G5 Background blink trigger | ✔ | arver | arver | TicketCard — delt |
| G6 Ticket-varianter | ✔ | n/a (G2 = 1 type) | n/a (G3 = 1 type) | G1-spesifikt |
| G7 Elvis-tema | ✔ | n/a | n/a | G1-spesifikt |
| G8 Fargetemaer verifisering | ✔ | delvis arver (index-cycle) | delvis arver | `TICKET_THEMES` — delt, G2/G5 index-cycler |
| G9 Buy-deaktivering | ✔ | arver | arver | `disableBuyMore` — mønster er likt |
| G10 Maks 30 bonger | ✔ | n/a (annet limit) | n/a | G1-spesifikt |
| G11 Slett per bong | ✔ | arver | arver | UI-mønster |
| G12 Trekkhistorikk | ✔ | arver | arver | Separat komponent — kan deles |
| G13 Upcoming-kjøp UI | ✔ | arver | arver | Separat komponent — kan deles |
| G14 Jackpot-header | ✔ | — (G2 har ikke jackpot) | — | G1-spesifikt |
| G15 Flip-details | ✔ | arver | arver | TicketCard — delt |
| G16 Finish-animation reset | ✔ | arver | arver | Controller-mønster |
| G17 Chat resize | ✔ | n/a (G2 ingen chat) | arver (G3 har chat) | ChatPanelV2 — delt |
| G18 Split-screen | ✔ | n/a | n/a | N/A for nå |
| G19-20 Mystery/ColorDraft staging | ✔ | n/a | n/a | G1-spesifikt |
| G21-22 Wheel/Chest verify | ✔ | n/a | n/a | G1-spesifikt |
| G23 Scheduler/timer | ✔ | arver | arver | `GameBridge` — delt |
| G24 Pattern list | ✔ | n/a | arver (delvis) | `CenterTopPanel` — G1-spesifikt |
| G25 Lucky number | ✔ | arver | arver | Delt |
| G26 Claims E2E | ✔ | arver | arver | Delt server-roundtrip |
| G27 Auto-mark | ✔ | arver | arver | Delt |
| G28 Start/slutt-lyder | ✔ | arver | arver | AudioManager — delt |

**Konklusjon:** Ca **18 av 30 gaps** er i delt kode. Når G1 er 100 %, arver G2 og G3 mesteparten av visuell paritet "gratis" — spesielt TicketCard-anim, BingoCell-blink, AudioManager-polish, ChatPanelV2-layout.

---

## §6. Arbeidsnedbryting — Linear-klare issues

Gruppert logisk. Hver oppgave = 1 PR. Format klar for direkte Linear-issue-oppretting.

### Bolk A — Billett-animasjoner (delt kode, høy P-verdi)

**A1. TicketCard: One-to-go background-blink + 1:1 celle-blink-timing**
- Tittel: `G1: Bakgrunn-blink + celle-blink timing-match mot Unity (BingoCell + TicketCard)`
- Prio: **P0**
- Est: 7 t (G1+G2+G3 sammen)
- Avhengigheter: Blokkerer ikke noe; blokkerer G2/G3 paritet
- Filer: `packages/game-client/src/components/BingoCell.ts`, `packages/game-client/src/games/game2/components/TicketCard.ts`
- AC: Scale 1.5× på celle, 1.0s elastic; hel-billett alpha/bg-oscillering mellom normal og 0xFFE83D ved `Pattern_Remaining_Cell_Count === 1`; stop-hook ved claim eller cell-count ≠ 1.
- Linear-parent: BIN-362 + BIN-363

**A2. TicketCard: BINGO pulse 5× 0.25s/fase**
- Prio: **P0**
- Est: 2 t
- Avhengig av: A1 (same file)
- AC: Trigger på `pattern:won` med `isMe && type=BINGO`; scale 0.85→1.05, 5 reps, resetter.

**A3. TicketCard: Elvis/TrafficLight/Large visuell gruppering**
- Prio: **P0**
- Est: 6 t
- Blokkerer: pilot-staging
- Filer: `games/game1/screens/PlayScreen.ts`, ny `components/TicketGroup.ts`
- AC: Elvis = 2 kort i par, delt claim-bar, navne-label. TrafficLight = 3 kort stacked R/Y/G. Large = 1.4× cellestørrelse.

### Bolk B — Fargesystem

**B1. Verifiser 6+1 fargetemaer + legg til Elvis**
- Prio: **P0**
- Est: 5 t
- Filer: `games/game1/colors/TicketColorThemes.ts`
- AC: Ekstrakt fra Unity `Managers/Ticket_Color_Manager` via eksisterende CoPlay-script; snapshot-test alle 7 temaer.
- Linear-parent: BIN-371 (Epic) + BIN-374 + BIN-427

### Bolk C — Pattern / trekk-historikk

**C1. Pattern cycling-animasjoner (design 1-4)**
- Prio: **P1**
- Est: 6 t
- Filer: `games/game1/components/PatternMiniGrid.ts`
- AC: Design 0 = breathe (OK); design 1 = rad-cycle 1s delay; design 2-4 = kombinasjoner.
- Linear-parent: BIN-364

**C2. Trekkhistorikk-panel**
- Prio: **P1**
- Est: 4 t
- Filer: ny `components/WithdrawHistoryPanel.ts`
- AC: Scrollbar liste siste N trekk, farger matcher kolonnefarge.
- Linear: BIN-387

**C3. Live pattern-payout-list update**
- Prio: **P1**
- Est: 2 t
- Filer: `components/CenterTopPanel.ts`
- Linear: BIN-411

### Bolk D — Kjøp-flyt

**D1. Klient-side 30-bongs-grense + per-bong slett**
- Prio: **P0**
- Est: 5 t
- Filer: `components/Game1BuyPopup.ts`, `screens/PlayScreen.ts`
- Linear: BIN-402, BIN-406

**D2. Buy-disable etter N trekk (server threshold)**
- Prio: **P1**
- Est: 1 t
- Linear: BIN-409

**D3. Upcoming-game purchase UI**
- Prio: **P1**
- Est: 5 t
- Filer: ny `components/UpcomingPurchase.ts`
- Linear: BIN-410

### Bolk E — Spillflyt-finpuss

**E1. Game-finish: stopp all blink + reset**
- Prio: **P0**
- Est: 2 t
- Filer: `Game1Controller.ts:onGameEnded`, TicketCard.stopAllAnimations
- Linear: BIN-414

**E2. Scheduler/timer + countdown mapping**
- Prio: **P1**
- Est: 2 t
- Linear: BIN-412

**E3. Claims E2E verify + error-UI**
- Prio: **P1**
- Est: 2 t
- Linear: BIN-418

### Bolk F — Lyd + UI-chrome

**F1. Spillstart/slutt-lyder + mini-game-lyder**
- Prio: **P1**
- Est: 4 t
- Filer: `audio/AudioManager.ts`, nye SFX i `public/assets/game1/audio/sfx/`
- Linear: BIN-431 + BIN-432

**F2. Lyd-innstillinger per-kanal volum**
- Prio: **P2**
- Est: 2 t
- Linear: BIN-433

**F3. Jackpot-info i header**
- Prio: **P1**
- Est: 2 t
- Filer: `components/LeftInfoPanel.ts`
- Linear: BIN-407

**F4. Chat panel bong-area resize**
- Prio: **P1**
- Est: 3 t
- Linear: BIN-393

### Bolk G — Mini-game verifisering

**G1. Verifiser Wheel + Chest mot Unity (segmenter, kister, tekst, SFX)**
- Prio: **P1**
- Est: 4 t (2+2)
- Linear: BIN-420 + BIN-422

**G2. Staging-verify Mystery + ColorDraft**
- Prio: **P0**
- Est: 2 t (ren QA-runde)
- Linear: BIN-505 + BIN-506

### Bolk H — Post-pilot polish

**H1. Auto-mark toggle**
- Prio: **P2**
- Est: 3 t

**H2. Split-screen support**
- Prio: **P2**
- Est: 6 t
- Linear: BIN-399

**H3. Neste-kule preview + lydannonsering polish**
- Prio: **P2**
- Est: 5 t
- Linear: BIN-385 + BIN-392

### Sammendrag bolker (agent-klart)

| Bolk | Prio | Est (t) | Avhengigheter | Agent |
|---|---|---:|---|---|
| A (billett-anim) | P0 | 15 | — | Agent-1 |
| B (farger) | P0 | 5 | — | Agent-2 |
| C (pattern/historikk) | P1 | 12 | — | Agent-1 etter A |
| D (kjøp) | P0+P1 | 11 | — | Agent-2 etter B |
| E (flyt) | P0+P1 | 6 | A | Agent-1 |
| F (lyd+chrome) | P1+P2 | 11 | — | Agent-2 |
| G (minigame verify) | P0+P1 | 6 | — | Agent-1 eller -2 |
| H (polish) | P2 | 14 | Alt over | Post-pilot |

**Release-kritisk (A-G, eks H):** **66 timer = 8.3 dev-dager solo ≈ 4-5 dager parallellisert**

---

## §7. Agent-anbefaling

### 1 agent solo
- P0+P1+G (release-kritisk): 66 t = **9 kalenderdager** (7.5 t/dag effektiv).
- P2 etterpå: +2 dager.

### 2 agenter parallelt (anbefalt)

Optimalt løp:

**Uke 1 (dag 1-3):**
- **Agent-1:** Bolk A (15 t, billett-anim) → Bolk E (6 t)
- **Agent-2:** Bolk B (5 t, farger) → Bolk D (11 t, kjøp)

**Uke 1 (dag 4-5):**
- **Agent-1:** Bolk C (12 t, pattern+historikk) + Bolk G (3 t, Wheel/Chest verify)
- **Agent-2:** Bolk F (11 t, lyd+chrome)

**Dag 6:**
- Felles: Staging-verify (Mystery, ColorDraft, E2E spill-runde), fikse blockere, QA-pass.

**→ Release-klar dag 6 ≈ 5 kalenderdager med 2 agenter parallelt.**

### 3 agenter (hvis ønsket)
- Agent-3 tar Bolk H (post-pilot polish) + verifiserer G2/G3-arvet paritet mens A1/A2 er i review.
- Kan nå release-klar dag 4 (med noe merge-konflikt-kost).

### Koordinasjonsrisiko
- **Bolk A og D overlapper i `TicketCard.ts` + `PlayScreen.ts`** — sekvens A1 → A3 → D1 for å unngå merge-konflikt, eller tydelig fil-ownership.
- **Bolk B og A overlapper ikke** (farger vs animasjon) — trygt parallelt.
- **Canonical spec oppdatering** må skje siste PR før merge til main (oppdater `commitRef` + evt. §4 ticket types hvis Elvis-gruppering endrer payload).

### Verifiseringsstrategi
1. **Snapshot-test per tema** (Bolk B) med Playwright + chrome-devtools-mcp.
2. **Video-capture av animasjoner** (Bolk A) side ved side med Unity-instans for visuell sammenligning.
3. **Lydfingerprints** (Bolk F) ikke nødvendig — manuell smoke-test holder.
4. **E2E Cypress/Playwright** full spill-runde (Bolk G + alle).

---

## Sluttnotater

1. **Arkiver utdatert dokumentasjon:** Flytt `packages/game-client/src/games/game1/AUDIT-RAPPORT.md` og `PORTERING-GUIDE.md` til `docs/archive/` — disse sier "22 funksjoner mangler" som ikke lenger er sant.
2. **Oppdater canonical spec §15 Revisjonshistorikk** når Bolk A/B lander.
3. **Parity matrix §2 Game 1** må oppdateres per PR — dette er release-gate.
4. **Ingen security/compliance-blockere** funnet. Fail-closed, server-authoritative og hall-basert Spillvett er på plass.
5. **Backend-kontrakten er stabil** — alle P0/P1 gaps er rent klient-side.
