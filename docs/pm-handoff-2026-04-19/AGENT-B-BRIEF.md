# AGENT B BRIEF — Admin-UI Operasjonelle moduler (cash, player, withdraw)

**Prosjektleder:** Claude Opus (brave-dirac-worktree)
**Din rolle:** frontend operasjonell-agent — daglig drift-verktøy for hall-ansatte
**Working directory:** velg ledig slot (slot-B eller annen)
**Base branch:** `origin/main` — **VENT på Agent A PR-A1 merged før du starter**

**Linear:** [BIN-613](https://linear.app/bingosystem/issue/BIN-613) parent
**Mandat:** 100% visuell + funksjonell 1:1 paritet av legacy admin-UI.

**Audit:** Les `/tmp/legacy-admin-parity-audit.md` FØRST — spesielt §3 cash-inout og player (dine kritiske topp-1 og topp-2 gaps).

---

## 1. Forutsetninger

### 1.1 Start FØRST etter PR-A1 merged

Agent A leverer foundation (shell, sidebar, router, i18n). Du bygger PÅ den infrastrukturen. Start din første PR etter du ser PR-A1 på main.

### 1.2 Worktree
```bash
cd /Users/tobiashaugen/Projects/Spillorama-system
git worktree add .claude/worktrees/slot-B origin/main
cd .claude/worktrees/slot-B
git fetch origin main -q
git checkout -B bin-615-cash-inout origin/main   # etter PR-A1 er merget
```

### 1.3 Kildesannhet
- `legacy/unity-backend/App/Views/cash-inout/` — 13 filer, DIN topp-prioritet
- `legacy/unity-backend/App/Views/player/` — 25 filer (inkl. KYC/BankID/track-spending)
- `legacy/unity-backend/App/Views/physicalTickets/` (3), `sold-tickets` (del av cash-inout)
- `legacy/unity-backend/App/Views/Amountwithdraw/` (8)
- `legacy/unity-backend/App/Views/TransactionManagement/` (3)
- `legacy/unity-backend/App/Views/walletManagement/` (2)
- `legacy/unity-backend/App/Views/Products/` (3)
- `legacy/unity-backend/App/Views/unique/` (5) — Unique-ID-moduler (UNTATT Unique Player anonyme kort som er scope-dropped)
- `legacy/unity-backend/App/Views/security/` (4)
- `legacy/unity-backend/App/Views/riskCountry/` (2)
- `legacy/unity-backend/App/Views/payment/` (4)
- `legacy/unity-backend/App/Views/LeaderboardManagement/` (2)
- `legacy/unity-backend/App/Views/login.html`, `register.html`, `forgot-password.html`, osv.

---

## 2. Din scope — 7 PR-er (220-300 timer)

### PR-B1 — cash-inout (40-60t, KRITISK)

**Hall-ansatte bruker dette daglig.** 13 sider inkl:
- `cash_in-out.html` — hoved-side med tabs (innskudd/uttak/produkter/billetter), scan unique-id
- `sell_ticket.html` — selg billett med printer-integrering
- `sold-tickets.html` — DataTable av solgte i skift
- `product_cart.html` + `product_checkout.html` — produkt-handlekurv
- `cashout_details.html`, `physical-ticket.html`, modaler osv.

**API:** `/api/agent/*` endpoints er klare (BIN-583 levert). Sjekk `apps/backend/src/routes/agent.ts`, `agentProducts.ts`, `agentMetronia.ts`, `agentOkBingo.ts`.

### PR-B2 — player + KYC + BankID + track-spending (60-80t)

25 filer. Kritisk for KYC-moderasjon + Spillvett-oppfølging.

**Sub-scope:**
- `player.html` — alle-liste med KYC-status-badges
- `viewPlayer.html` — detalj-tabs
- `PendingRequests/` + `RejectedRequests/` — KYC-moderasjon
- `bankId/` — BankID-verifikasjon
- `track-spending/` — Spillvett-oppfølging (regulatorisk krav)
- `gameHistory`, `loginHistory`, `chipsHistory`, `cashTransactionHistory`

### PR-B3 — physicalTickets + unique + sold-tickets (25-40t)

Kjernevirksomhet for hall:
- `physicalTickets/` (3)
- `unique/` (5 — men IKKE Unique Player anonyme kort, som er scope-dropped per BIN-583 Alt B)

### PR-B4 — Amountwithdraw + Transaction + Wallet (30-50t)

Økonomi/regnskap:
- `Amountwithdraw/` (8) — bank/hall requests + history + email-allowlist
- `TransactionManagement/` (3)
- `walletManagement/` (2)

### PR-B5 — Products (10-15t)

`Products/` (3): list, category-list, hall-products

### PR-B6 — security + riskCountry + payment + Leaderboard (25-35t)

- `security/` (4) — security + blocked-IP
- `riskCountry/` (2)
- `payment/` (4) — Swedbank integration views
- `LeaderboardManagement/` (2)

### PR-B7 — Login + register + forgot-password flow (10-20t)

- `login.html` — layout med logo + "Keep me logged in" + forgot-password-link
- `register.html`
- `forgot-password.html`, `reset-password.html`, `resetPasswordSuc.html`
- `playerResetPassword.html`, `importplayer-reset-password.html`

---

## 3. Regler

### Filer du eier
- `apps/admin-web/src/pages/cash-inout/**`
- `apps/admin-web/src/pages/player/**`
- `apps/admin-web/src/pages/physical-tickets/**`
- `apps/admin-web/src/pages/transactions/**`
- `apps/admin-web/src/pages/withdraw/**`
- `apps/admin-web/src/pages/products/**`
- `apps/admin-web/src/pages/security/**`
- `apps/admin-web/src/pages/login/**`
- `apps/admin-web/src/pages/payment/**`
- `apps/admin-web/src/pages/leaderboard/**`

### Filer du IKKE rører (Agent A sin scope)
- `apps/admin-web/src/shell/**`
- `apps/admin-web/src/router/**`
- `apps/admin-web/src/auth/**`
- `apps/admin-web/src/i18n/**`
- `apps/admin-web/src/pages/games/**`
- `apps/admin-web/src/pages/reports/**`
- `apps/admin-web/src/pages/admin/**` (admin-CRUD)
- `apps/admin-web/src/pages/cms/**`

### Delt shared
- `apps/admin-web/src/api/**` — legg til API-wrappers
- `apps/admin-web/src/components/**` — gjenbruk Agent A's komponenter
- `apps/admin-web/src/i18n/` — legg til nye oversettelser

### Stack
- Samme som Agent A: TypeScript + Vite + vanilla DOM
- Bruk Agent A's shell-komponenter (Sidebar, Header, Layout)
- Registrer dine sider i routeren med permission-metadata

---

## 4. Test-regime

Samme som Agent A. `npm run check && npm run build && npm test` grønne før push.

Manuell sammenligning mot https://spillorama.aistechnolabs.info/admin/ for visuell paritet.

---

## 5. Rapport-kadens

Etter hver PR: samme format som Agent A (PR URL, sider, legacy-refs, screenshots, avvik, tester, neste PR, stopp-og-vent).

---

## 6. Kritiske "ikke gjør"

- **Ikke start før PR-A1 er merget**
- Ikke merge direkte
- Ikke endre backend
- Ikke legg til npm-deps uten godkjenning
- Ikke rør Agent A's filer
- Ved tvil: stopp og spør PM

---

## 7. Første konkrete handling

**Mens du venter på PR-A1:**
1. Les `/tmp/legacy-admin-parity-audit.md` grundig (fokuser §3 cash-inout og player)
2. Les legacy-filene `App/Views/cash-inout/*.html` + `App/Views/player/*.html`
3. Les backend-endpoints: `apps/backend/src/routes/agent.ts`, `agentProducts.ts`, `adminPlayers.ts`
4. Forbered PR-B1-plan (cash-inout) med:
   - Hvilke 13 legacy-filer du vil porte
   - Shared komponenter du trenger fra Agent A (DataTable, Modal, Form)
   - API-endpoints du vil kalle
   - Test-strategi

**Når PR-A1 er merget:**
- Rebase din branch på main
- Rapporter PR-B1-plan til PM
- Vent på plan-review
- Start kode

---

## 8. Estimat

| PR | Timer | Uker |
|----|-------|------|
| B1 cash-inout (13) | 40-60 | 1-1.5 |
| B2 player + KYC + BankID (25) | 60-80 | 2 |
| B3 physicalTickets + unique (8) | 25-40 | 0.5-1 |
| B4 Amountwithdraw + Transactions + Wallet (13) | 30-50 | 1 |
| B5 Products (3) | 10-15 | 0.25 |
| B6 security + risk + payment + Leaderboard (12) | 25-35 | 0.75 |
| B7 Login/register/reset flows (6-10) | 10-20 | 0.5 |
| **Total** | **200-300t** | **6-7 uker** |

---

## 9. Ved problem

Ping PM med konkret legacy-ref + screenshot. PM svarer raskt.
