# Legacy Admin-UI → apps/admin-web Parity Audit

**Oppdragsgiver:** Spillorama-eier (krav: 100% visuell + funksjonell 1:1 paritet — hall-ansatte er trent på legacy).
**Dato:** 2026-04-18
**Revisor:** Claude (audit, ingen kodeendringer)
**Grunnlag:** Kun kode-inspeksjon (ingen live-URL-tilgang).

---

## Nøkkeltall (executive summary)

| Mål | Verdi |
|---|---|
| Totalt HTML-templater i legacy | **222** (alle filer), **~207** ekskl. åpenbare backups (`_bkp`, `-old`, `-copy`) |
| Kategori-mapper i `App/Views/` | **40** (inkl. `partition`, `templates`, `templateHtml`, `email`) |
| Toppnivå-sider (registrering/forgot/login osv.) | **~12** løse .html-filer under `App/Views/` rot |
| Sidebar-menyer for admin-rollen | **~20** toppnivå + **~15** submenu-oppføringer |
| Sidebar-menyer for agent-rollen | **~15** toppnivå (permission-gated) |
| Nåværende `apps/admin-web/` | **1 fil** (`index.html` 907 linjer) + **1 JS** (`app.js` 3883 linjer) |
| Seksjoner i nåværende admin-web | **10** (dashboard, game-settings, games, halls, terminals, hall-rules, wallet-compliance, prize-policy, room-control, hall-display) |
| **Legacy-menypunkter som MANGLER helt i ny admin-web** | **~30 av 35** (se §7) |
| **Estimert port-tid (1 agent)** | **~280–420 timer** ≈ **7–10 uker heltid** |

### Topp 5 mest kritiske gaps (for hall-ansatte daglig drift)

1. **cash-inout** (13 templates) — kritisk daglig verktøy for hall-ansatte. Selges billetter, registrerer kontant inn/ut, produkt-kjøp. Helt fraværende i ny admin-web.
2. **player (Spillere)** (25 templates inkl. KYC, BankID, track-spending) — KYC/BankID-flow, godkjenning av pending requests, viewPlayer-detaljer, pengeutbetalingshistorikk. Kun hall-CRUD finnes i ny.
3. **physicalTickets** + `sold-tickets` + `add-physical-tickets` (4 templates + routes) — fysisk billettsalg er kjernevirksomhet i hall; ingen ekvivalent i ny.
4. **TransactionManagement** (3) + **Amountwithdraw** (8 — deposit/withdraw hall/bank + historikk) — økonomi/regnskap flyter her; null dekning i ny.
5. **GameManagement** (10) + **dailySchedules** (6) + **savedGame** (8) + **schedules** (3) + **gameType** (4) — hele spillkatalog-stack'en for å opprette/administrere bingospill. Ny admin har kun "Spillinnstillinger" og "Spillkatalog (andre spill)".

---

## §1 Legacy-struktur (oversikt)

Legacy bruker Nunjucks/Jinja-lignende templates (`{% extends %}`, `{% block body %}`) med AdminLTE 2 (Bootstrap 3.3.7) som theme. Master-layout ligger i `App/Views/partition/layout.html`. Alle admin-sider extender dette.

### Kategori-inventar (sortert etter størrelse)

| # | Mappe | HTML-filer | Beskrivelse |
|---|---|---|---|
| 1 | `player/` | 25 | Spilleradministrasjon: approved/pending/rejected, KYC/BankID, track-spending, game-history, chips-history, login-history, cash-transaction-history, profile, viewPlayer |
| 2 | `report/` | 15 | Rapport per game1–5, hallReport, physicalTicketReport, redFlagCategories, totalRevenueReport, subgame, unique-reports, viewUserTransaction |
| 3 | `cash-inout/` | 13 | Kontant inn/ut for agent: sell_ticket, cashout_details, product_cart, product_checkout, physical-ticket, unique-id-balance, slotmachine-popups, register-user-balance, cashinout-popups |
| 4 | `GameFolder/` | 11 | Gammel spillkatalog — **mest backups** (bkp/old/copy). Kun `addGame.html` + `viewGameDetails.html` aktive |
| 5 | `GameManagement/` | 10 | Game1–5 opprettelse + redigering: gameAdd, gameView, game3Add, game3View, closeDay, mainSubGames, ticketView, viewGameDetails, viewGameTickets |
| 6 | `savedGame/` | 8 | Lagret spillliste (maler): gameAdd, gameView, editSaveGame3, list, game3View (+ bkps) |
| 7 | `CMS/` | 8 | CMS: aboutus, termsofservice, faq/addFAQ, ResponsibleGameing, LinksofOtherAgencies, support, cmsPage |
| 8 | `Amountwithdraw/` | 8 | Utbetalinger: bankRequests, hallRequests, historyBank, historyHall, emails/addEmails, withdrawAmount, withdrawHistory |
| 9 | `otherModules/` | 7 | Tema/bakgrunn/mini-games: theme, background/addBackground, MiniGame, add, view |
| 10 | `partition/` | 6 | **LAYOUT**: layout, head, header, navigation, footer, notification |
| 11 | `loyalty/` | 6 | Lojalitet: list, add, view, viewPlayer, playerLoyalty, test |
| 12 | `dailySchedules/` | 6 | Tidsplan: create, createSpecialSchedules, scheduleGame, view, viewSubgame, editSubgame |
| 13 | `unique/` | 5 | Unique-ID-moduler: add, uniqueList, physicalTicketList, transactions, viewUniqueDetails |
| 14 | `PayoutforPlayers/` | 5 | Utbetaling: payoutPlayers, payoutTickets, view-varianter |
| 15 | `partition/` | 4 (*se ovenfor*) | |
| 16 | `templateHtml/` | 4 | **E-post-maler**: bankid_reminder, forgot_mail, player_notification, email/ |
| 17 | `security/` | 4 | Sikkerhet: security, securityList, blockedIP, addBlockedIP |
| 18 | `payment/` | 4 | Betaling: deposit, deposit-swedbankpay, swedbank-response, verifonePaymentRes |
| 19 | `otherGames/` | 4 | Andre spill: wheelOfFortune, treasureChest, mysteryGame, colordraft |
| 20 | `hallAccountReport/` | 4 | Hall-rapporter: hallAccount, list, settlement |
| 21 | `gameType/` | 4 | Spilltype: list, add, view, test |
| 22 | `GroupHall/` | 4 | Group-of-halls: addGroupHall, groupHallManagement, groupHallView |
| 23 | `subGameList/` | 3 | Sub-games for Game 1: gamelist, add, view |
| 24 | `settings/` | 3 | Innstillinger: settings, maintenance, maintenanceEdit |
| 25 | `schedules/` | 3 | Tidsplan (hoved): schedule, create, view |
| 26 | `role/` | 3 | Rolle-admin: list, add, newEdit |
| 27 | `physicalTickets/` | 3 | Fysiske billetter: add, physicalCashOut, physicalGameTicketList |
| 28 | `patternManagement/` | 3 | Pattern: pattern, addPattern, viewPatternDetails |
| 29 | `admin/` | 3 | Admin-CRUD: admins, add, editRole |
| 30 | `VoucherManagement/` | 3 | Voucher: voucher, voucherAdd, voucherView |
| 31 | `TransactionManagement/` | 3 | Transaksjoner: depositRequests, depositHistory, depositTransaction |
| 32 | `Products/` | 3 | Produktadmin: product-list, category-list, hall-products |
| 33 | `walletManagement/` | 2 | Lommebok: walletManagement, viewWallet |
| 34 | `user/` | 2 | User: user, add |
| 35 | `riskCountry/` | 2 | Risiko-land: riskCountry, add |
| 36 | `orders/` | 2 | Ordre: orderhistory, vieworder |
| 37 | `agent/` | 2 | Agent-liste: agents, add |
| 38 | `LeaderboardManagement/` | 2 | Leaderboard: leaderboard, leaderboardAdd |
| 39 | `Hall/` | 2 | Hall: hallManagement, addHall |
| 40 | `templates/` | 1 | `dashboard.html` — hoved-dashboard |
| 41 | `SystemInformation/` | 1 | `systemInformation.html` |
| 42 | `advertisement/` | 1 | `index.html` — SMS-reklame |

