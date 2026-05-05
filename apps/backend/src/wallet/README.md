# Module: `apps/backend/src/wallet`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen
**LOC:** ~2 500

## Ansvar

Spillorama wallet-tjeneste. Eier:
- Saldo-styring per spiller (deposit, winnings, holds)
- Wallet-transaksjoner (TOPUP, WITHDRAWAL, STAKE, PRIZE, REFUND, TRANSFER)
- Outbox-pattern for hendelseslevering (BIN-761)
- Multi-currency-readiness (BIN-766)
- Idempotency-keys (BIN-767, 90-dager TTL)
- Daglig reconciliation-cron (matche debit/credit-totals)

## Ikke-ansvar

- Auth (delegert til `auth/`)
- Compliance-limits (delegert til `compliance/`)
- Direct Socket.IO-bredkast (bruker outbox)

## Public API

| Service / Funksjon | Funksjon |
|---|---|
| `WalletService.transfer(...)` | Mellom-konto-overføring (idempotent) |
| `WalletService.debit(...)` | Trekk fra saldo (med limit-sjekk) |
| `WalletService.credit(...)` | Legg til (winnings, refunds, deposits) |
| `WalletService.getBalance(...)` | Hent nåværende saldo + holds |
| `WalletOutboxService` | Outbox-pattern for events (jf. ADR-004) |
| `WalletReconciliationService` | Daglig reconciliation |

Wallet-API (HTTP via `routes/`):
- `GET /api/wallet/me` — saldo + siste 20 transaksjoner
- `GET /api/wallet/me/transactions` — paginert historikk
- `GET /api/wallet/me/compliance` — compliance-status (limits, exclusions)
- `POST /api/wallet/me/topup` — manuell topp-up

## Avhengigheter

**Bruker:**
- Postgres (`app_wallet`, `app_wallet_transactions`, `app_event_outbox`)
- `compliance/ComplianceManager` — limit-sjekk før debit
- `shared-types` — Zod-schemas

**Brukes av:**
- `game/Game1PayoutService`, `Game2PayoutService`, etc. — payout
- `game/Game1TicketPurchaseService` — debit ved kjøp
- `agent/AgentTransactionService` — cash-in/out
- `payments/SwedbankPayService` — topup-bekreftelse

## Invariants

1. **Idempotent transactions:** samme `idempotency-key` returnerer samme resultat (ikke dobbeltkrediter)
2. **Outbox-garanti:** state-mutering og event-skriving i samme TX (ADR-004)
3. **REPEATABLE READ isolation:** debit-flyt bruker REPEATABLE READ for å forhindre lost-update
4. **Hash-chain audit:** alle wallet-transaksjoner får audit-rad i `app_compliance_audit_log` med
   prev_hash + curr_hash (ADR-003)
5. **Multi-currency-ready:** `currency`-felt på alle rader (default NOK), ikke hardkodet
6. **Daglig reconciliation:** sum av debits + credits + opening balances = closing balances
7. **Aldri direct-INSERT i `app_wallet`:** alltid via WalletService eller migrations

## Bug-testing-guide

### "Saldo viser feil"
- Kjør `npm run reconcile:wallet` lokalt
- Sjekk `app_wallet_transactions` for spilleren — siste rad bør matche `app_wallet.balance`
- Sjekk om `app_event_outbox` har stuck delivery (delivered_at IS NULL)

### "Dobbeltkrediter / dobbel debit"
- Sjekk idempotency-key brukt av call-site
- Sjekk om to transaksjoner har samme `idempotency_key` men forskjellige tidspunkter
- Cron `BIN-767` cleanup sletter etter 90 dager — sjekk om eldre

### "Payout går igjennom selv om saldo er for lav"
- Sjekk REPEATABLE READ isolation i `WalletService.debit`
- Sjekk om limit-sjekk er hoppet over (test på ADMIN-bypass)

### "Outbox-event nådde ikke klient"
- Sjekk `app_event_outbox WHERE delivered_at IS NULL ORDER BY created_at`
- Sjekk `outboxDeliveryCron` Sentry-status
- Manuell retry: `UPDATE app_event_outbox SET retry_count=0 WHERE id=...`

## Operasjonelle notater

### Reconciliation
Cron-jobb hver natt:
```
sum(deposits) + sum(winnings) - sum(withdrawals) - sum(stakes) = sum(balances)
```
Avvik > 1 NOK alarmer Sentry. Pre-pilot 2026-05-01 hadde 21 alerts → 0 etter fix.

### Vanlige error-codes
| Code | Betydning |
|---|---|
| `BIN-WAL-001` | Insufficient balance |
| `BIN-WAL-002` | Daily loss limit reached |
| `BIN-WAL-003` | Cash withdraw cap exceeded (BIR-036, 50k/hall/dag) |
| `BIN-WAL-004` | Idempotency-key conflict (samme key, ulik payload) |

### Migrasjoner
- `app_wallet` (saldoer)
- `app_wallet_transactions` (ledger)
- `app_event_outbox` (BIN-761)
- `app_compliance_audit_log` (ADR-003)

### Sentry-tags
- `module:wallet`
- `errorCode:BIN-WAL-NNN`
- `idempotency_key:<key>` (kun ved konflikt)

## Referanser

- ADR-003 (hash-chain audit)
- ADR-004 (outbox-pattern)
- BIN-761 — outbox
- BIN-764 — hash-chain
- BIN-766 — multi-currency
- BIN-767 — idempotency cleanup
- `docs/architecture/modules/backend/WalletService.md`
- `docs/architecture/WALLET_SPLIT_DESIGN_2026-04-22.md`
