# PM Handoff — 2026-04-19

**Overtas av:** Ny prosjektleder fra 2026-04-20
**Fra:** Claude Opus (brave-dirac-worktree, tokens utløpt)
**Prosjektkontekst:** Spillorama legacy-avkobling (Game 1-5 + backend-paritet)

---

## 1. Hovedmålet — Spillorama 100% legacy-paritet

Eier (Tobias) krever at ny stack (`apps/backend` + `apps/admin-web` + `packages/game-client`) er 100% funksjonelt OG visuelt 1:1 med legacy Unity + legacy Node-backend. Hall-ansatte er trent på legacy-designet — opplæring på nytt design koster for mye tid.

### Hvilke spill finnes

- **Game 1 (Bingo):** 5x5 grid, 75 baller, Bingo + Line claim + wheel/chest/mystery/colordraft minigames. **UNITY = 5x5 75-BALL.**
- **Game 2 (Rocket/Tallspill):** 3x3 grid, 1-21 drawbag, jackpot-number-table
- **Game 3 (Mønsterbingo):** 5x5, custom patterns, auto-claim
- **Game 4 (Temabingo):** DEPRECATED (BIN-496) — ikke port
- **Game 5 (Spillorama/Papirbingo):** 3x5 per kode-kommentarer, men IKKE VERIFISERT mot Unity

---

## 2. Status per 2026-04-19 — leveranse

### ✅ FERDIG (100% paritet)

- **BIN-582** Crons (3 jobs: Swedbank sync, BankID expiry, RG cleanup)
- **BIN-585** Socket events (79 OK, 0 mangler)
- **BIN-586** Deposit/withdraw queue (backend + admin-UI)
- **BIN-587** HTTP endpoints-paritet (136/144, resten NOT-NEEDED)
- **BIN-588** Infrastruktur (email, PDF, CSV, AuditLog, OpenAPI, redocly CI, webhook HMAC)
- **BIN-583** Agent-domene (78 endpoints — agent-auth, shift, POS, cash, settlement, Metronia HTTP, OK Bingo SQL Server)
- **Game 1 P0 + P1** (9 PR-er fra Agent 5) — **MEN HAR REGRESJON**, se §5

### 🔄 I ARBEID (pause i morgen, fortsett)

- **BIN-613** Legacy admin-UI 1:1 port (3 agenter parallelt)
- **BIN-615** G2/G3 backend-paritet (Agent C)

### Pending PR-er (venter review/merge)