**Løse toppnivå .html i `App/Views/`:** `login.html`, `register.html`, `profile.html`, `index.html` (tom), `404.html`, `forgot-password.html`, `reset-password.html`, `resetPasswordSuc.html`, `playerResetPassword.html`, `importplayer-reset-password.html`, `terms-of-service.html`, `transactionsPaymet.html`, `modal-page.html`, `agentProfile.html`.

### Master-layout (`partition/layout.html`)

27 linjer, ren skjelett som extends = `partition/head.html` + `partition/header.html` + `partition/navigation.html` + `{% block body %}` + `partition/footer.html` + `{% block Jscript %}`.

Body-klasser: `hold-transition skin-blue sidebar-mini` (AdminLTE-skin).

---

## §2 Navigasjons-hierarki (KRITISK — denne er trenings-baseline for ansatte)

Fra `partition/navigation.html` (1548 linjer). Grener forskjellig for admin/super-admin vs. agent (permission-gated).

### A. Admin/super-admin sidebar

1. **Dashboard** — `fa-dashboard` → `/admin`
2. **Player Management** (treeview `fa-bar-chart`)
   - Approved Players → `/player`
   - Pending Requests → `/pendingRequests`
   - Rejected Requests → `/rejectedRequests`
3. **Tracking Player Spending** — `fa-gamepad` → `/players/track-spending`
4. **Game Type** — `fa-gamepad` → `/gameType`
5. **Schedule Management** — `fa-calendar` → `/schedules`
6. **Game Creation Management** — `fa-gamepad` → `/gameManagement`
7. **Saved Game List** — `fa-gears` → `/savedGameList`
8. **Other Games** (treeview `fa-bar-chart`)
   - Wheel of Fortune → `/wheelOfFortune`
   - Treasure Chest → `/treasureChest`
   - Mystery Game → `/mystery`
   - Color Draft → `/colorDraft`
9. **Add Physical Tickets** — `fa-ticket` → `/addPhysicalTickets`
10. **Physical Ticket Management** — `fa-gears` → `/physicalTicketManagement`
11. **Sold Tickets** — `fa-ticket` → `/sold-tickets`
12. **Unique ID Modules** (treeview)
    - Generate Unique ID → `/uniqueId`
    - Unique ID List → `/uniqueIdList`
13. **Other Modules** (treeview) → Theme → `/theme`
14. **Pattern Management** (treeview `fa-paint-brush`) — dynamisk submenu (AJAX `getPatternMenu`)
15. **Admin Management** — `fa-users` → `/adminUser`
16. **Agent Management** — `fa-users` → `/agent`
17. **Hall Management** — `fa-bank` → `/hall`
18. **Group of Halls Management** — `fa-bank` → `/groupHall`
19. **Product Management** (treeview)
    - Product List → `/productList`
    - Category List → `/categoryList`
    - Order History → `/orderHistory`
20. **Role Management** — `fa-users` → `/role`
21. **Report Management** (treeview `fa-bar-chart`)
    - Game 1 → `/reportGame1`
    - Game 2 → `/reportGame2`
    - Game 3 → `/reportGame3`
    - Game 4 → `/reportGame4`
    - Game 5 → `/reportGame5`
    - Hall Specific Reports → `/hallSpecificReport`
    - Physical Ticket → `/physicalTicketReport`
    - Unique Ticket → `/uniqueGameReport`
    - Red Flag Category → `/redFlagCategory`
    - Total Revenue Report → `/totalRevenueReport`
