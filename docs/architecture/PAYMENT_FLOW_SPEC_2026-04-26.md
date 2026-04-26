# Payment Flow Spec — 2026-04-26

**Forfatter:** Agent PAYMENT-RESEARCH
**Status:** RESEARCH-ONLY — krever PM-beslutning før implementering
**Scope:** Deposit + Withdraw end-to-end flyter for Spillorama Live Bingo (norsk regulert pengespill)
**Pilot:** ~6 uker unna (medio juni 2026)

---

## TL;DR for PM

Spillorama har **40% wireframe-coverage** på Deposit/Vipps/Card-modulen (per `WIREFRAME_BACKEND_REQUIREMENTS_2026-04-25.md` §4). Vi har bygget hele Pay-in-Hall + admin-approve-queue + Swedbank Pay top-up + Withdraw XML-eksport. Men:

- **Vipps fungerer IKKE** — ingen Vipps-integrasjon i kodebasen (kun en test-streng "Via Vipps").
- **Card-betaling går via Swedbank Pay Checkout 3.1**, men er ikke koblet i admin-flyt 1:1 med wireframe (PDF 16 §16.16 spec'r dedikert "Vipps/Card auto-approved" admin-kø — ikke implementert).
- **Withdraw til bank** krever XML-eksport (ferdig), men selve **bank-payout via Swedbank Pay Payout** er ikke vurdert.
- **3DS / SCA / PSD2-håndtering** er delvis dekket av Swedbank Pay Checkout, men kun for top-up — ikke for bank-uttak.

**Tre PM-beslutninger må tas før kode kan starte** (se §6). Estimert dev-tid: **0–14 dev-dager** avhengig av valg.

---

## §1. Hva legacy gjør (wireframe PDF 9 + 10 + 16)

### 1.1 PDF 9 — Auth + profil-flyt (innskudd-kontekst)
- **Multi-method login** (email/username/phone) + remember-me + 2FA for høy-saldo (REQ-129/130).
- 90-dagers passord-rotasjon + active-sessions-list (REQ-131/132).
- **Ingen direkte payment-flyt** i PDF 9, men setter rammen for sesjonen som beskytter alle wallet-operasjoner.

### 1.2 PDF 10 — "Deposit & Withdraw" (19 sider, 2024-03-18)

| Skjerm | Innhold | Eksisterer? |
|---|---|---|
| **10.1 Deposit Request — Pay in Hall** | Player ber om kontant-innskudd → agent bekrefter mottak → wallet kreditt. Min 100 NOK / Maks 50 000 NOK / instant. | ✅ Implementert (`POST /api/payments/deposit-request` + admin-approve) |
| **10.2 Deposit Request — Vipps/Card** | Multi-step: Amount (100/250/500/1000/2500 + custom) → Method (Vipps/Visa/Mastercard/Apple Pay/Google Pay) → Confirm. Card auto-charged, Vipps venter på phone-bekreftelse. Fee: 0%. Email/SMS confirm. | 🟡 Kun Swedbank Pay Checkout (gir Vipps + kort, men UI-flyt mangler). |
| **10.3 Deposit History** | Tabell: Date/Amount/Method/Status/Balance After/Confirmation ID. 7-års retensjon. | 🟡 Backend-endpoint finnes; admin-UI har `DepositHistoryPage.ts`; player-side mangler. |
| **10.4 Withdraw in Hall** | Player ber om kontant-uttak → agent validerer ID → instant. Min 50 NOK / Maks balance. | ✅ Implementert (`POST /api/payments/withdraw-request` med `destinationType=hall`) |
| **10.5 Withdraw in Bank** | Player oppgir IBAN + holder-name + bank-name → 2FA-validering → 1–2 dager prosess. Min 500 NOK. **IBAN ↔ holder-name match-validering + AML-fraud-check**. | 🟡 XML-eksport-pipeline ferdig (`WithdrawXmlExportService.ts:206–247`); 2FA + IBAN-match + AML ikke verifisert. |
| **10.6 Withdraw History** | Tabell + status-tracking + cancel-pending. | 🟡 Admin-side ferdig (`amountwithdraw/`); player-side mangler. |

### 1.3 PDF 16 — Admin V1.0 (13.09.2024) — Deposit/Withdraw-admin-flyt
- **§16.15 Deposit Request — Pay in Hall**: Admin-approval-queue med Action-knapper (✓/✗) + confirm-popup. Filter på Type (Pay in Hall/Vipps/Card). CSV/Excel-eksport. ✅ Implementert.
- **§16.16 Deposit Request — Vipps/Card**: Tilsvarende, men **uten Action-kolonne** (auto-approved). 🔴 Ikke implementert som dedikert admin-vy.
- **§16.17–18 Deposit History — Pay in Hall + Vipps/Card** med `Transaction ID`-kolonne. 🟡 Delvis implementert.
- **§16.19 Withdraw in Hall**: Admin queue med Approve/Reject. ✅ Implementert.
- **§16.20 Withdraw in Bank — XML Export**: Daglig morgen-cron genererer XML-fil per agent (alle haller samlet) → e-post til regnskap-allowlist. ✅ Implementert (PR #456).
- **§16.21 Withdraw History** med dropdown-filter: Withdraw in Hall vs Bank. 🟡 Kun admin-side delvis.

---

## §2. Hva vi har på prod nå

### 2.1 Kode-inventar

| Komponent | Filer | Lines | Status |
|---|---|---|---|
| `SwedbankPayService` | `apps/backend/src/payments/SwedbankPayService.ts` | 1047 | ✅ Top-up via Checkout 3.1, callback-flow, reconcile, status-tracking |
| `swedbankSignature` | `apps/backend/src/payments/swedbankSignature.ts` | 77 | ✅ HMAC-SHA256 (BIN-603) |
| `swedbankPaymentSync` cron | `apps/backend/src/jobs/swedbankPaymentSync.ts` | 105 | ✅ Hourly reconcile av pending intents (24h vindu) |
| `PaymentRequestService` | `apps/backend/src/payments/PaymentRequestService.ts` | 679 | ✅ Pay-in-Hall + Withdraw-Hall + Withdraw-Bank-pipeline |
| `payments.ts` router | `apps/backend/src/routes/payments.ts` | 145 | ✅ 4 endpoints (topup-intent, confirm, GET intent, callback) |
| `paymentRequests.ts` router | `apps/backend/src/routes/paymentRequests.ts` | 347 | ✅ 5 endpoints (admin list/accept/reject + player deposit/withdraw) |
| `WithdrawXmlExportService` | `apps/backend/src/admin/WithdrawXmlExportService.ts` | ~700 | ✅ XML-build + email-send via `AccountingEmailService` |
| `xmlExportDailyTick` cron | `apps/backend/src/jobs/xmlExportDailyTick.ts` | ~115 | ✅ Daglig 23:00 cron |
| Admin-UI: deposits/withdraws | `apps/admin-web/src/pages/transactions/`, `apps/admin-web/src/pages/amountwithdraw/` | — | ✅ DepositRequestsPage, DepositHistoryPage, WithdrawXmlExportPage |

### 2.2 Database-tabeller

```
app_deposit_requests             — Pay-in-Hall queue (PENDING/ACCEPTED/REJECTED)
app_withdraw_requests            — Withdraw-Hall + Withdraw-Bank queue
                                   (PENDING/ACCEPTED/REJECTED/EXPORTED)
                                   Kolonner: bank_account_number, bank_name,
                                   account_holder, exported_xml_batch_id,
                                   destination_type ('bank' | 'hall')
swedbank_payment_intents         — Top-up intents (Swedbank Pay Checkout 3.1)
                                   Statuser: CREATED/PAID/CREDITED/FAILED/CANCELLED
app_xml_export_batches           — XML-eksport-batcher (én rad per cron-kjøring)
app_accounting_emails            — Allow-list for XML-mail-mottakere
```

### 2.3 API-endpoints (eksisterende)

```
# Player
POST   /api/payments/swedbank/topup-intent      [Auth]   amount → SwedbankIntent + redirectUrl
POST   /api/payments/swedbank/confirm           [Auth]   intentId → reconcile + wallet credit
GET    /api/payments/swedbank/intents/:id       [Auth]   ?refresh=1 → re-reconcile
POST   /api/payments/swedbank/callback          [HMAC]   webhook → reconcile + wallet credit
POST   /api/payments/deposit-request            [Auth]   amountCents, hallId → PENDING
POST   /api/payments/withdraw-request           [Auth]   amountCents, hallId, destinationType → PENDING

# Admin / Hall-operator (RBAC: PAYMENT_REQUEST_READ/WRITE)
GET    /api/admin/payments/requests             ?type=&status=&hallId=&destinationType=
POST   /api/admin/payments/requests/:id/accept  body: { type }
POST   /api/admin/payments/requests/:id/reject  body: { type, reason }

# XML-eksport
GET    /api/admin/withdraw-xml/...              (4 endpoints, full pipeline)
```

### 2.4 Env-variabler

| Variable | Status | Note |
|---|---|---|
| `SWEDBANKPAY_PAYEE_ID` / `_TOKEN` / `_PAYEE_NAME` | Definert i `render.yaml` | ✅ |
| `SWEDBANKPAY_PAYMENT_API_URL` | `render.yaml` | ✅ Default: `api.externalintegration.payex.com` (sandbox) |
| `SWEDBANKPAY_HOST_URLS` / `_COMPLETE_URL` / `_CANCEL_URL` / `_CALLBACK_URL` | `render.yaml` | ✅ |
| `SWEDBANK_WEBHOOK_SECRET` | (BIN-603) | ✅ Fail-closed på 503 hvis ikke satt |
| `VIPPS_API_KEY` / `_CLIENT_ID` / `_CLIENT_SECRET` | 🔴 EKSISTERER IKKE | Vipps-integrasjon ikke startet |
| `EXTERNAL_PAYOUT_*` (Swedbank Payout) | 🔴 EKSISTERER IKKE | Bank-payout via Swedbank ikke vurdert |

---

## §3. Wireframe-krav per REQ-ID

| REQ-ID | Description | Wireframe | Backend-status | UI-status |
|---|---|---|---|---|
| **REQ-027** | Deposit pay-in-hall ≤ 50 000 NOK + agent confirm | PDF 10 §10.1 / PDF 16 §16.15 | ✅ | ✅ Admin |
| **REQ-028** | Vipps + Card processor integration | PDF 10 §10.2 / PDF 16 §16.16 | 🟡 Swedbank Checkout 3.1 (gir Vipps + kort, men flyt-UI mangler) | 🔴 |
| **REQ-070** | Deposit Request Pay-in-Hall approval queue | PDF 16 §16.15 | ✅ | ✅ |
| **REQ-071** | Deposit Request Vipps/Card-vy (no action col) | PDF 16 §16.16 | 🟡 Auto-credit ved callback, men ingen dedikert admin-vy | 🔴 |
| **REQ-072** | Deposit History per type (Pay-in-Hall vs Vipps/Card) | PDF 16 §16.17–18 | 🟡 Endpoint mangler type-filter | 🟡 |
| **REQ-073** | Withdraw in Hall queue + CSV | PDF 16 §16.19 | ✅ | ✅ |
| **REQ-074** | Withdraw in Bank XML-eksport + daglig email | PDF 16 §16.20 | ✅ | ✅ |
| **REQ-075** | Withdraw history + type-filter | PDF 16 §16.21 | 🟡 | 🟡 |
| **REQ-119** | XML scheduler — DAILY MORNING cron | PDF 16 §16.20 | ✅ (23:00 cron) | n/a |
| **REQ-120** | XML mail-send til `app_accounting_emails` | PDF 16 §16.20 | ✅ | n/a |
| **REQ-121** | EN XML per agent (alle haller samlet) | PDF 16 §16.20 / BIR-222 | ✅ Bekreftet PM-lock 2026-04-24 | n/a |
| **REQ-123** | Deposit Vipps webhook handling | PDF 10 + 16 | 🔴 EKSISTERER IKKE | n/a |
| **REQ-124** | Card payment processor integration | PDF 10 + 16 | 🟡 Via Swedbank, men admin-flyt 1:1 mangler | 🔴 |
| **REQ-129** | 2FA for høy-saldo + bank-withdraw | PDF 9 / PDF 10 §10.5 | 🔴 | 🔴 |
| **REQ-133** | IBAN + holder-name match-validering | PDF 10 §10.5 | 🟡 Felter finnes; match-logikk ikke verifisert | n/a |
| **REQ-134** | AML/fraud-check på bank-withdraw | PDF 10 §10.5 | 🟡 `adminAml.ts` finnes; integrasjon ikke verifisert | n/a |

---

## §4. Hva mangler for full 1:1

### 4.1 Endpoints som mangler

```
# Player-side (Vipps/Card public flow)
POST   /api/payments/vipps/topup-intent        [Auth]   amount, phone → Vipps redirect
POST   /api/payments/vipps/confirm             [Auth]   intentId → reconcile
POST   /api/payments/vipps/callback            [HMAC]   Vipps webhook → reconcile

# Bank-payout (hvis vi ikke kun bruker XML-eksport)
POST   /api/payments/bank-payout/intent        [Admin]  withdrawRequestId → Swedbank Payout
GET    /api/payments/bank-payout/:id/status    [Admin]
POST   /api/payments/bank-payout/callback      [HMAC]   Swedbank Payout webhook

# Player history (per-channel)
GET    /api/players/me/deposits                [Auth]   ?type=hall|vipps|card → liste
GET    /api/players/me/withdrawals             [Auth]   ?type=hall|bank → liste

# 2FA for bank-uttak
POST   /api/auth/2fa/enable                    [Auth]   → TOTP-secret + QR
POST   /api/auth/2fa/verify                    [Auth]   code → enable
POST   /api/payments/withdraw-request/2fa      [Auth]   intentId, code → unlock
```

### 4.2 UI-skjermer som mangler

- **Player web-shell:** Deposit-flyt med method-selector (Pay in Hall / Vipps / Card / Apple Pay / Google Pay).
- **Player web-shell:** Withdraw-flyt med destination-selector (Hall / Bank) + IBAN-form + 2FA-prompt.
- **Player web-shell:** Deposit-history + Withdraw-history (PDF 10 §10.3, §10.6).
- **Admin:** Dedikert Vipps/Card-vy uten action-knapper (PDF 16 §16.16).
- **Admin:** Add Email Account (PDF 16 §16.21 — for regnskap-allowlist) — backend finnes (`app_accounting_emails`), ikke verifisert at UI er ferdig.

### 4.3 State-transisjoner som mangler

```
DEPOSIT (Vipps/Card):
  CREATED → PROCESSING → AUTHORIZED → CAPTURED → CREDITED
  FAILED på any error; CANCELLED hvis bruker avbryter

DEPOSIT (Pay-in-Hall):
  PENDING → ACCEPTED → CREDITED      ← Eksisterende
        ↘ REJECTED                   ← Eksisterende

WITHDRAW (Hall):
  PENDING → ACCEPTED → DEBITED       ← Eksisterende
        ↘ REJECTED                   ← Eksisterende

WITHDRAW (Bank):
  PENDING → ACCEPTED → EXPORTED      ← Eksisterende (XML-cron)
        ↘ REJECTED
  ❓ EXPORTED → BANK_PROCESSED → SETTLED  ← Mangler hvis vi bruker Swedbank Payout
```

### 4.4 Regulatoriske krav som mangler eller er uverifisert

- **Norsk PSD2 / SCA**: 3DS for kort (Swedbank Checkout håndterer dette, men må valideres).
- **AML transaction-monitoring**: terskel-rapportering på bank-uttak ≥ 100 000 NOK (per Hvitvaskingsloven). `adminAml.ts` finnes — implementasjon ikke verifisert.
- **IBAN-validering**: MOD-97-check + holder-name-match (DNB BankID-API tilgjengelig, men ikke integrert).
- **Refund-flyt**: Hvis spillet kanselleres etter top-up, må vi kunne refundere via Swedbank — endpoint mangler.

---

## §5. Risikoer og åpne spørsmål

### 5.1 Tekniske risikoer

| Risiko | Konsekvens | Mitigasjon |
|---|---|---|
| Swedbank sandbox vs prod-credentials | Pilot starter med sandbox → må byttes ut | Render-secret-rotation før pilot |
| Vipps krever egen merchant-avtale | 4–8 ukers lead-time hos Vipps AS | Vurder om det skal startes nå |
| 3DS / SCA edge-cases (bruker forlater browser midt i flow) | Mistede deposit-intents | Eksisterende reconcile-cron dekker dette delvis |
| `swedbank_payment_intents` tabell mangler i prod (42P01) | Cron logger varsel hver time | Verifiser migration kjørt på prod |
| Withdraw-XML feil mottaker | Penger sendt til feil konto | `app_accounting_emails` allow-list + manual review pre-send |

### 5.2 Open questions for PM (krever svar før implementering)

Se §6 nedenfor for full liste.

---

## §6. PM-beslutninger som trengs

### Beslutning 1: Vipps via Swedbank Pay vs direkte Vipps API?

**Bakgrunn:** Swedbank Pay Checkout 3.1 støtter Vipps som payment-method (vi sender kun "Purchase"-intent og lar Swedbank velge metode). Direkte Vipps API krever egen merchant-onboarding hos Vipps AS (4–8 uker lead-time).

| Path | Pro | Con | Dev-tid |
|---|---|---|---|
| **A. Vipps via Swedbank Pay** | Allerede integrert; ingen ekstra merchant-onboarding | Højere transaksjonskostnader (~2.5%); mindre Vipps-spesifikk UX | **2–3 dev-dager** (kun UI-arbeid) |
| **B. Direkte Vipps eCom API** | Native Vipps-flow (instant in-app); lavere kostnader (~1.75%) | Krever merchant-onboarding (lead-time risiko for pilot) | **8–14 dev-dager** + 4–8 uker lead-time |

**Anbefaling fra research:** Path A for pilot, Path B post-pilot hvis transaksjonsvolumet rettferdiggjør det.

### Beslutning 2: Hvilke kort-typer skal støttes?

**Bakgrunn:** Swedbank Pay Checkout støtter Visa/Mastercard/AmEx/Apple Pay/Google Pay/MobilePay/Vipps som standard. Wireframe PDF 10 §10.2 lister "Visa/Mastercard/Apple Pay/Google Pay" men ikke AmEx eller MobilePay.

**Spørsmål:** Skal pilot-prosjektet:
- (a) Tilby alt Swedbank tilbyr (incl AmEx/MobilePay)?
- (b) Begrense til wireframe-spec (Visa/Mastercard/Apple Pay/Google Pay)?
- (c) Kun Vipps + Visa/Mastercard som første versjon, og expand senere?

**Anbefaling:** (b) — match wireframe 1:1 for å unngå spillere blir frustrert over manglende AmEx, men pilot-test først med kun (c).

### Beslutning 3: Skal Pay-in-Hall ha egen flyt eller bruke samme deposit-request-system?

**Bakgrunn:** I dag bruker både Pay-in-Hall og Vipps/Card samme `app_deposit_requests`-tabell, men Vipps/Card-flyten må auto-credit (ingen agent-approval). Wireframe PDF 16 §16.16 spec'r en **separat admin-vy** for Vipps/Card (uten Action-kolonne).

| Path | Pro | Con |
|---|---|---|
| **A. Felles tabell + `payment_method`-felt** | Enklere DB-modell; én ledger | Type-confusion-risiko (admin må filtrere på method) |
| **B. Separate tabeller (`app_deposit_requests` + `app_card_deposits` + `app_vipps_deposits`)** | Klarere domene-grenser; lettere å migrere senere | Mer DB-jobb; duplisering av kolonner |
| **C. Bruk `swedbank_payment_intents` for Vipps/Card direkte (ikke gå gjennom `app_deposit_requests`)** | Allerede bygget; auto-reconcile via callback | Admin må joine på 2 tabeller for "alle deposits" |

**Anbefaling:** Path C — Vipps/Card ↔ `swedbank_payment_intents`; Pay-in-Hall ↔ `app_deposit_requests`. Admin-vy kan være `UNION ALL` på begge.

### Beslutning 4: Withdraw via Swedbank Pay Payout vs manuell hall-utbetaling?

**Bakgrunn:** I dag kan spiller velge `destinationType=bank` → XML-fil sendes til regnskap → manuell ASCII-utbetaling fra DNB. Swedbank Pay tilbyr **Payout API** (B2C automatisk overføring), men krever egen aftale.

| Path | Pro | Con | Dev-tid |
|---|---|---|---|
| **A. Behold XML-pipeline (manuell payout)** | Allerede bygget; lavere kostnad | 1–2 dagers ledetid; manuell prosess | **0 dev-dager** |
| **B. Legg til Swedbank Pay Payout API** | Instant-payout; mindre regnskapsjobb | Krever egen avtale; lead-time + kostnader | **5–8 dev-dager** + avtale-tid |

**Anbefaling:** Path A for pilot. Re-evaluer post-pilot basert på volum.

### Beslutning 5: 3DS / SCA / 2FA-håndtering

**Bakgrunn:** EU PSD2 krever Strong Customer Authentication (SCA) på betalinger > 30 EUR. Swedbank Checkout 3.1 håndterer 3DS automatisk for kort. Vipps har sin egen SCA-flow. **Bank-uttak** har derimot ingen native 2FA i dagens kodebase.

**Spørsmål:** Skal pilot ha:
- (a) Kun 3DS via Swedbank (kort/Vipps) — godt nok for pilot
- (b) Tillegg: TOTP 2FA på bank-uttak ≥ 1 000 NOK (REQ-129)
- (c) BankID-step-up på bank-uttak (mest sikkert, men dyrt og tidskrevende)

**Anbefaling:** (a) for pilot; (b) før GA. (c) krever BankID-merchant-aftale (BankID på Mobil eller BankID på MerKort) som har ~2 måneders lead-time.

---

## §7. Estimert dev-tid per scenario

### Scenario A — Pilot-minimum (cash-only + Swedbank Checkout for online)

**Beslutninger:** B1=A, B2=c (kun Vipps + Visa/MC), B3=C, B4=A, B5=a.

```
[P0] Player web-shell deposit-flyt med Swedbank Checkout-redirect    2 dev-dager
[P0] Player web-shell withdraw-request flyt + IBAN-form               1 dev-dag
[P0] Admin Vipps/Card-vy (UNION-query på swedbank_payment_intents)    1 dev-dag
[P1] Player deposit-history + withdraw-history-sider                  1 dev-dag
[P1] IBAN MOD-97-validering (`fast-iban-check` lib)                   0.5 dev-dag
[P1] Add Email Account admin-UI                                       0.5 dev-dag
                                                                      ─────────
                                                              SUM:    6 dev-dager
```

### Scenario B — Full wireframe-paritet (Swedbank for online, ingen direkte Vipps)

**Beslutninger:** B1=A, B2=b (alle kort + Apple/Google Pay), B3=C, B4=A, B5=b.

```
Scenario A (over)                                                     6 dev-dager
[P1] TOTP 2FA-flow (qrcode-lib + speakeasy)                           3 dev-dager
[P1] AML transaction-monitoring (terskel-rapportering)                2 dev-dager
[P2] Apple Pay / Google Pay deep-link button                          1 dev-dag
[P2] Holder-name match (DNB BankID-API integrasjon)                   1.5 dev-dag
                                                                      ─────────
                                                              SUM:    13.5 dev-dager
```

### Scenario C — Full enterprise (direkte Vipps + Swedbank Payout)

**Beslutninger:** B1=B, B2=b, B3=B, B4=B, B5=c.

```
Scenario B (over)                                                     13.5 dev-dager
[P0] Direkte Vipps eCom v3 API-integrasjon                            8 dev-dager
[P0] Swedbank Pay Payout API for bank-utbetaling                      6 dev-dager
[P0] BankID step-up for bank-uttak ≥ 1 000 NOK                        4 dev-dager
                                                                      ─────────
                                                              SUM:    31.5 dev-dager
                                                              + 4–8 uker lead-time for Vipps + BankID-avtaler
```

---

## §8. Anbefaling

For pilot ~6 uker unna anbefales **Scenario A (6 dev-dager)** med følgende beslutninger:

- **B1 = A** (Vipps via Swedbank Pay)
- **B2 = c** (Vipps + Visa/Mastercard som start; Apple/Google Pay i Fase 2)
- **B3 = C** (Vipps/Card via `swedbank_payment_intents`; Pay-in-Hall fortsatt via `app_deposit_requests`)
- **B4 = A** (Behold XML-pipeline for bank-uttak)
- **B5 = a** (Kun 3DS via Swedbank for pilot; TOTP 2FA pre-GA)

Dette gir **~6 dev-dager** (1 agent kan kjøre dette på ~8 kalender-dager med review-loops). Resterende paritet (TOTP, AML, AmEx) flyttes til Fase 2 post-pilot.

---

## §9. Referanser

- Wireframe: `docs/architecture/WIREFRAME_CATALOG.md` (PDF 9, 10, 16)
- Backend audit: `docs/architecture/WIREFRAME_BACKEND_REQUIREMENTS_2026-04-25.md`
- Legacy 1:1: `docs/architecture/LEGACY_1_TO_1_MAPPING_2026-04-23.md` §3.1 (Deposit/Withdraw)
- Master-plan: `docs/architecture/MASTER_PLAN_SPILL1_PILOT_2026-04-24.md` §3.1.5
- Swedbank Checkout 3.1: <https://developer.swedbankpay.com/checkout-v3/>
- Vipps eCom v3: <https://developer.vippsmobilepay.com/docs/APIs/ecom-api/>
- PSD2 / SCA: Finanstilsynet rundskriv 8/2019

---

**Slutt på spec.** PM må svare på §6 før implementering kan starte.
