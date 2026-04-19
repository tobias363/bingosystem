# PR-B1 — cash-inout (plan-utkast, venter PR-A1 merge)

**Agent:** B (slot-B)
**Parent:** [BIN-613](https://linear.app/bingosystem/issue/BIN-613)
**Estimat:** 40–60t (1–1.5 uker)
**Base-branch:** `origin/main` *etter* Agent A PR-A1 er merget
**Branch (planlagt):** `bin-615-cash-inout`

---

## 1. Scope — 12 sider (+ 1 backup droppet)

Fra `legacy/unity-backend/App/Views/cash-inout/`:

| # | Legacy-fil | Linjer | Ny sti (apps/admin-web/src/pages/cash-inout/) | Merknad |
|---|---|---|---|---|
| 1 | `cash_in-out.html` | 4883 | `index.ts` + `index.html` | **Hovedside**, 3 tabs: default/agent/game. Drop "game"-tab (delt med spill-oversikt, ligger i Agent A `pages/games/`) |
| 2 | `sell_ticket.html` | 490 | `sell-ticket.ts` | Fysisk billett-salg + barcode-scanner (`on_scanner()` keypress-handler) |
| 3 | `sold-tickets.html` | 692 | `sold-tickets.ts` | Skift-liste med from/to-datepicker + DataTable |
| 4 | `cashout_details.html` | 606 | `cashout-details.ts` | Modal/popup-side med cash-out-detalj |
| 5 | `physical-ticket.html` | 327 | `physical-ticket-modal.ts` | Modal for fysisk billett |
| 6 | `product_cart.html` | 745 | `product-cart.ts` | Handlekurv med kvantitets-badges |
| 7 | `product_checkout.html` | 249 | `product-checkout.ts` | Checkout-popup |
| 8 | `unique-id-balance.html` | 249 | `unique-id-balance.ts` | Vis/sett unique-ID-saldo |
| 9 | `register-user-balance.html` | 321 | `register-user-balance.ts` | Registrer spiller-balanse |
| 10 | `slotmachine-popups.html` | 176 | `modals/slotmachine.ts` | Slot-machine-knytning modal |
| 11 | `cashinout-popups.html` | 173 | `modals/general.ts` | Generelle popups |
| 12 | `add-withdraw-user-popup.html` | 174 | `modals/withdraw-user.ts` | Add withdraw-bruker modal |
| — | ~~`product_cart_old.html`~~ | 276 | SKIP — backup |

---

## 2. Hovedside `cash_in-out.html` — struktur

**Tabs (`.custom-nav-tabs`):**
1. **default** — balanse-oversikt (totalHallCashBalance, totalCashIn, totalCashOut, dailyBalance) + knapper: Add Daily Balance, Refresh, Control Daily Balance, Today's Sales Report, Settlement
2. **agent** — handling-grid: Slot Machine, Add Money Unique ID, Add Money Registered User (F5), Create New Unique ID, Withdraw Unique ID, Withdraw Registered User (F6), Sell Products
3. **game** — pågående spill (overlapper Agent A sin ongoing-games — **avklar med PM om vi dropper denne tab'en her**)

**Session-data brukt:**
- `session.hall[0].id`, `session.hall[0].name`
- `session.role`, `session.name`
- `session.dailyBalance` (header)

**Tastatursnarveier:** F5 (add money reg user), F6 (withdraw reg user), F8 (today's sales report). **Må ports 1:1.**

**Session-awareness:** `initializeValidator()`, `on_scanner()` (keypress-lytter på input for streng-kode-scannere — klipper siste 22 tegn, trekker ut posisjon 14–21 som ticket-ID).

---

## 3. API-endpoints (alle lever i backend)

### Agent-scoped (dekker PR-B1 ~100%):

**agent.ts:**
- `GET /api/agent/auth/me` — session (hall, dailyBalance)
- `POST /api/agent/shift/start` / `end`, `GET /api/agent/shift/current` / `history`

**agentOpenDay.ts:**
- `POST /api/agent/shift/open-day` — add daily balance
- `GET /api/agent/shift/daily-balance`
- `GET /api/agent/shift/physical-cashouts` / `/summary`

**agentSettlement.ts:**
- `POST /api/agent/shift/control-daily-balance`, `close-day`
- `GET /api/agent/shift/settlement-date`
- `GET /api/agent/shift/:shiftId/settlement` + `.pdf`

**agentTransactions.ts:**
- `POST /api/agent/players/lookup` (scan unique-id)
- `GET /api/agent/players/:id/balance`
- `POST /api/agent/players/:id/cash-in` / `cash-out`
- `POST /api/agent/tickets/register`
- `GET /api/agent/physical/inventory`, `POST /api/agent/physical/sell` / `cancel`
- `GET /api/agent/transactions/today` / `/:id` / (list)

**agentProducts.ts:**
- `GET /api/agent/products`
- `POST /api/agent/products/carts`, `GET /api/agent/products/carts/:id`
- `POST /api/agent/products/carts/:id/finalize` / `cancel`
- `GET /api/agent/products/sales/current-shift`

**agentMetronia.ts** (slot-machine integrasjon):
- `POST /api/agent/metronia/register-ticket` / `topup` / `payout` / `void`
- `GET /api/agent/metronia/ticket/:n`, `daily-sales`

**agentOkBingo.ts** (OK Bingo SQL-integrasjon, hvis relevant for fysisk billett):
- `POST /api/agent/okbingo/register-ticket` / `topup` / `payout` / `void` / `open-day`
- `GET /api/agent/okbingo/ticket/:n`, `daily-sales`

**Alt dette er levert i BIN-583 (B3.2–B3.8).** Ingen backend-endringer i PR-B1.

---

## 4. Shared-komponenter trengt fra Agent A

**Må finnes i `apps/admin-web/src/components/` før jeg kan begynne PR-B1:**

| Komponent | Bruk | Kritikalitet |
|---|---|---|
| `DataTable` | sold-tickets, cart-liste, transaksjonshistorikk | **BLOKKERENDE** |
| `Modal` | 4 modals (slotmachine, general, withdraw-user, checkout) | **BLOKKERENDE** |
| `DateRangePicker` | sold-tickets from/to-dato | BLOKKERENDE |
| `FormField` + `validator` | sell_ticket scanner-input, balance-forms | Høy |
| `Alert` (success/error toast + inline) | alertSuccess/alertError-pattern i alle submit-flows | Høy |
| `SweetAlert-confirm` wrapper | delete/cancel-bekreftelser (brukes ~20 steder i cash_in-out) | Høy |
| `Panel` / `Box` (panel-heading/panel-body, AdminLTE box-danger/info/primary) | Hovedstruktur i alle sider | Middels |
| `Tabs` (nav-tabs custom) | Hovedsidens 3 tabs | Middels |
| `Breadcrumb` (content-header + ol.breadcrumb) | Alle sider | Lav |
| i18n `t()`-helper + `no.json`-katalog med nøkler (`translate.*`, `soldTicket.*`) | Alle strenger | **BLOKKERENDE** |

**Hvis Agent A leverer disse som dokumentert API i PR-A1, kan jeg starte umiddelbart etter merge. Ellers: meld PM før start.**

**Delt shared jeg skal legge til selv (etter Agent A):**
- `apps/admin-web/src/api/agent-cash.ts` — wrappers for agentTransactions + agentProducts + agentMetronia + agentOkBingo
- `apps/admin-web/src/api/agent-shift.ts` — wrappers for agentOpenDay + agentSettlement
- `apps/admin-web/src/components/BarcodeScanner.ts` — re-implementering av `on_scanner()` (keypress-basert, 22-tegn-streng). Se [BARCODE-SCANNER-SPEC.md](BARCODE-SCANNER-SPEC.md).
- `apps/admin-web/src/components/SlotProviderSwitch.ts` — velger metronia/okbingo endpoint basert på `hall.slotProvider`. Fallback til feilmelding (se Q2).
- `apps/admin-web/src/i18n/no/cash-inout.json` — ~200 nøkler (se [I18N-KEYS-CASH-INOUT.md](I18N-KEYS-CASH-INOUT.md), totalt 301 unike keys hvor hovedandel er `translate.*`, resten `soldTicket.*`).

---

## 5. Router-integrasjon

**Nye ruter (registreres i Agent A sin router med permission-metadata):**

| URL | Side | Permission | Rolle |
|---|---|---|---|
| `/agent/cashinout` | `cash-inout/index` | `CashInOut.view` | agent |
| `/agent/sellProduct` | `cash-inout/product-cart` | `Products.sell` | agent |
| `/agent/sellPhysicalTickets/:gameId` | `cash-inout/sell-ticket` | `PhysicalTickets.sell` | agent |
| `/sold-tickets` | `cash-inout/sold-tickets` | `SoldTickets.view` | admin + agent |
| `/agent/unique-id/add` | → eksisterende BIN-583 flow | — | agent |
| `/agent/register-user/add` | `cash-inout/register-user-balance` | `CashInOut.registerUser` | agent |

Modaler er ikke ruter — de åpnes via `data-toggle="modal"` fra hovedsiden.

---

## 6. Test-strategi

### Unit / integrasjon
- Vitest per side-modul: mount → assert DOM + API-call stub via msw/simple-fetch-mock
- BarcodeScanner: simulér keypress-sekvens med 22-tegn-streng, assert extract av `substr(14, 7)`
- Tastatursnarveier F5/F6/F8: dispatchEvent + assert aktiv tab / modal

### E2E (Playwright eller chrome-devtools-mcp)
- Agent-login → `/agent/cashinout` → se balance-tabell + 3 tabs
- Klikk "Add Daily Balance" → modal åpner → submit → balance oppdaterer
- Sell ticket: scan streng → DataTable rad legges til → Submit → redirect/reload
- Sold tickets: velg date-range → DataTable laster via `/api/agent/transactions`

### Visuell paritet
- Screenshot-sammenligning mot https://spillorama.aistechnolabs.info/admin/ for hver av de 12 sidene
- Leveres som PR-kommentar: legacy-screenshot + ny-screenshot side ved side

### Regresjon
- `npm run check && npm run build && npm test` grønn før push
- Agent A sine shell-tester skal fortsatt passere

---

## 7. Avklaringer — PM-svar mottatt 2026-04-19 (ALLE BESVART)

1. **"Game"-tab:** ✅ **DROP.** DRY — Agent A eier `pages/games/` + dashboard-widget. Port kun `default` + `agent` tabs.
2. **Slot Machine:** ✅ **Switch på `hall.slotProvider`.**
   - `"metronia"` → `/api/agent/metronia/*`
   - `"okbingo"` → `/api/agent/okbingo/*`
   - Default/null → feilmelding "Ingen slot-leverandør konfigurert for denne hallen"
   - **TODO:** Feltet `slot_provider` finnes IKKE på `app_halls` i [20260413000001_initial_schema.sql](apps/backend/migrations/20260413000001_initial_schema.sql) (verifisert). **Opprett Linear follow-up-issue (BIN-TBD)** for å legge til kolonnen + admin-UI. Ikke blokker PR-B1 — implementer switch med feilmelding som default; config fylles inn senere.
3. **F5/F6/F8:** ✅ **preventDefault + cash-inout-gate.** Match legacy. Handler bare aktiv når brukeren er på `/agent/cashinout`-ruten:
   ```ts
   document.addEventListener('keydown', (e) => {
     if (['F5','F6','F8'].includes(e.key) && isCashInOutRouteActive()) {
       e.preventDefault();
       // F5 → add-money-register-user, F6 → withdraw-register-user, F8 → today's sales report
     }
   });
   ```
4. **Scanner-input:** ✅ **22-tegn + ENTER match legacy.** Hall-readere allerede konfigurert. Avvikende hall → post-pilot BIN-issue for scanner-config i SettingsPanel.
5. **Control Daily Balance:** ✅ **Midtveis-sjekk, ikke shift-close.** Semantikk fra B3.3:
   - Input: faktisk telt kontant
   - Sammenlign mot forventet (open-day + transaksjoner)
   - Diff > 500 kr ELLER > 5% → krev note
   - Kan gjentas gjennom dagen
   - `POST /api/agent/shift/control-daily-balance` dekker dette.
6. **Settlement-modal backdrop:** ✅ **Modal må støtte `backdrop: "static"` + `keyboard: false`.** Notis sendt til Agent A (innarbeid i PR-A1). Hvis Agent A ikke inkluderer det → jeg utvider `Modal.ts` i PR-B1.
7. **Unique Player scope:** ✅ **Registrerte brukere med unique-ID ER i scope.** Anonyme kort (pseudonym Unique Player) er droppet per BIN-583 Alt B. `unique-id-balance.html` + `register-user-balance.html` gjelder begge **registrerte** brukere → port begge.

**Status:** ✅ GO. Plan godkjent. Låst til venting på PR-A1.

---

## 8. Leveranse-plan (etter PR-A1 merget)

**Dag 1:** Rebase slot-B på main, les Agent A sin shell-dok + component-API, rapporter denne planen til PM, vent på svar på §7-avklaringer.

**Dag 2–3:** API-wrappers (`api/agent-cash.ts`, `api/agent-shift.ts`) + `BarcodeScanner`-komponent + i18n-nøkler.

**Dag 4–6:** `cash-inout/index` (hovedside m/ 3 tabs) + 4 modaler.

**Dag 7–8:** `sell-ticket`, `sold-tickets`, `product-cart`, `product-checkout`.

**Dag 9:** `cashout-details`, `physical-ticket`, `unique-id-balance`, `register-user-balance`.

**Dag 10:** Test-pass (unit + e2e + visuell), PR-kladd, self-review, screenshots.

**Dag 11–12:** PR-review-feedback, iterasjon, merge.

---

## 9. Filer du IKKE rører (Agent A eier)

Per brief §3: `apps/admin-web/src/shell/**`, `router/**`, `auth/**`, `i18n/**`, `pages/games/**`, `pages/reports/**`, `pages/admin/**`, `pages/cms/**`.

Hvis jeg trenger endring i noen av disse: stopp, meld PM, vent svar.

---

**Status:** Venter på PR-A1 merge. Ingen kode skrevet. Ingen branch opprettet.