22. **Payout Management** (treeview `fa-google-wallet`)
    - Payout for Players → `/payoutPlayer`
    - Payout for Ticket → `/payoutTickets`
23. **Risk Country** — `fa-users` → `/riskCountry`
24. **Hall Account Report** — `fa-users` → `/hallAccountReport`
25. **Wallet Management** — `fa-credit-card` → `/wallet`
26. **Transactions Management** (treeview `fa-money`)
    - Deposit Request → `/deposit/requests`
    - Deposit History → `/deposit/history`
27. **Withdraw Management** (treeview `fa-user-secret`)
    - Withdraw Request in Hall → `/withdraw/requests/hall`
    - Withdraw Request in Bank → `/withdraw/requests/bank`
    - Withdraw History Hall → `/withdraw/history/hall`
    - Withdraw History Bank → `/withdraw/history/bank`
    - Add Email Account → `/withdraw/list/emails`
28. **Leaderboard Management** — `fa-credit-card-alt` → `/leaderboard`
29. **Voucher Management** — `fa-users` → `/voucher`
30. **Loyalty Management** (treeview `fa-user-secret`)
    - Players Loyalty Management → `/loyaltyManagement`
    - Loyalty Type → `/loyalty`
31. **SMS Advertisement** — `fa-mobile` → `/sms-advertisement`
32. **CMS Management** — `fa-users` → `/cms`
33. **Settings** — `fa-gears` → `/settings`
34. **System Information** — `fa-bar-chart` → `/system/systemInformation`

### B. Agent sidebar (permission-gated — subset)

1. **Dashboard** → `/admin`
2. **Cash In/Out** (treeview, agent only) — `fa-money`
   - Cash In/Out → `/agent/cashinout`
   - Sold Tickets → `/sold-tickets`
3. Player/Tracking/Game/Schedule/Pattern/Product/Report/Payout/Wallet/Voucher/Loyalty — same som admin, gated av `Agent.isPermission`
4. **Physical Cash Out** (agent only) — `fa-ticket` → `/agent/physicalCashOut`
5. **Hall Account Report** (agent: `/hallAccountReportTable/{hallId}`)
6. **Settlement Report** (agent only) — `/report/settlement/{hallId}`
7. **Hall-specific Report** (agent only) — `/hallSpecificReport`

### Ikoner brukt (Font Awesome 4.x)

`fa-dashboard, fa-bar-chart, fa-gamepad, fa-calendar, fa-gears, fa-ticket, fa-paint-brush, fa-users, fa-bank, fa-google-wallet, fa-credit-card, fa-credit-card-alt, fa-money, fa-user-secret, fa-mobile, fa-circle-o, fa-bell-o, fa-angle-left, fa-circle, fa-dashboard, fa-building-o, fa-building, fa-trophy, fa-pencil-square, fa-user-secret`.

### Header-elementer (`partition/header.html`)

- Logo: `logo-mini` = "BG", `logo-lg` = "Bingo Game", bakgrunn `#1a2226`
- Sidebar toggle-knapp
- **Agent-only:** Hall-navn vises i header `{{session.hall[0].name}}` + **Daily Balance** `rootChips` + **Cash In/Out-knapp** (grønn)
- **Notifications bell** (agent) med Deposit Pending + Withdraw Pending-teller
- User dropdown: avatar + navn + profile/logout
- Maintenance mode-badge (navbar farges rød `#ff2105`)
- **Super-admin only:** Gears-ikon → `/settings`

### Sidebar user-panel

Avatar + navn + "Online" med grønn prikk (`fa fa-circle text-success`).

---

## §3 Per-kategori inventar (prioritert først)

**Status-forkortelser:** `EKSISTERER` (dekket), `DELVIS` (noe finnes), `MANGLER` (0%).
**Alle eksisterende referanser er fra `apps/admin-web/index.html` (907 linjer totalt).**

### Login (`login.html`, toppnivå)

| Fil | Formål | Widgets | API | Status i ny |
|---|---|---|---|---|
| `login.html` | Email+passord login | iCheck checkbox "Keep me logged in", eye-toggle, forgot-password link, logo | `POST /admin` | **DELVIS** — ny har email+password-login (`index.html:314-330`), men mangler logo-layout, "Keep me logged in", Forgot-password-link, separate `login-box` skin. |
| `forgot-password.html`, `reset-password.html`, `resetPasswordSuc.html`, `playerResetPassword.html` | Passord-reset-flyt | Forms | `/forgotPassword`, `/resetPassword` | **MANGLER** |
| `register.html` | Registrering | Form | `POST /register` | **MANGLER** |

### admin/ (3 filer)

| Fil | Formål | Widgets | API | Status |
|---|---|---|---|---|
| `admins.html` | Admin-liste | DataTables tabell, edit/delete | `/adminUser` | **MANGLER** |
| `add.html` | Ny admin-form | Form, rolle-select | `POST /adminUser` | **MANGLER** |
| `editRole.html` | Rediger admin-rolle | Form | `/admin/role/:id` | **MANGLER** |

### player/ (25 filer — KRITISK)

