# Module: `apps/backend/src/compliance`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen
**LOC:** ~13 800

## Ansvar

Pengespillforskriften-compliance for Spillorama. Eier:
- Audit-trail med hash-chain (ADR-003)
- Spilleregrenser (per-hall daily/monthly loss limits)
- Selvutestengelse (1 år) og frivillig pause
- Obligatorisk pause etter 60 min sammenhengende spilling (§66)
- Karenstid ved grense-økning (§22)
- §11 organisasjonsdistribusjon (15 % hovedspill, 30 % databingo)
- §71 hall-rapport-data
- ComplianceLedger (per-hall regulatorisk regnskap)

## Ikke-ansvar

- Wallet-mutasjon (delegert til `wallet/`)
- KYC-verifisering (delegert til `auth/`)
- Spillvett-frontend (delegert til `apps/admin-web` og `web/spillvett.js`)

## Public API

| Service | Funksjon |
|---|---|
| `ComplianceManager` | `canPlay(playerId, hallId)`, `recordStake(...)`, `recordPrize(...)` |
| `AuditLogService` | Append-only audit med hash-chain (ADR-003) |
| `ComplianceLedgerOverskudd` | §11-distribusjon-beregning |
| `ResponsibleGamingStore` | Loss-limits, pauses, exclusions |
| `PlayerComplianceService` | Compliance-data per spiller per hall |
| `ExtraDrawDenialService` | Sporing av nektelser av extra-draw-kjøp (audit) |

HTTP-endepunkter (via `routes/`):
- `GET /api/wallet/me/compliance?hallId=...` — playerCompliance
- `POST /api/wallet/me/timed-pause` — frivillig pause
- `POST /api/wallet/me/self-exclusion` — 1-års eksklusjon
- `PUT /api/wallet/me/loss-limits` — sett grense per hall

## AuditLogService (BIN-588)

Centralised, append-only audit log for admin actions, auth events, deposits, withdraws, role changes,
and other compliance-relevant state transitions. Hash-chain integrity per ADR-003.

### Shape

```typescript
await audit.record({
  actorId: "admin-1",            // app_users.id, or null for SYSTEM
  actorType: "ADMIN",            // USER | ADMIN | HALL_OPERATOR | SUPPORT | PLAYER | SYSTEM | EXTERNAL
  action: "deposit.approve",     // stable dotted verb
  resource: "deposit",           // entity kind
  resourceId: "dep-99",
  details: { amount: 500 },      // JSON payload; PII-redacted at write time
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"],
});
```

### Storage

- `app_compliance_audit_log` (hash-chain — ADR-003)
- `PostgresAuditLogStore` — production-backed; fire-and-forget writes
- `InMemoryAuditLogStore` — tests + dev fallback

### PII redaction

`redactDetails()` walks payload before insert. Blocklist:

```
password, token, accessToken, refreshToken, sessionToken, secret,
nationalId, ssn, personnummer, fodselsnummer,
cardNumber, cvv, cvc, pan,
authorization
```

Case-insensitive on keys; recurses into nested objects/arrays with depth cap.

## Avhengigheter

**Bruker:**
- Postgres (`app_compliance_audit_log`, `app_rg_compliance_ledger`,
  `app_player_loss_limits`, `app_player_self_exclusion`, `app_player_timed_pause`)
- `wallet/WalletService` — saldo-sjekk
- `platform/PlatformService` — hall-config

**Brukes av:**
- `game/BingoEngine` — pre-purchase compliance-sjekk
- `wallet/WalletService` — limit-sjekk før debit
- `routes/` — HTTP-endepunkter
- `jobs/` — daily report cron

## Invariants

1. **Fail-closed:** hvis ComplianceService er nede, blokker spill — ikke åpne
2. **Hash-chain audit:** ADR-003. Hver audit-rad har prev_hash + curr_hash
3. **§11 korrekt klassifisering:** Spill 1-3 = MAIN_GAME (15 %), SpinnGo = DATABINGO (30 %)
   (jf. ADR-007)
4. **Compliance-binding til kjøpe-hall:** ikke master-hall (BIN-661 fix, PR #443)
5. **Append-only:** ingen UPDATE eller DELETE på audit-rader (constraint)
6. **Audit fanger alle wallet-transaksjoner** med actorType (USER/ADMIN/AGENT/SYSTEM)
7. **Daily limit reset:** ved midnatt Europe/Oslo (BIN-XXX), ikke UTC
8. **PII redaction:** alle audit-detaljer går gjennom redactDetails før persist

## Bug-testing-guide

### "Spiller får ikke spille selv om innenfor limits"
- Sjekk `ComplianceManager.canPlay()` med samme params
- Sjekk om `app_player_self_exclusion` har aktiv rad
- Sjekk om `app_player_timed_pause` har aktiv pause
- Sjekk obligatorisk pause-status (60 min spilt → 5 min pause)

### "Audit-rad har feil prev_hash"
- Kjør `npm run verify:audit-chain`
- Sannsynligvis race condition mellom to AuditLogService-skrivinger
- Manuell repair krever superpowers — eskaler til Tobias

### "§71 hall-rapport viser feil tall"
- Sjekk om compliance-rad har korrekt `actor_hall_id` (ikke master-hall)
- Sjekk `gameType` (MAIN_GAME vs DATABINGO)
- Kjør `npm run reconcile:compliance-ledger` for å finne avvik

### "Daglig limit ikke reset ved midnatt"
- Sjekk `dailyLimitResetCron` Sentry-status
- Sjekk timezone i cron (skal være `Europe/Oslo`, ikke UTC)
- Sjekk `app_player_loss_limits.last_reset_at` for spilleren

## Operasjonelle notater

### Vanlige error-codes
| Code | Betydning |
|---|---|
| `BIN-CMP-001` | Daily loss limit exceeded |
| `BIN-CMP-002` | Self-exclusion active |
| `BIN-CMP-003` | Mandatory pause active (§66) |
| `BIN-CMP-004` | Karenstid for limit-økning ikke utløpt |
| `BIN-CMP-005` | Hall not found / not active |

### Daglig reconciliation
- `walletReconciliationCron` — sum debit/credit per spiller
- `complianceLedgerReconciliationCron` — §11-andel matche
- Begge kjører midnatt Oslo

### Sentry-tags
- `module:compliance`
- `actorType:USER|ADMIN|SYSTEM`
- `hallId:<uuid>`

### Migrasjoner (kritiske)
- `app_compliance_audit_log` — hash-chain
- `app_rg_compliance_ledger` — §11-data
- `app_audit_anchors` — daglig signed snapshot

### Verifisering
- `npm run verify:audit-chain` — bekreft hash-kjede
- `npm run reconcile:compliance-ledger` — bekreft §11-totals

## Referanser

- ADR-003 (hash-chain audit)
- ADR-007 (spillkatalog-paritet)
- ADR-002 (system-actor)
- `docs/compliance/` — regulatorisk grunnlag
- `docs/architecture/modules/backend/AuditLogService.md`
- `docs/architecture/modules/backend/ComplianceManager.md`
- `docs/architecture/modules/backend/ComplianceLedger.md`
