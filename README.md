# Spillorama Bingo System

Selvstendig multiplayer-bingoplattform med sanntidsspill, wallet, compliance og CandyMania-integrasjon.

> **Merk:** Dette er et **frittstående prosjekt** og har ingenting med [Nordic Profil](https://nordicprofil.no) (WordPress e-handel) eller Lappeland (Next.js nettbutikk) å gjøre. De deler ikke kode, servere, deploy-pipelines eller databaser. Eneste fellesnevner er at de administreres av samme utvikler.

---

## Prosjektoversikt

| Komponent | Teknologi | Mappe | Beskrivelse |
|-----------|-----------|-------|-------------|
| **Backend** | Express + Socket.IO + TypeScript | `backend/` | Spillmotor, wallet, auth, compliance, admin API |
| **CandyMania frontend** | React 19 + Vite + Zustand | `candy-web/` | Candy-spillets brukergrensesnitt (tema 1) |
| **Bingo lobby** | Unity WebGL | `bingo_in_20_3_26_latest/` | Eksisterende lobby med Spillorama Unity-klient |
| **Frontend (test)** | Vanilla JS | `frontend/` | Enkel webklient for testing og admin |

### Tjenester på Render

| Tjeneste | Hva | URL |
|----------|-----|-----|
| `bingo-system` | Unity-lobby + legacy bingo-backend (Node/Express) | `bingo-system-jsso.onrender.com` |
| `candy-backend` | CandyMania-spillmotor + frontend | `candy-backend-ldvg.onrender.com` |
| `candy-db` | PostgreSQL database for candy-backend | intern |

---

## Hvordan jobbe i dette prosjektet

### Branch-strategi: alt skjer på `main`

Vi bruker **kun `main`** som deploy-branch. Alle Render-tjenester deployer fra `main`.

```
feature/mitt-arbeid  →  PR til main  →  auto-deploy til Render
```

**Workflow:**

1. **Opprett feature-branch fra main:**
   ```bash
   git checkout main && git pull
   git checkout -b feature/mitt-arbeid
   ```

2. **Gjør endringer, commit og push:**
   ```bash
   git add <filer>
   git commit -m "feat: beskrivelse av endring"
   git push -u origin feature/mitt-arbeid
   ```

3. **Lag PR til main:**
   ```bash
   gh pr create --base main --title "feat: beskrivelse"
   ```

4. **CI kjører automatisk:**
   - `backend` — typecheck
   - `compliance` — RTP/tapsgrense-tester

5. **Merge til main → Render deployer automatisk** (3-5 min)

### Candy-web: bygg før commit

`candy-web/` er React-kildekoden, men candy-backend serverer pre-bygget frontend fra `frontend/web/`. Hvis du endrer noe i `candy-web/src/`:

```bash
cd candy-web && npm install && npm run build
cp -r dist/* ../frontend/web/
cd ..
git add frontend/web/ candy-web/
git commit -m "fix: oppdater candy-web frontend build"
```

---

## Lokal utvikling

### Forutsetninger

- Node.js 18+
- PostgreSQL (for wallet/auth/sessions)
- npm

### Kjør backend lokalt

```bash
npm --prefix backend install

WALLET_PROVIDER=postgres \
WALLET_PG_CONNECTION_STRING='postgres://user:pass@localhost:5432/bingo' \
WALLET_PG_SCHEMA=public \
WALLET_PG_SSL=false \
APP_PG_CONNECTION_STRING='postgres://user:pass@localhost:5432/bingo' \
APP_PG_SCHEMA=public \
npm run dev
```

Backend starter på [http://localhost:4000](http://localhost:4000).

### Kjør candy-web (hot reload)

```bash
cd candy-web
npm install
npm run dev
```

Vite dev-server starter på [http://localhost:5173](http://localhost:5173).

### Typecheck + compliance

```bash
npm run check:all    # backend typecheck + compliance-suite + Unity compile-check
npm --prefix backend run test:compliance   # kun compliance
```

---

## Arkitektur

### Spillmotor (`BingoEngine`)

Server-autoritativ spillmotor i `backend/src/game/BingoEngine.ts`:

- Romflyt: opprett, join, start, trekk, claim, avslutt
- Automatisk rundestart (konfigurerbart intervall)
- RTP-styring for Candy (konfigurerbar `payoutPercent`)
- Maks 5 bonger per spiller
- Sperre mot parallell deltakelse (en aktiv runde per wallet)
- 30s minimum mellom spillstarter
- Near-miss bias (konfigurerbar rate)

### Wallet

Tre providere, konfigurert via `WALLET_PROVIDER`:

| Provider | Bruk | Env |
|----------|------|-----|
| `file` | Lokal utvikling | `WALLET_DATA_PATH=backend/data/wallets.json` |
| `http` | Ekstern wallet-API | `WALLET_API_BASE_URL`, `WALLET_API_KEY` |
| `postgres` | Produksjon | `WALLET_PG_CONNECTION_STRING` |

### Compliance

Håndheves server-side:
- Tapsgrenser: 900 NOK/dag, 4400 NOK/måned (regulatorisk maks)
- Personlige tapsgrenser (innenfor regulatorisk maks)
- Obligatorisk pause: 5 min etter 60 min samlet spilltid
- Selvutelukkelse
- Premiecaps + payout-audit trail

### CandyMania-integrasjon

Bingo-lobbyen apner CandyMania i en iframe via en launch-token-flyt:

```
1. Spiller logger inn i bingo-lobby
2. Klikker CandyMania-tile
3. Lobby kaller /api/integration/candy-launch
4. candy-backend oppretter launch-token + spillersesjon
5. Iframe apnes med ?lt=TOKEN&embed=true
6. candy-frontend resolver token -> henter sesjon -> spillet starter
```

Wallet-transaksjoner (bet/win) gar via PostMessage mellom iframe og lobby.

### Swedbank Pay

Checkout v3.1 for wallet top-up:

1. `POST /api/payments/swedbank/topup-intent` oppretter payment order
2. Spiller redirectes til Swedbank
3. Callback: `POST /api/payments/swedbank/callback`
4. Backend avstemmer og krediterer wallet

---

## Miljovariabler

### Spillinnstillinger

```bash
BINGO_MIN_ROUND_INTERVAL_MS=30000
BINGO_DAILY_LOSS_LIMIT=900
BINGO_MONTHLY_LOSS_LIMIT=4400
BINGO_PLAY_SESSION_LIMIT_MS=3600000   # 60 min
BINGO_PAUSE_DURATION_MS=300000         # 5 min
AUTO_ROUND_START_ENABLED=true
AUTO_ROUND_START_INTERVAL_MS=30000
AUTO_DRAW_ENABLED=true
AUTO_DRAW_INTERVAL_MS=1200
CANDY_PAYOUT_PERCENT=80
BINGO_NEAR_MISS_BIAS_ENABLED=true
BINGO_NEAR_MISS_TARGET_RATE=0.38
```

### Integrasjon

```bash
INTEGRATION_ENABLED=true
INTEGRATION_API_KEY=<delt nokkel mellom bingo-system og candy-backend>
CANDY_BACKEND_URL=https://candy-backend-ldvg.onrender.com
```

### Database / Auth

```bash
APP_PG_CONNECTION_STRING=postgres://...
APP_PG_SCHEMA=public
AUTH_SESSION_TTL_HOURS=168
JWT_SECRET=<secret>
```

---

## API-oversikt

### Auth
- `POST /api/auth/register` / `login` / `logout`
- `GET /api/auth/me`

### Wallet (innlogget)
- `GET /api/wallet/me`
- `POST /api/wallet/me/topup`
- `GET /api/wallet/me/compliance`
- `PUT /api/wallet/me/loss-limits`

### Spill / Rom
- `GET /api/rooms` / `GET /api/rooms/:code`
- `POST /api/admin/rooms` / `start` / `draw-next` / `end`

### Admin
- `GET /api/admin/games` / `PUT /api/admin/games/:slug`
- `GET /api/admin/wallets/:id/compliance`

### Socket.IO events
- `room:create` / `room:join` / `room:resume`
- `game:start` / `game:end`
- `draw:next` / `ticket:mark` / `claim:submit`
- `room:state`

---

## CI/CD

| Workflow | Trigger | Hva |
|----------|---------|-----|
| `ci.yml` | PR til main | Typecheck, tester, compliance-suite, RTP-gate |
| `compliance-gate.yml` | PR til main | Compliance-test enforcement |
| `deploy-staging.yml` | Push til main | Trigger Render deploy + health-wait |
| `deploy-production.yml` | Manuell / tag | Produksjons-deploy |

---

## Mappestruktur

```
.
├── backend/              # Express + Socket.IO backend (TypeScript)
│   ├── src/
│   │   ├── adapters/     # Wallet, BingoSystem, integrasjoner
│   │   ├── admin/        # Admin API + RBAC
│   │   ├── compliance/   # RTP/tapsgrense-tester
│   │   ├── game/         # BingoEngine spillmotor
│   │   ├── integration/  # Hall/venue-integrasjon
│   │   ├── launch/       # Launch-token store
│   │   ├── payments/     # Swedbank Pay
│   │   └── platform/     # Auth, sessions, spillkatalog
│   └── package.json
├── candy-web/            # CandyMania React frontend (kildekode)
├── frontend/             # Pre-bygget webklient + admin
│   ├── admin/
│   └── web/              # Bygget candy-web output (serveres av backend)
├── bingo_in_20_3_26_latest/  # Legacy lobby (Unity WebGL + Node)
├── docs/                 # Utfyllende dokumentasjon (20+ filer)
├── scripts/              # Build, deploy, release-automatisering
├── .github/workflows/    # CI/CD pipelines
└── render.yaml           # Render deploy-konfigurasjon
```

---

## Dokumentasjon

Detaljert dokumentasjon finnes i `docs/`:

- `ENGINEERING_WORKFLOW.md` — Git + Render arbeidsflyt
- `RENDER_GITHUB_SETUP.md` — Infrastruktur-oppsett
- `CANDY_RELEASE_ROLLOUT_PLAN.md` — Release-prosedyrer
- `LOCAL_SOURCE_OF_TRUTH_WORKFLOW.md` — Unity/Candy lokal utvikling
- `HALL_PILOT_RUNBOOK.md` — Pilotprosedyrer og rollback

---

## Forskjell fra andre prosjekter

| | Spillorama Bingo | Nordic Profil | Lappeland |
|--|-----------------|---------------|-----------|
| **Type** | Sanntids multiplayer bingoplattform | WordPress e-handel (profilprodukter) | Next.js nettbutikk (navnelapper) |
| **Teknologi** | Node/TS + React + Unity + PostgreSQL + Socket.IO | WordPress + PHP + mu-plugins | Next.js + React |
| **Server** | Render (Frankfurt) | Servebolt | Vercel |
| **Repo** | `tobias363/bingosystem` | `tobias50/Nordic-profil` | Separat |
| **Database** | PostgreSQL (wallet, sessions, games) | WordPress MySQL | — |
| **Deploy** | PR til main -> Render auto-deploy | PR til main -> GitHub Actions -> Servebolt | Vercel auto-deploy |

Disse prosjektene deler ingen kode, infrastruktur eller avhengigheter.