| Fil | Formål | Widgets | API | Status |
|---|---|---|---|---|
| `player.html` | Alle spillere-liste | DataTables, KYC-status-badges, filters | `/player` | **MANGLER** |
| `viewPlayer.html` | Spiller-detaljer | Tabs: profile/wallet/games/transactions, BankID-verifikasjon | `/viewPlayer/:id` | **MANGLER** |
| `add.html` | Add spiller manuelt | Form, BankID | `POST /player` | **MANGLER** |
| `profile.html` | Player profile | | | **MANGLER** |
| `playerStatsTest.html` | Stats | Charts | | **MANGLER** |
| `gameHistory.html` + `-old` | Spillhistorikk | DataTable | `/playerGameHistory` | **MANGLER** |
| `loginHistory.html` | Login-historikk | DataTable | `/loginHistory/:id` | **MANGLER** |
| `chipsHistory.html` | Chips-historikk | DataTable | `/chipsHistory/:id` | **MANGLER** |
| `cashTransactionHistory.html` | Cash-transaksjoner | DataTable | `/cashTransactionHistory/:id` | **MANGLER** |
| `ApprovedPlayers/*.html` (7) | Godkjente spillere-views | Forms, DataTables, history-tabs | `/player/approved/:id` | **MANGLER** |
| `PendingRequests/*.html` (2) | Pending KYC | DataTable + viewPending form | `/pendingRequests`, `/approvePlayer/:id` | **MANGLER** |
| `RejectedRequests/*.html` (2) | Avviste | DataTable + view | `/rejectedRequests` | **MANGLER** |
| `bankId/verify.html`, `response.html` | BankID-verifikasjon | iframe/redirect | `/bankid/verify/:id` | **MANGLER** |
| `track-spending/index.html`, `transactions.html` | Spending-sporing (Spillvett) | DataTable, limit-checks | `/players/track-spending` | **MANGLER** (**Spillvett-implikasjon**) |

### cash-inout/ (13 filer — KRITISK for hall-ansatte)

| Fil | Formål | Widgets | API | Status |
|---|---|---|---|---|
| `cash_in-out.html` | Hovedside: kontant inn/ut for agent | Tabs (innskudd/uttak/produkter/billetter), balance-display, scan unique-id | `/agent/cashinout` | **MANGLER** |
| `sell_ticket.html` | Selg billett | Form, printer-integrering, unique-id-gen | `POST /physicalTicket/sell` | **MANGLER** |
| `sold-tickets.html` | Solgte billetter i skift | DataTable | `/sold-tickets` | **MANGLER** |
| `cashout_details.html` | Cash-out detalj-popup | Modal | | **MANGLER** |
| `physical-ticket.html` | Fysisk billett-popup | Modal | | **MANGLER** |
| `product_cart.html` + `product_cart_old.html` | Produkt-handlekurv | Cart-UI, subtotal | | **MANGLER** |
| `product_checkout.html` | Checkout-popup | Payment-select | | **MANGLER** |
| `unique-id-balance.html` | Vis/sett unique-ID-saldo | Form | | **MANGLER** |
| `register-user-balance.html` | Registrer spiller-balanse | Form | | **MANGLER** |
| `slotmachine-popups.html` | Slot-machine-knytning | Modal | | **MANGLER** |
| `cashinout-popups.html` | Generelle popups | Modals | | **MANGLER** |
| `add-withdraw-user-popup.html` | Add withdraw-bruker | Modal | | **MANGLER** |

### dailySchedules/ (6 filer)

| Fil | Formål | API | Status |
|---|---|---|---|
| `scheduleGame.html` | Planlegg spill | `/dailySchedules` | **MANGLER** |
| `create.html`, `createSpecialSchedules.html` | Opprett | `POST /dailySchedule` | **MANGLER** |
| `view.html`, `viewSubgame.html`, `editSubgame.html` | Vis/rediger subgame | | **MANGLER** |

### GameManagement/ (10 filer)

| Fil | Formål | API | Status |
|---|---|---|---|
| `game.html` | Liste: alle spill | `/gameManagement` | **MANGLER** (men `section-games` dekker delvis "andre spill") |
| `gameAdd.html` | Add spill (Game 2) | `POST /gameManagement` | **MANGLER** |
| `game3Add.html` | Add Game 3 | | **MANGLER** |
| `gameView.html`, `game3View.html` | Vis spill | | **MANGLER** |
| `mainSubGames.html` | Sub-games Game 1 | | **MANGLER** |
| `viewGameDetails.html`, `viewGameTickets.html`, `ticketView.html` | Spill-detalj + billetter | `/viewGameDetails/:id` | **MANGLER** |
| `closeDay.html` | Dag-avslutning | `POST /closeDay` | **MANGLER** |

### savedGame/ (8 filer, ~4 backups)

| Fil | Formål | Status |
|---|---|---|
| `list.html` | Lagret spilliste (maler) | **MANGLER** |
| `gameAdd.html`, `gameView.html`, `editSaveGame3.html`, `game3View.html` | CRUD | **MANGLER** |

### physicalTickets/ (3 filer)

| Fil | Formål | API | Status |
|---|---|---|---|
| `add.html` | Add fysisk billett | `POST /addPhysicalTickets` | **MANGLER** |
| `physicalGameTicketList.html` | Liste fysiske billetter | `/physicalTicketManagement` | **MANGLER** |
| `physicalCashOut.html` | Fysisk cash-out (agent) | `/agent/physicalCashOut` | **MANGLER** |

### Products/ (3 filer)

| Fil | Formål | Status |
|---|---|---|
| `product-list.html` | Produkt-liste | **MANGLER** |
| `category-list.html` | Kategorier | **MANGLER** |
| `hall-products.html` | Hall-spesifikke produkter | **MANGLER** |

### report/ (15 filer)

| Fil | Formål | Widgets | Status |
|---|---|---|---|
| `game1reports.html`–`game5reports.html` (5) | Per-spill rapport | DataTable + date-range | **DELVIS** — `section-dashboard` har "Per-spill statistikk"-tabell (`index.html:420-435`), men mangler per-spill-drilldown |
| `game1History.html`–`game3History.html` (3) | Historikk | DataTable | **MANGLER** |
| `hallReport.html` | Hall-rapport | Aggregater, charts | **DELVIS** — `reportRangeTable` finnes |
| `physicalTicketReport.html` | Fysisk billettrapport | | **MANGLER** |
| `redFlagCategories.html` | Red-flag-rapport | DataTable | **MANGLER** |
| `totalRevenueReport.html` | Total omsetning | | **MANGLER** |
| `subgame1reports.html`, `unique1reports.html` | Submodul-rapporter | | **MANGLER** |
| `viewUserTransaction.html` | Brukertransaksjon | | **MANGLER** |

### Amountwithdraw/ (8 filer)

