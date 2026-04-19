# AGENT A BRIEF — Admin-UI Shell + Foundation + Spillplan/Rapporter

**Prosjektleder:** Claude Opus (brave-dirac-worktree)
**Din rolle:** frontend shell-agent — legger fundamentet + dekker spill/rapport/admin-CRUD
**Working directory:** velg ledig slot (slot-1, slot-2, slot-3, eller opprett slot-A)
**Base branch:** `origin/main` (oppdatert 2026-04-19, 46 PR-er merget)

**Linear:** [BIN-613](https://linear.app/bingosystem/issue/BIN-613) parent, [BIN-614](https://linear.app/bingosystem/issue/BIN-614) PR-1
**Mandat:** 100% visuell + funksjonell 1:1 paritet av legacy admin-UI. Hall-ansatte er trent på det.

**Audit:** Les `/tmp/legacy-admin-parity-audit.md` FØRST (full paritets-rapport, 40+ kategorier, 222 HTML-filer). Du trenger spesielt §2 (sidebar-hierarki) og §3 (per-kategori-inventar).

---

## 1. Forutsetninger

### 1.1 Worktree
```bash
cd /Users/tobiashaugen/Projects/Spillorama-system
# Hvis slot-A ikke finnes:
git worktree add .claude/worktrees/slot-A origin/main
cd .claude/worktrees/slot-A
```

### 1.2 Kildesannhet (les kun)
- `legacy/unity-backend/App/Views/partition/` — master-layout + sidebar + header + footer
- `legacy/unity-backend/App/Views/templates/` — dashboard + widget-templates
- `legacy/unity-backend/App/Views/` — alle øvrige kategorier
- `legacy/unity-backend/public/` — CSS, JS, fonts, images (AdminLTE 2-assets)

### 1.3 Nåværende admin-web (som blir erstattet)
- `apps/admin-web/index.html` (907 linjer)
- `apps/admin-web/app.js` (3883 linjer)

**VIKTIG:** Nåværende admin har 10 seksjoner som er NYE Spillorama-features (live-rom, TV-display, wallet-compliance). De skal BEHOLDES i ny shell som egne menypunkter — de er ikke erstatninger.

---

## 2. Din scope — 6 PR-er (250-350 timer)

### PR-A1 (FØRST — foundation) — BIN-614, 60-80t

**Scope:**
- AdminLTE 2-skin portert 1:1
- Master-layout (sidebar + header + footer + body-wrapper)
- 34 menypunkter i sidebar med permission-gating
- Auth-guard med rolle-routing (admin/super-admin/agent)
- i18n-motor (NO default, porter `{{navigation.*}}`-nøkler)
- Client-side router (hash-based anbefalt)
- Placeholder-sider for alle 34 menypunkter (stubs)
- Header: logo, dailyBalance (agent), hall-navn, cash-in/out-knapp, notifications-bell, user-dropdown

**Filer:**
- `apps/admin-web/src/main.ts` (ny)
- `apps/admin-web/src/shell/Layout.ts` (ny)
- `apps/admin-web/src/shell/Sidebar.ts` (ny — 34 menypunkter)
- `apps/admin-web/src/shell/Header.ts` (ny)
- `apps/admin-web/src/router/Router.ts` (ny)
- `apps/admin-web/src/auth/AuthGuard.ts` (ny)
- `apps/admin-web/src/i18n/` (ny mappe)
- `apps/admin-web/styles/adminlte.css` (portert skin)
- `apps/admin-web/vite.config.ts` (bygger til `dist/`)

**Bevar** eksisterende apps/admin-web-funksjonalitet ved å integrere de 10 seksjonene som menypunkter i ny sidebar.

**AC:**
- Admin kan logge inn og se full sidebar
- Alle 34 menypunkter klikkbare (selv om placeholder-side)
- Header viser `dailyBalance` for agent (null for admin)
- i18n fungerer (bytt NO/EN hvis implementert)
- `npm run build` produserer deploy-bar dist/
- Deploy til Render fungerer (apps/backend serverer dist/)

### PR-A2 — Dashboard + widgets (15-25t)

**Scope:**
- Dashboard-hovedside fra `App/Views/templates/dashboard.html`
- Widget: "Totalt antall godkjente spillere"-kort
- Widget: "Siste forespørsler"-tabell (pending deposits)
- Widget: "Topp 5 spillere"-liste
- Widget: "Pågående spill"-tabbed-tabell (Spill1-5 tabs)
- Notifications-bell med pending-teller

### PR-A3 — GameManagement stack (50-80t)

Kategorier:
- `GameManagement/` (10 sider)
- `dailySchedules/` (6)
- `savedGame/` (8)
- `schedules/` (3)
- `gameType/` (4)
- `subGameList/` (3)
- `patternManagement/` (3)

**Totalt: ~37 sider, stor bolk.**

### PR-A4 — Reports + Hall Account (60-80t)

Kategorier:
- `report/` (15)
- `hallAccountReport/` (4)
- `PayoutforPlayers/` (5)

### PR-A5 — Admin/Agent/User/Role/Hall (30-40t)

- `admin/` (3)
- `agent/` (2)
- `user/` (2)
- `role/` (3)
- `GroupHall/` (4)
- `Hall/` (2)

### PR-A6 — CMS + Settings + SystemInfo (20-30t)

- `CMS/` (8) — inkl. Spillvett regulatorisk
- `settings/` (3)
- `SystemInformation/` (1)
- `otherGames/` (4) — Wheel, Chest, Mystery, Colordraft admin-config

---

## 3. Regler

### Filer du eier
- `apps/admin-web/src/shell/**` (sidebar, header, layout)
- `apps/admin-web/src/router/**`
- `apps/admin-web/src/auth/**`
- `apps/admin-web/src/i18n/**`
- `apps/admin-web/src/pages/games/**`
- `apps/admin-web/src/pages/reports/**`
- `apps/admin-web/src/pages/admin/**`
- `apps/admin-web/src/pages/cms/**`
- `apps/admin-web/styles/**`

### Filer du IKKE rører (Agent B sin scope)
- `apps/admin-web/src/pages/cash-inout/**`
- `apps/admin-web/src/pages/player/**`
- `apps/admin-web/src/pages/physical-tickets/**`
- `apps/admin-web/src/pages/transactions/**`
- `apps/admin-web/src/pages/withdraw/**`
- `apps/admin-web/src/pages/products/**`
- `apps/admin-web/src/pages/security/**`
- `apps/admin-web/src/pages/login/**`

### Delt shared kode
- `apps/admin-web/src/api/**` — API-klient (additive additions OK)
- `apps/admin-web/src/components/**` — gjenbrukbare komponenter (DataTable, Form, Modal, etc.)
- Koordineres via PM ved konflikt

### Backend
- **Ikke rør** `apps/backend/**`. Alle API-er er klare.
- Unntak: hvis du oppdager manglende endpoint, rapporter til PM, jeg tar det.

### Stack
- **TypeScript strict**
- **Vite** for build
- **Vanilla DOM** (ingen React/Vue) — lettere å matche AdminLTE 2-stil byte-for-byte
- **jQuery** OK hvis det trengs for å matche legacy-oppførsel (men unngå hvis mulig)
- **GSAP eller Animate.css** for animasjoner

### Kodestil
- Commit-melding: `feat(admin): PR-A<n> <topic>`
- Max 2000 linjer diff per PR (splitt hvis større)
- Alle nye komponenter: 1 enhetstest minimum

---

## 4. Test-regime

```bash
cd apps/admin-web
npm run check    # tsc strict
npm run build    # Vite-bygge
npm test         # Vitest
```

Manuell verifisering: åpne lokalt, sammenlign med https://spillorama.aistechnolabs.info/admin/

---

## 5. Rapport-kadens

**Etter hver PR:**
1. PR URL
2. Sider portert (liste)
3. Legacy-filer referert (fil:linje)
4. Screenshots ny vs legacy (nøkkelsider)
5. Avvik fra legacy dokumentert
6. Test-status
7. Neste PR foreslått
8. **Stopp-og-vent**

---

## 6. Kritiske "ikke gjør"

- Ikke merge direkte — alltid PR.
- Ikke endre backend.
- Ikke fjern nåværende admin-web-seksjoner (dashboard-live, display-tokens, game-stats) — integrer dem som menypunkter i ny sidebar.
- Ikke legg til npm-deps uten godkjenning (unntak: Vite, TS, vitest, adminlte-css).
- Ikke modernisér visuelt — 1:1 visuell paritet er mandat.

---

## 7. Koordinering med Agent B

- Agent B venter på din PR-A1 (foundation) før de starter
- Etter PR-A1 merges: Agent B plukker opp player/cash-inout parallelt
- Delt komponenter (DataTable, Form, Modal): bygg dem i PR-A1 med god API, Agent B bruker dem
- Ved konflikt: jeg (PM) arbitrerer

---

## 8. Første konkrete handling

1. Opprett worktree (slot-A)
2. **Les grundig** — `/tmp/legacy-admin-parity-audit.md` §1-§6 minimum
3. **Rapporter plan for PR-A1** med:
   - Fil-struktur du vil bygge
   - Hvilke legacy-filer du vil referere (fil:linje)
   - Anbefaling for bundling (Vite-config, dist-path)
   - Hvilke eksisterende apps/admin-web-funksjoner skal beholdes hvor i ny shell
   - Test-strategi
4. **Vent på PM-review** av planen, deretter kode

**Ingen kode før plan er godkjent.**

---

## 9. Estimat

| PR | Timer | Uker |
|----|-------|------|
| A1 shell + nav + i18n | 60-80 | 1.5-2 |
| A2 dashboard + widgets | 15-25 | 0.5 |
| A3 GameManagement stack (37 sider) | 50-80 | 1.5-2 |
| A4 Reports + hallAccountReport (24 sider) | 60-80 | 1.5-2 |
| A5 Admin/agent/user/role/hall (16 sider) | 30-40 | 1 |
| A6 CMS + Settings + SystemInfo (16 sider) | 20-30 | 0.5-1 |
| **Total** | **235-335t** | **6.5-8.5 uker** |

---

## 10. Ved problem

Ping PM (brave-dirac-worktree) med:
- Hvilken PR
- Hva du prøvde
- Legacy fil-referanse
- Screenshot hvis visuelt