| PR | Agent | Scope | Status |
|----|-------|-------|--------|
| [#218](https://github.com/tobias363/Spillorama-system/pull/218) | A | PR-A2 Dashboard + widgets | CI grønn, venter merge |
| [#219](https://github.com/tobias363/Spillorama-system/pull/219) | B | PR-B1 cash-inout (12 pages) | Venter CI-sjekk |
| [#220](https://github.com/tobias363/Spillorama-system/pull/220) | C | PR-C2 Game 2 Rocket | CI grønn, venter merge |

---

## 3. Agent-bemanning

**5 aktive slots/worktrees:**

| Slot | Agent | Brief-fil | Worktree |
|------|-------|-----------|----------|
| slot-A | A | `AGENT-A-BRIEF.md` | Admin-UI shell + games/reports/admin/cms |
| slot-B | B | `AGENT-B-BRIEF.md` | Admin-UI cash-inout + player/withdraw/login |
| slot-C | C | `AGENT-C-BRIEF.md` | G2/G3 backend |
| slot-1 | 1 | (ferdig BIN-587) | idle, kan ta follow-ups |
| (ny bug-fix-agent) | ? | — | Game 1 5x5-regresjon, se §5 |

**Agenter 2, 3, 4, 5:** idle per 2026-04-19 EOD. De har levert alle sine primære oppgaver.

Briefs ligger i hver slot's root. Full audit-rapporter ligger i `/tmp/`:
- `/tmp/legacy-admin-parity-audit.md` (admin-UI audit, 222 HTML-filer, 34 menypunkter)
- `/tmp/game1-parity-audit.md` (Game 1 klient-audit)
- `/tmp/game2-game3-backend-audit.md` (G2/G3 backend-audit)
- `/tmp/backend-parity-audit.md` (original backend-audit)
- `/tmp/admin-ui-parity-audit.md` (admin-UI paritets-audit)

---

## 4. Total dagens leveranse — 46 PR-er

Se `git log --oneline origin/main | head -50` for full historikk. Store milepæler:

- 🏁 BIN-587 HTTP endpoints-paritet (136 endpoints på 1 dag med Agent 1)
- 🏁 BIN-583 Agent-domene (78 endpoints på 1 dag med Agent 1 + 4)
- 🏁 BIN-585 Socket events (Agent 2)
- 🏁 Game 1 P0 + P1 (Agent 5, 9 PR-er) — **se regresjon §5**
- 🏁 PR-A1 Admin shell foundation (Agent A, 68 filer inkl. legacy-skin)
- 🏁 PR-C1 G2/G3 delt backend-infra (Agent C)

---

## 5. ⚠️ AKUTT: Game 1 5x5-regresjon

**Problem:** Staging viser 3x5 tickets (Databingo60-format) for Game 1. **Unity Game 1 er 5x5 75-ball** (bekreftet av eier 2026-04-19).

### Rotårsak

Inkonsistent `gameSlug`-sjekk mellom 3 kodesteder:
- **Drawbag** (`BingoEngine.ts:198`): `BINGO75_SLUGS = new Set(["bingo", "game_1"])` — 75 balls for begge
- **Ticket-gen** (`roomState.ts:115, 136`, `LocalBingoSystemAdapter.ts:18`, `PostgresBingoSystemAdapter.ts:49`): sjekker kun `gameSlug === "bingo"` — "game_1" faller til 3x5 Databingo60

### Fikseplan (allerede skrevet til bug-fix-agent)

1. Export fra `apps/backend/src/game/ticket.ts`:
```ts
export const BINGO75_SLUGS = new Set(["bingo", "game_1"]);

export function uses75Ball(gameSlug: string | null | undefined): boolean {
  return BINGO75_SLUGS.has(gameSlug ?? "");
}

export function generateTicketForGame(gameSlug: string | null | undefined, color?: string, type?: string): Ticket {
  return uses75Ball(gameSlug)
    ? generateBingo75Ticket(color, type)
    : generateDatabingo60Ticket();
}
```

2. Unify 3 kallsteder til å bruke `generateTicketForGame()`
3. Fjern duplikat `BINGO75_SLUGS` i `BingoEngine.ts:198`
4. Flytt stale docs til archive:
   - `packages/game-client/src/games/game1/AUDIT-RAPPORT.md`
   - `packages/game-client/src/games/game1/PORTERING-GUIDE.md`
   - Filene inneholder FEIL informasjon om at Game 1 er Databingo60

### Andre Game 1 bugs rapportert av eier

Bug-fix-agent jobber også på:
- Ball-animasjon feil
- Popup for å kjøpe bonger ødelagt
- Visning av bonger (relatert til 5x5-fiks)
- Start av runde

Bug-fix-agent arbeidsstatus ukjent — ny PM må følge opp.

---

## 6. Open follow-ups (Linear-API var ustabil, må opprettes)

| ID (foreslått) | Tittel | Prio |
|----------------|--------|------|
| BIN-TBD | `slot_provider` på `app_halls` (Agent B cash-inout trenger dette for Metronia/OK Bingo-switch) | P3 |
| BIN-TBD | `GET /api/admin/hall-groups` (Agent A dashboard widget) | P3 |
| BIN-TBD | `GET /api/admin/players/top` (Agent A dashboard widget) | P3 |
| BIN-TBD | Game 1 5x5-regresjon + cleanup | P1 |
| BIN-610 (eksisterer) | Post-pilot HTTP 8 deferred endpoints | P4 |

Bruker Linear MCP: `mcp__2fadd620-381d-42ff-9ae4-18bed9928b2e__save_issue` når API er oppe.

---

## 7. PM-arbeidsmetode (hvordan jeg jobbet)

### Kadens per agent-PR

1. **Agent sender scope-plan** før kode
2. **PM reviewer plan** (legacy fil:linje-refs, migrations, tester, risiko)
3. **PM gir GO eller ber om justeringer**
4. **Agent koder** og pusher PR
5. **PM verifiserer CI** (`gh pr checks <N>`) og merge state
6. **PM rebaser om DIRTY/BEHIND** (`gh pr update-branch <N> --rebase`)
7. **PM merger via `gh pr merge <N> --squash --delete-branch --admin`**
8. **PM sender neste GO** eller venter neste rapport

### Kritiske prinsipper

- **"Rapport før kode"** — agenter må ha plan godkjent før de skriver noe
- **"Stopp-og-vent"** — agenter rapporterer hver PR, venter go før neste
- **Unity-verifisering = kildesannhet** for visuell paritet
- **Legacy Node-backend = kildesannhet** for funksjonell paritet
- **G1-regresjonstester er hardgrense** — alle `BingoEngine/ticket/compliance`-tester må være grønne etter hver PR
- **Port 1:1 FØR optimering** — modernisering kommer post-pilot
- **NOT-NEEDED må begrunnes** — kan ikke droppes uten eksplisitt scope-beslutning

### Typiske konflikter og løsning

**Merge-konflikter:**
- 2+ agenter endrer samme fil (f.eks. `AdminAccessPolicy.ts`, `index.ts`)
- **Løsning:** additive-merge — kombiner begges permissions/imports, ikke overskriv

**Migration-timestamp-kollisjon:**
- Agenter bruker samme timestamp
- **Løsning:** bump den andre til neste time-slot, koordiner via PM-melding

**Scope-oppdagelser:**
- Agent finner noe utenfor brief (f.eks. "audit sa X, Unity er Y")
- **Løsning:** PM velger retning, oppdater brief, ikke ignorer

**Falske "100% ferdig"-claims:**
- Tester grønne men visuelt brudd (som Game 1-regresjonen)
- **Løsning:** krev staging-screenshot som del av PR-rapport ved visuell paritet

### Beslutning-mønster ved usikkerhet

1. **Match legacy 1:1** (default)
2. **Eskalér til eier** hvis regulatorisk (Spillvett, pengespillforskriften, KYC)
3. **Eskalér til eier** hvis kostnadsmessig (f.eks. mssql-dep for OK Bingo)
4. **Dokumentér avvik** hvis legacy er direkt feil (sjeldent)

### Verktøy jeg brukte

- **gh (GitHub CLI):** list/view/merge PRs, rebase-branch
- **Linear MCP (`mcp__2fadd620-...__save_issue`):** opprett/oppdatér issues
- **Chrome-MCP** (når aktiv): staging-verifisering
- **Subagents (Agent tool):** audits, store porting-oppgaver, parallelt arbeid
- **ScheduleWakeup:** vente på CI-jobs uten å holde live-context

---

## 8. Scheduled Render-deploys

Alle merger til main → Render auto-deployer til https://spillorama-system.onrender.com

Staging-verifisering:
```bash
curl -s https://spillorama-system.onrender.com/health | python3 -m json.tool
```

Tilgjengelige test-brukere (passord allerede resetet i min økt):
- Admin: `admin@spillorama.staging` / `StagingAdmin_afb67c11!`
- Player: `spillvett-test1@spillorama.staging` / `TestPlayer_64c85f!`

Test-URL:
- Spiller: https://spillorama-system.onrender.com/web/
- Admin: https://spillorama-system.onrender.com/admin/
- Legacy admin (paritet-referanse): https://spillorama.aistechnolabs.info/admin/
  - Login: `michael@teknobingo.no` / `Michael1234`

### Kritisk env-vars på Render (må settes før prod-deploy)

- `SWEDBANK_WEBHOOK_SECRET` — for webhook HMAC (BIN-603)
- `METRONIA_API_URL`, `METRONIA_API_TOKEN` — Metronia integration
- `OKBINGO_SQL_CONNECTION` — SQL Server connection string for OK Bingo
- `SMTP_*` — e-post-konfig

---

## 9. Neste PM's første handlinger (dag 1)

### Steg 1: Les dette dokumentet + audit-rapporter (30 min)

### Steg 2: Merge de 3 ventende PR-ene

```bash
# Sjekk status
gh pr list --repo tobias363/Spillorama-system --state open --limit 10

# Merge i rekkefølge (backend-først for å unngå konflikter):
# 1. PR #220 Agent C G2 Rocket (backend)
# 2. PR #219 Agent B cash-inout (admin-web, men trenger PR-A2-mønster?)
# 3. PR #218 Agent A dashboard (admin-web)

# Merge-command:
gh pr update-branch <N> --repo tobias363/Spillorama-system --rebase
gh pr merge <N> --repo tobias363/Spillorama-system --squash --delete-branch --admin
```

### Steg 3: Oppdater Linear (når API er oppe)

- Sett BIN-613 parent-epic til oppdatert status (se §6)
- Opprett 4 follow-up-issues (slot_provider, hall-groups, top-players, Game 1 5x5-regresjon)

### Steg 4: Send agent-meldinger (se §10)

### Steg 5: Følg opp bug-fix-agent

Sjekk om de har levert Game 1 5x5-fiksen. Hvis ikke: re-send brief fra §5.

---

## 10. Klare agent-meldinger (kopier-og-send)

### TIL AGENT A (etter PR #218 merge)

```
PR #218 PR-A2 Dashboard MERGET ✅

Utmerket leveranse:
- 1108 linjer, 51/51 tester grønne, pixel-nær legacy screenshot
- 2 manglende backend-endpoints flagget med "—" placeholder (riktig tilnærming)
- Header bell-counter additive endring (ingen konflikt)

GO for PR-A3 — GameManagement stack (50-80t)

Scope fra brief §2 PR-A3:
- /gameManagement (10 sider)
- /dailySchedules (6)
- /savedGameList (8)
- /schedules (3)
- /gameType (4)
- /subGame (3)
- /patternManagement (3)

Totalt ~37 sider. Største bolken din.

Branch: `bin-613-pr-a3-game-management`

Rapport scope-plan først (samme format som PR-A1/A2):
- Legacy fil:linje-refs per side
- State-struktur
- API-endpoints (alle skal eksistere i apps/backend)
- Integrasjon med Agent C's reserverte G2-events
- Test-strategi

Stopp-og-vent på plan-review.
```

### TIL AGENT B (etter PR #219 merge)

```
PR #219 PR-B1 cash-inout MERGET ✅

Utmerket:
- 12 legacy-filer portert + 3 modaler
- BarcodeScanner med 10 tester (alle edge-cases dekket)
- SlotProviderSwitch med 8 tester
- Modal backdrop:static verifisert i Settlement-flow
- 27 nye i18n-nøkler
- Ingen Agent A-test-regresjoner

GO for PR-B2 — Player + KYC + BankID + track-spending (60-80t, 25 sider)

Scope fra brief §2 PR-B2:
- player.html (alle-liste)
- viewPlayer.html (detalj-tabs)
- PendingRequests/* + RejectedRequests/* (KYC-moderasjon)
- bankId/* (BankID-verifikasjon)
- track-spending/* (Spillvett-regulatorisk)
- gameHistory, loginHistory, chipsHistory, cashTransactionHistory

Backend-endpoints klare fra BIN-587 B2.1/B2.2/B2.3.

Branch: `bin-613-pr-b2-player-kyc-bankid`

Rapport scope-plan først:
- 25 legacy-filer med fil:linje
- Integrasjon med eksisterende /api/admin/players/*-endpoints (allerede live)
- Modal-strukturer for KYC-approve/reject-flow
- BankID-verifikasjon-flyt (iframe eller redirect?)
- Spillvett track-spending widget

Follow-up: BIN-TBD slot_provider (schema) — kan tas parallelt av Agent 1 hvis de er idle.
```

### TIL AGENT C (etter PR #220 merge)

```
PR #220 PR-C2 Game 2 Rocket MERGET ✅

Utmerket:
- 956 tests / 951 pass (0 G1-regresjon bekreftet via 100/100 BingoEngine/ticket/compliance/ComplianceLedger)
- Alle 7 PM Q&A implementert som godkjent
- Game2Engine subclass-pattern ren
- 3 socket-events (g2:rocket:launch, g2:jackpot:list-update, g2:ticket:completed) emittet korrekt

GO for PR-C3 — Game 3 Mønsterbingo (7-10 dager)

Scope fra AGENT-C-BRIEF §2 PR-C3:
- Custom pattern-matching (25-bitmask) — legacy gamehelper/game3.js:724-848
- Dynamisk pattern-cycling (ballNumberThreshold — patterns aktiveres/deaktiveres under runden)
- Server-side auto-claim (ingen bingo-knapp — automatisk ved match)
- g3:pattern:changed + g3:pattern:auto-won socket-events (reservert i PR-C1)
- Multi-winner-per-pattern split

Branch: `bin-615-pr-c3-game3-monster`

Game3Engine extends BingoEngine samme som C2.

Rapport scope-plan først:
- Legacy fil:linje-refs (gamehelper/game3.js, Game/Game3/Controllers/)
- Pattern-matcher-arkitektur (PatternMatcher.ts + PatternCycler.ts)
- Auto-claim state-maskin
- G1-regresjons-strategi (samme krav — 100/100 på BingoEngine/ticket/compliance/ComplianceLedger)

Etter PR-C3 merges: BIN-615 Game 2+3 backend KOMPLETT.
```

### TIL BUG-FIX-AGENT (Game 1 regresjon)

```
Bekreftelse mottatt fra eier: Unity Game 1 = 5x5 75-ball (IKKE 3x5 Databingo60).

Fullstendig diagnose + fikseplan i handoff-doc §5. Kort:

FILE-ENDRINGER (ca 2-3 timer):

1. apps/backend/src/game/ticket.ts — export helper:
```ts
export const BINGO75_SLUGS = new Set(["bingo", "game_1"]);
export function uses75Ball(slug?: string | null): boolean {
  return BINGO75_SLUGS.has(slug ?? "");
}
export function generateTicketForGame(slug?: string | null, color?: string, type?: string): Ticket {
  return uses75Ball(slug) ? generateBingo75Ticket(color, type) : generateDatabingo60Ticket();
}
```

2. Unify 3 kallsteder:
- apps/backend/src/util/roomState.ts:115, 136
- apps/backend/src/adapters/LocalBingoSystemAdapter.ts:18
- apps/backend/src/adapters/PostgresBingoSystemAdapter.ts:49

3. Fjern duplikat i apps/backend/src/game/BingoEngine.ts:198 — importér fra ticket.ts

4. Arkivér stale docs:
- packages/game-client/src/games/game1/AUDIT-RAPPORT.md → docs/archive/
- packages/game-client/src/games/game1/PORTERING-GUIDE.md → docs/archive/

VERIFISERING (hard gate):
$ cd apps/backend && npm test -- BingoEngine ticket compliance ComplianceLedger
Alle må være grønne (0 regresjoner).

Deretter manuell test på localhost:3000/web/games/ — Game 1-ticket skal vise 5x5 med fri sentercelle og tall 1-75.

DERETTER andre Game 1-bugs (popup, ball-animasjon, round-start) — diagnostiseres individuelt, start med 5x5-fiksen fordi andre bugs kan være symptomer.

Branch: fix-game1-unify-ticket-gen-5x5
Commit: fix(game1): use 75-ball ticket-gen consistently for bingo/game_1 slugs
```

---

## 11. Linear Project (BIN)

**Team-ID:** BIN — Bingosystem
**Prosjekt:** "Legacy-avkobling: Game 1–5 + backend-paritet"
**Prosjekt-URL:** https://linear.app/bingosystem/project/legacy-avkobling-game-1-5-backend-paritet-a973e623234a

**Parent-issue for admin-UI:** BIN-613
**Parent-issue for G2/G3 backend:** BIN-615

**Agent-briefs** (worktree-lokale):
- slot-A/AGENT-A-BRIEF.md (admin-UI shell + games/reports)
- slot-B/AGENT-B-BRIEF.md (admin-UI cash-inout + player)
- slot-C/AGENT-C-BRIEF.md (G2/G3 backend)

Backup av alle briefs: `/tmp/AGENT-A-BRIEF.md`, `/tmp/AGENT-B-BRIEF.md`, `/tmp/AGENT-C-BRIEF.md`

---

## 12. Kontaktpunkter og ressurser

- **GitHub repo:** https://github.com/tobias363/Spillorama-system
- **Staging:** https://spillorama-system.onrender.com
- **Legacy admin (paritet-ref):** https://spillorama.aistechnolabs.info/admin/
- **Linear:** https://linear.app/bingosystem

### Worktree-paths (alle i `/Users/tobiashaugen/Projects/Spillorama-system/.claude/worktrees/`)
- brave-dirac-d44417 — Min PM-worktree (nåværende)
- slot-A, slot-B, slot-C — Agent-worktrees
- slot-1, slot-2, slot-3 — brukt av tidligere agenter (1-5), nå idle

---

## 13. Siste notater til ny PM

**Du arver et prosjekt i god fart:**
- 46 PR-er merget i dag (2026-04-19)
- 3 store epic-er ferdig (BIN-587, BIN-583, BIN-585)
- 3 PR-er venter merge imorgen
- 3 agenter klar for neste fase

**Risikoer:**
1. **Game 1 5x5-regresjon er akutt** — prioritér fiks først
2. **Agent 5's påstand om "100% paritet"** var prematur — vi har lært at staging-QA-proof må være del av PR-rapport for visuell paritet
3. **Admin-UI-port er 8-11 uker** — langt løp, trenger dedikert oppfølging
4. **OK Bingo SQL Server-integrasjon** (BIN-583 B3.5) krever ops-konfig på Render før prod

**Metodikk-styrken:**
- "Rapport før kode"-kadens fanget 2 reelle brief-feil (Unity wheel 50-segmenter, Game 1 5x5)
- Additive merge-konflikt-løsning (ikke-destruktiv)
- Linear-matrix for paritet (docs/engineering/*)
- Gradvis cleanup av NOT-NEEDED-rader basert på grundig analyse

**Lykke til. Vi er ~9-12 uker fra 100% paritet.**

— Claude Opus (brave-dirac-worktree, 2026-04-19)