| Fil | Formål | Status |
|---|---|---|
| `hallRequests.html` | Uttak i hall | **MANGLER** |
| `bankRequests.html` | Uttak til bank | **MANGLER** |
| `historyHall.html`, `historyBank.html` | Uttakshistorikk | **MANGLER** |
| `withdrawAmount.html`, `withdrawHistory.html` | Uttaks-CRUD | **MANGLER** |
| `emails.html`, `addEmails.html` | E-postlister for notify | **MANGLER** |

### hallAccountReport/ (4 filer)

| Fil | Formål | Status |
|---|---|---|
| `hallAccount.html` | Admin: alle halls | **MANGLER** |
| `list.html` | Per-hall-liste | **MANGLER** |
| `settlement.html` | Oppgjør per hall | **MANGLER** |

### walletManagement/ (2 filer)

| Fil | Formål | Status |
|---|---|---|
| `walletManagement.html` | Wallet-liste | **MANGLER** |
| `viewWallet.html` | View wallet | **MANGLER** (ny har `section-wallet-compliance` som er annet konsept) |

### TransactionManagement/ (3 filer)

| Fil | Formål | API | Status |
|---|---|---|---|
| `depositRequests.html` | Deposit-forespørsler | `/deposit/requests` | **DELVIS** — ny har payment-request i app.js, men UI ikke 1:1 |
| `depositHistory.html` | Deposit-historikk | `/deposit/history` | **MANGLER** |
| `depositTransaction.html` | Transaksjon-detalj | | **MANGLER** |

### SystemInformation/ (1 fil)

| Fil | Formål | Status |
|---|---|---|
| `systemInformation.html` | CPU/minne/load/uptime | **MANGLER** |

---

## §4 Master-template-analyse

### CSS / framework

- **Bootstrap 3.3.7** (CDN `/vendors/bower_components/bootstrap/dist/css/bootstrap.min.css`)
- **AdminLTE v2.x** (`/dist/css/AdminLTE.min.css` + `/dist/css/AdminLTE.css`)
- **Skin:** `skin-blue` (`/dist/css/skins/_all-skins.min.css`)
- **Font Awesome 4.x** (`/vendors/bower_components/font-awesome`)
- **Ionicons** (`/vendors/bower_components/Ionicons`)
- **jvectormap, bootstrap-datepicker, daterangepicker, bootstrap3-wysihtml5, sweetalert, DataTables (bs3), Select2 4.0.10, bootstrap-clockpicker, bootstrap-datetimepicker, toastr**

### Farge-scheme (AdminLTE skin-blue standard)

- **Primær (navbar/header-bg):** `#367fa9` (hovedmørk blå) / `#3c8dbc` (lys)
- **Sidebar-bg:** `#222d32` (mørk grå/sort)
- **Sidebar-active:** `#1e282c`
- **Logo-bg:** `#1a2226` (eksplisitt satt inline)
- **Accent:** grønn `#00a65a` (success), gul `#f39c12` (warning), rød `#dd4b39` (danger), lys blå for info
- **Maintenance-mode:** `#ff2105` (rød override på navbar)
- **Notification-bell-header:** `#3c8dbc` hvit tekst
- Box-variants: `.box-danger` (rød header), `.box-info` (blå), `.box-primary`, `.box-default`

### Font

- **Google Font**: `Source Sans Pro` (weights 300, 400, 600, 700 + italics)

### Layout

- **Sidebar-bredde:** 230px (AdminLTE standard), collapse 50px (`.sidebar-mini`)
- **Header-høyde:** 50px
- **Layout-klasse:** `hold-transition skin-blue sidebar-mini`
- **Content wrapper:** `.content-wrapper` (fleksibel, fyller resten)
- **Breadcrumb:** `.content-header` med `<h1>` + `.breadcrumb ol`
- **Footer:** `.main-footer` — versjon høyre, copyright venstre

### Responsive breakpoints

- Bootstrap 3.3.7 standard: `xs <768`, `sm 768`, `md 992`, `lg 1200`
- Sidebar collapser til hamburger < 768px

### JS-stack

- jQuery 3 (`/vendors/bower_components/jquery/dist/jquery.min.js`)
- Bootstrap.min.js
- iCheck (form-controls)
- jquery-form-validator 2.3.26
- DataTables + bs3-integration
- SweetAlert
- Select2
- Socket.io 2.2.0 (CDN + `/socket.io/socket.io.js`)
- Moment.js (implisit i datoformatering)
- Chart.js (doughnut + line chart på dashboard)
- toastr

### Templating

- **Nunjucks/Twig-lignende:** `{% extends %}`, `{% block %}`, `{% include %}`, `{% if %}`, `{% for %}`
- I18n via `{{dashboardTraslate.KEY}}`, `{{navigation.KEY}}` — peker til translation-objekter

---

## §5 Kritiske widgets for dashboard (fra `templates/dashboard.html`, 1432 linjer)

Dashboard dekker både admin og agent (conditional via `session.role`).

### Kort (info-boxes) — toppseksjon

1. **"Totalt antall godkjente spillere"** — `fa-users` ikon, blå (`bg-blue`). Klikkbar → `/player`. Gated på `Players Management`-permission.
2. **(admin) "Totalt antall aktive agenter"** — `fa-user-secret`, blå. Format: `{activeAgents}/{agentCount}`.
3. **(admin) "Totalt antall aktive grupper-av-haller"** — `fa-building`, gul. Format: `{activeGroupHalls}/{totalGroupHall}`.
4. **(admin) "Totalt antall aktive haller"** — `fa-building`, grønn. Format: `{activeHalls}/{totalHall}`.

Flere info-bokser er kommentert ut (total tickets sold, games played, per-game player counts) — **finnes i kode, men deaktiverte**.

### Center-column

5. **"Siste forespørsler"-tabell** (`box-danger`). Kolonner: Username, Email, Hall, Agents (admin), Requested Date/Time. Badge `totalPendingRequest`. CTA: "Vis alle pending requests" → `/pendingRequests`.

### Right-column

6. **"Topp 5 spillere"-widget** (`box-danger`). `ul.users-list` med bilde + username + walletAmount (Kr). Gated på Players Management.

### Full-width-tabs

7. **"Pågående spill" (Ongoing Games) tabbed-tabell** (`box-info`) — 5 tabs: Game 1, **Game 2** (default active), Game 3, Game 4, Game 5.
   - **Game 1 (dailySchedule):** `dailyScheduleId`, startEndDate, groupHalls, masterHall
   - **Game 2:** gameNumber, gameName, start, end, luckyNumberPrize, notificationStartTime, groupOfHalls (select-dropdown), seconds, minTicketCount, status
   - **Game 3:** gameNumber, gameName, startEndDate, groupOfHalls, status
   - **Game 4:** (like Game 2 + ticketPrice)
   - **Game 5:** gameNumber, startDate, halls, seconds, earnedFromTickets, status
   - Data via `GET /dashboard/ongoingGames/myGameN` + DataTables
   - CTA: "View all game" → `/gameManagement`

### Deaktivert-men-finnes-i-kode

- Platform-pie (Android/iOS/Other) — endpoint `/dashboardChart/getGameUsageChart` (aktiv canvas-logikk i JS, men `<canvas>` er kommentert)
- Monthly-played-game line chart — `/dashboardChart/getMonthlyPlayedGameChart`
- Live memory usage chart (socket.io `live_memory`-event) — helt kommentert ut
- Dashboardchart "game usage"-doughnut med Android/iOS/Other-prosent

### Socket-events

- Namespace `/admin`, event `getWithdrawPenddingRequest` (sjekker pending withdraws) — popper SweetAlert "Pending Deposit Request".

### Ny admin-web dashboard (eksisterende dekning)

`apps/admin-web/index.html:352-477` har:
- Live-totals (halls, rooms, active rooms, players) — annen innfallsvinkel
- Per-hall-kort med rom-status
- Finansiell rapport (date-range + totaler + tabell + enkel bar-chart)
- Per-spill statistikk-tabell
- Auto-refresh 10s polling

**Gap:** mangler "Top 5 players", "Latest requests"-tabell, "Ongoing games tabbed 1–5", aggregat-kort for spillere/agenter/haller som topp-rad.

---

## §6 Shift-login-flyt (agent)

**Funn:** Legacy har IKKE en eksplisitt "shift-start-dialog" eller hall-velger ved innlogging. Modellen er:

- **Agent har ett (eller flere) `hall`-objekt tilknyttet** (`Agent.hall[0]` brukes overalt i templates)
- Ved login (`POST /admin` i `login.html:49`) autentiseres agent mot sin faste hall(er)
- `session.hall[0].name` og `session.hall[0].id` vises konstant i header (`header.html:21`)
- `session.dailyBalance` vises i header som "Daily Balance [ X.XX ]" (`header.html:31-38`)
- **Ingen eksplisitt `startShift`/`endShift`-event funnet i templates** — "shift" i template-matches refererer til tid-shifts (S/M/L-slot i spill-scheduling), ikke arbeidsskift.
- "Cash In/Out"-knapp i header (`header.html:42`) → `/agent/cashinout` fungerer som dagens aktive skift-sesjon
- `dailyBalance` fungerer de facto som "balanse-ved-start-av-arbeidsdag"

### Implikasjon for ny admin-web

Hvis eier har bedt om "shift-basert login" som eksplisitt feature, er det en **ny feature** (ikke i legacy). Legacy's modell = `agent.hall` er fast tilknyttet; `dailyBalance` resettes daglig.

Hvis eier mente "hall-basert scoping" (agent ser kun sin egen hall), så er det allerede lagacy-baseline (ligger implisitt i `session.hall[0]` og backend-scoping).

**Anbefaling:** Bekreft med eier om "shift" = Spillorama-ny-konsept eller = legacy `dailyBalance`-pattern. Dette er et risikopunkt.

**Nåværende admin-web:** har ingen hall-velger ved login (`index.html:314-330` har kun email+password), og ingen active-shift-indikator i header.

---

## §7 Paritets-gap-matrise

| Funksjonsområde | Legacy (#sider) | Ny admin-web (status) | Est. port-timer |
|---|---|---|---|
| **Login + auth** (login, forgot-password, reset, register) | 6 | DELVIS (kun basic-login) | 8–12 |
| **Dashboard (admin)** | 1 (1432 linjer) | DELVIS (annen layout) | 20–30 |
| **Player Management** (approved/pending/rejected + KYC/BankID/history/track-spending) | 25 | MANGLER | 50–80 |
| **cash-inout (agent)** | 13 | MANGLER | 40–60 |
| **Daily Schedules** | 6 | MANGLER | 14–20 |
| **Game Management** (game 1–5 CRUD + subgames + closeDay + tickets) | 10 | DELVIS (kun "andre spill"-seksjon) | 30–45 |
| **Saved Game List** | 8 | MANGLER | 14–20 |
| **Schedules** (hoved) | 3 | MANGLER | 6–10 |
| **Game Type** | 4 | MANGLER | 6–10 |
| **Other Games** (wheel/treasure/mystery/colordraft) | 4 | DELVIS (games-seksjon) | 12–18 |
| **Physical Tickets** (add/manage/cashOut) | 3 | MANGLER | 14–20 |
| **Sold Tickets** | 1 (rute) | MANGLER | 4–6 |
| **Unique ID Modules** | 5 | MANGLER | 10–14 |
| **Other Modules** (theme/background/mini-game) | 7 | DELVIS | 8–12 |
| **Pattern Management** (dynamisk sub-menu) | 3 | MANGLER | 10–14 |
| **Admin CRUD** (3) | 3 | MANGLER | 8–12 |
| **Agent CRUD** (2) | 2 | MANGLER | 8–12 |
| **Hall Management** | 2 | EKSISTERER (hall CRUD) | 2–4 (polish) |
| **Group of Halls** | 4 | MANGLER | 10–14 |
| **Products** (product/category/hall-products) | 3 | MANGLER | 12–18 |
| **Orders** | 2 | MANGLER | 4–6 |
| **Role Management** | 3 | MANGLER | 8–12 |
| **Report Management** (5 games + hall + physical + unique + redFlag + totalRevenue) | 15 | DELVIS (enkel rapport) | 40–60 |
| **Payout for Players / Tickets** | 5 | MANGLER | 12–18 |
| **Risk Country** | 2 | MANGLER | 4–6 |
| **Hall Account Report** (list + settlement) | 4 | MANGLER | 12–18 |
| **Wallet Management** | 2 | DELVIS (compliance, ikke wallet-liste) | 8–12 |
| **Transactions Management** (deposit req/history) | 3 | DELVIS (payment-request) | 10–14 |
| **Withdraw Management** (hall/bank req + hist + emails) | 8 | MANGLER | 20–30 |
| **Leaderboard Management** | 2 | MANGLER | 6–10 |
| **Voucher Management** | 3 | MANGLER | 8–12 |
| **Loyalty Management** (player + type) | 6 | MANGLER | 14–20 |
| **SMS Advertisement** | 1 | MANGLER | 4–6 |
| **CMS Management** (8 statiske sider + FAQ) | 8 | MANGLER | 14–20 |
| **Settings** (incl. maintenance-mode) | 3 | DELVIS | 6–10 |
| **System Information** | 1 | MANGLER | 4–6 |
| **Security** (blocked IPs) | 4 | MANGLER | 8–12 |
| **Payment integrations** (Swedbank/Verifone callbacks) | 4 | N/A (backend) | 0 |
| **Agent Profile / Profile** | 2 | MANGLER | 4–6 |
| **Email templates** | 4 | N/A (backend) | 0 |
| **Voucher, Leaderboard, Loyalty, Subgame-list, Advertisement** restbank | — | MANGLER | se over |
| **Shared: sidebar + header + layout + AdminLTE-skin** | 1 | MANGLER (må portes som tema) | 30–50 |
| **Shared: DataTables, SweetAlert, Select2, datepicker, toastr integration** | — | MANGLER | 16–24 |
| **I18n (navigation + 50+ translation-objekter)** | — | MANGLER (ny har norsk hardcoded) | 20–30 |

**Subtotal (absolutte tall):** **ca. 500–720 timer** i ren portering.

**Realistisk kalender-estimat med 20% overhead (testing, review, iterasjon):**
- **1 agent heltid (40t/uke):** 15–21 uker (~4–5 mnd)
- **2 agenter parallelt (80t/uke):** 8–11 uker (~2–3 mnd)
- **3 agenter parallelt (120t/uke):** 6–8 uker (~1.5–2 mnd) — men øker koordineringskost

---

## §8 Anbefalinger

### Port-strategi

**To valg:**

#### Alternativ A — "Skin-port": porter legacy CSS 1:1, bytt ut kun backend-koblinger

- Kopier `/dist/css/AdminLTE.*`, `skin-blue`, Font Awesome, Bootstrap 3.3.7 into `apps/admin-web/public/`
- Portere `partition/layout.html` + `navigation.html` + `header.html` som master-shell (Nunjucks-syntax → vanlig HTML med JS-render)
- Per side: kopier markup 1:1, erstatt `{{variable}}` med data fra nye `/api/admin/*`- og `/api/agent/*`-endpoints
- **Fordeler:** raskest, pixel-perfect, ansatte merker ingen forskjell
- **Ulemper:** holder på Bootstrap 3 (EOL sikkerhet), jQuery, AdminLTE (maintenance legacy), vanskelig å evolve videre
- **Est:** 400–500 timer (raskere via 1:1-kopi)

#### Alternativ B — "Rebuild in modern framework with identical look"

- Bygg React/Svelte/Vue-app som importerer AdminLTE som CSS-only, gjenskap strukturene
- **Fordeler:** moderne baseline, type-safe, vedlikeholdbart
- **Ulemper:** 30–50% mer arbeid, risiko for visuelle avvik
- **Est:** 600–800 timer

**Anbefaling:** **Alternativ A** for 1:1-paritetskrav. Ansatte vet ikke at det er "samme" før det faktisk *er* samme pixler. Modernisering kan fases inn etter at systemet er i drift.

### Bemanning

| Modell | Uker | Fordeler | Ulemper |
|---|---|---|---|
| **1 agent heltid** | 15–21 | Enkel koordinering, konsistent stil | Lang tid; hall-drift står fortsatt på legacy så lenge |
| **2 agenter parallelt** | **8–11** | **Anbefalt balanse**; én agent kan ta "shell/nav/layout", annen "per-kategori-sider" | Krever daglig standup, stylguide opfront |
| **3 agenter parallelt** | 6–8 | Raskest | 20–30% tidstap på koordinering; risiko for divergens i stil |

**Anbefaling: 2 agenter**. Agent A eier shell + navigation + dashboard + layout/theme/i18n i første PR-batch. Agent B starter straks med cash-inout + player (de to største hall-kritiske områdene) parallelt.

### Hva kan droppes / utsettes (lav prio)

- `GameFolder/` — 80% er backups (`_bkp`, `-old`, `-copy`). Skal ikke portes.
- `savedGame/list copy.html`, `gameView_bkp.html` osv. — backups.
- `playerStatsTest.html`, `test.html` (gameType/otherModules) — test-filer.
- `security/blockedIP` — lav-frekvens admin, kan fase 2
- `CMS/` (aboutus/FAQ/terms) — statisk innhold, kan portes sist eller serveres fra backend
- `SystemInformation/` — kun super-admin, lav-frekvens
- `advertisement/index.html` — SMS-reklame, lav prio
- `riskCountry/` — country-list-CRUD, lav prio
- `orders/vieworder.html` — lav-frekvens
- `subGameList/` — allerede dekket via Game-edit-modals
- Deaktiverte charts i dashboard (memory/platform/monthly) — kommentert ut; skal *ikke* re-enables

### Styling-tilnærming

**Porter CSS 1:1** (Alternativ A). Konkret:
1. Kopier `legacy/unity-backend/public/dist/` (AdminLTE) og `vendors/bower_components/` (Bootstrap/FA/Ionicons/DataTables/Select2 etc.) til `apps/admin-web/public/legacy-skin/`
2. Lag ny shell-template `apps/admin-web/shell.html` som reproduserer `partition/layout.html`-strukturen
3. Per side: ren kopi av legacy-HTML, transformer til client-side-rendering via vanilla JS eller alpine.js (for å matche lavt-JS-footprint)
4. Replace `{{Agent.isPermission}}` / `{{session.role}}` med JS-guards basert på auth-state fra `/api/admin/me` eller `/api/agent/me`

---

## §9 Anbefalt første PR

### Scope

**PR-1: "Legacy shell + sidebar + navigation + auth-guard"**

Mål: en tom side som viser legacy-sidebar, header, footer, og routing-skelett — uten innhold.

### Filer som legges til

```
apps/admin-web/
├── public/
│   └── legacy-skin/
│       ├── css/AdminLTE.min.css         # kopi fra legacy/unity-backend/public/dist/css/
│       ├── css/skins/skin-blue.min.css
│       ├── css/bootstrap.min.css        # BS 3.3.7
│       ├── css/font-awesome.min.css
│       ├── css/ionicons.min.css
│       ├── fonts/                       # FA + Ionicons fonts
│       ├── js/app.min.js                # AdminLTE JS
│       ├── js/jquery.min.js
│       └── js/bootstrap.min.js
├── shell/
│   ├── layout.html                      # reproduserer partition/layout.html
│   ├── header.html                      # reproduserer partition/header.html (ikke agent-felt enda)
│   ├── navigation.html                  # FULL admin+agent-hierarki (34 menypunkter), lenker peker til `#/placeholder-X`
│   ├── footer.html
│   └── i18n.no.json                     # alle `navigation.*` og `dashboardTraslate.*`-strenger på norsk
├── src/
│   ├── router.js                        # enkel hash-based router for `/admin/*` + `/agent/*`
│   ├── auth.js                          # login + session-guard (port fra eksisterende app.js)
│   └── render.js                        # render-shell + active-menu-highlight
└── index.html                           # booter shell, viser login først, deretter shell+tom body
```

### Akseptansekriterier for PR-1

- [ ] Login-side matcher `legacy/unity-backend/App/Views/login.html` pixelnært (logo, "Sign in to Start Your Session", iCheck-checkbox, forgot-password-link)
- [ ] Etter login: shell rendres med `skin-blue sidebar-mini` body-klasse
- [ ] Sidebar viser hele 34-menypunkts-hierarki for admin (eller subset-menyen for agent, basert på `session.role`)
- [ ] Header viser: logo "BG"/"Bingo Game", avatar+navn, logout-link
- [ ] Hver sidebar-link peker til `#/placeholder-<kategori>` som viser "Kommer snart" (ingen funksjonalitet enda)
- [ ] I18n: alle tekster hentes fra `i18n.no.json` (ingen hardcoded)
- [ ] Active-menu-state fungerer når URL endres
- [ ] Ingen regresjon i eksisterende `apps/admin-web/`-funksjoner (game-settings, halls, terminals osv.) — disse kan levere parallellt i ny shell

### Etter PR-1 (reihenfolge)

1. **PR-2:** Dashboard (templates/dashboard.html) 1:1 — info-bokser, siste requests-tabell, topp-5-spillere, ongoing-games-tabs.
2. **PR-3:** Player Management (alle 25 player/-filer)
3. **PR-4:** cash-inout (13 filer)
4. **PR-5:** Game Management + savedGame + dailySchedules + schedules (sammen, 27 filer)
5. **PR-6:** Reports (15 filer)
6. **PR-7:** Amountwithdraw + TransactionManagement + walletManagement (13 filer)
7. **PR-8:** Resten (admin/agent/role/hall/product/CMS/settings/security/loyalty/voucher/leaderboard/etc.)

---

## Flagg / risikoer

- **Shift-konsept:** §6 viser at legacy ikke har eksplisitt shift-flyt. Bekreft eier-intensjon før PR-1.
- **Bootstrap 3 EOL:** Skin-port (Alt A) holder på EOL-stack. Hvis dette er showstopper, velg Alt B og dobbelt-sjekk timer.
- **I18n:** Legacy bruker server-side translation-objekter (`{{navigation.xxx}}`). Ny admin må porte *alle* strenger — anslagsvis 300–500 unike nøkler. Dette er i `node_modules` eller et i18n-katalog i backend som må finnes og flyttes (ikke gransket i denne audit).
- **`apps/admin-web/app.js` har 3883 linjer** med game-settings/halls/terminals/wallet-compliance/prize-policy/room-control/dashboard/hall-display. Disse 10 seksjonene dekker **ingen** legacy-ekvivalent direkte — de er NYE Spillorama-features (live-rom, TV-display, wallet-compliance for pengespillforskriften). Disse skal **beholdes** som separate seksjoner i shell'en, ikke byttes ut.
- **Permission-system:** Legacy har `Agent.isPermission['X']['view'/'add'/'edit']`-struktur som styrer både sidebar og CRUD-knapper. Ny admin-web har enklere auth. Paritets-port må implementere dette permission-systemet i frontend-guards.
- **"222 sider"-nummeret er misvisende:** ~15% er backups/old-filer som ikke skal portes. Reell port-overflate er **~170–190 sider**.

---

**Rapport slutt.**
