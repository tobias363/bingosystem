# Module: `apps/backend/src/game`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen
**LOC:** ~109 000 (største enkelt-modul)

## Ansvar

Kjernen i Spillorama. Inneholder all spill-logikk for Spill 1, 2, 3:
- BingoEngine (felles trekke-engine, ticket-evaluering, claims, payouts)
- Game1Engine (Spill 1: 75-ball 5×5, master-styrt per hall, mini-games)
- Game2Engine (Spill 2: 21-ball 3×3, perpetual global rom)
- Game3Engine (Spill 3: 75-ball 5×5 uten free, perpetual global rom, T/X/7/Pyramide)
- Mini-games (Wheel of Fortune, Treasure Chest, Mystery, Color Draft)
- Schedule, draw orchestration, pattern evaluation
- Payout-services (Lucky Number Bonus, jackpot-pots, prize-policy)

## Ikke-ansvar

- Wallet-mutasjon (delegert til `wallet/`)
- Compliance-audit-skriving (delegert til `compliance/`)
- Socket.IO-bredkast (delegert til `sockets/`)
- HTTP-endepunkter (delegert til `routes/`)

## Public API

Hovedklasser eksportert til andre moduler:

| Class | Funksjon |
|---|---|
| `BingoEngine` | Felles base-engine for Spill 1/2/3 |
| `Game1Engine` | Spill 1-spesifikk (master-styrt) |
| `Game2Engine` | Spill 2-spesifikk (perpetual) |
| `Game3Engine` | Spill 3-spesifikk (perpetual, andre patterns) |
| `Game1RoomFactory` | Factory for å lage Spill 1 rom (per hall) |
| `Game2RoomFactory` | Factory for ROCKET (globalt) |
| `RoomLifecycleService` | Oppretter, sletter, persisterer rom |
| `DrawOrchestrationService` | Koordinerer auto-draw cron |
| `Game1HallReadyService` | Per-agent ready-state for Spill 1 |
| `Game1TransferHallService` | 60s master-handover handshake |

Subdir-organisering:
- `MiniGames/` — Wheel/Chest/Mystery/ColorDraft
- `Game1*` — Spill 1-spesifikt
- `Game2*` — Spill 2 / ROCKET
- `Game3*` — Spill 3 / MONSTERBINGO
- `BingoEngine.*.test.ts` — felles engine-tester

## Avhengigheter

**Bruker (in):**
- `wallet/WalletService` — payouts, debits
- `compliance/AuditLogService` — audit-events
- `compliance/ComplianceManager` — limit-sjekk, hall-binding
- `platform/PlatformService` — hall-config
- `store/RoomState` (i `store/`) — rom-state
- `shared-types` — Zod-schemas, type-defs

**Brukes av (out):**
- `routes/` — HTTP-endepunkter
- `sockets/` — Socket.IO event-handlers
- `jobs/` — cron-jobs (perpetualLoopTick, autoDrawTick)

## Invariants

Disse må ALLTID være sant:

1. **Server er sannhets-kilde for trekninger.** Klient kan aldri bestemme hvilken ball er trukket.
2. **Crypto-sikker RNG:** `crypto.randomInt` brukes for ball-trekninger, ikke `Math.random`.
3. **Idempotency:** ticket.mark, claim.submit må kunne retries trygt med samme resultat.
4. **System-actor for system-driven actions:** perpetual-loop-trekninger har `actorType=SYSTEM`,
   ikke falsk player-id (jf. ADR-002).
5. **Compliance-binding til kjøpe-hall:** ticket.purchase binder ComplianceLedger til kjøpe-hallen,
   ikke master-hallen (jf. ADR-007 + PR #443).
6. **Spill 1 ≠ Spill 2/3 livsmønster:** Spill 1 master-styrt, Spill 2/3 perpetual. Ikke bland.
7. **Postgres er System of Record:** alt regulatorisk persisteres til Postgres. Redis er cache.

## Bug-testing-guide

### "Ball trekkes ikke / draw henger"
- Sjekk `Game1AutoDrawTickService` cron-status (Sentry)
- Sjekk Redis room-state (`roomState[code]`)
- Sjekk Postgres `app_room.state` — er den PLAYING?
- For perpetual: sjekk `perpetualLoopTickCron`

### "Claim ikke godkjent"
- Sjekk `BingoEnginePatternEval` — pattern-match-logikk
- Sjekk Postgres `app_claim` — er rad innsatt?
- Sjekk `evaluateClaims()` med samme ticketId + drawnBalls

### "Payout feilet eller dobbel"
- Sjekk `Game1PayoutService` audit-log
- Sjekk `WalletService` outbox (ADR-004)
- Sjekk idempotency-key brukt av call-site
- Sjekk `app_wallet_transactions` for duplikater

### "Mini-game starter ikke"
- Sjekk `MiniGameRouter` (i game-client)
- Sjekk backend `MiniGames/` engine
- Sjekk migrations — er bord `app_minigame_session` deployet?

### "Per-hall payout går negativt"
- Sjekk `HallCashLedger` cap-check
- Sjekk `app_halls.cash_balance` direkte
- Pre-pilot fix: BIR-036 daglig 50k cap

## Operasjonelle notater

### Debug-endepunkter
- `GET /api/admin/rooms/:roomCode` — full room snapshot
- `GET /api/admin/games/:gameId/replay` — event-by-event replay (audit)
- `POST /api/admin/rooms/:roomCode/draw-next` — manuell draw (admin only)

### Logging
- Structured logs med `module=game1|game2|game3`
- `roomCode`, `sessionId`, `actorType` alltid inkludert
- Error-codes: `BIN-G1-NNN`, `BIN-G2-NNN`, `BIN-G3-NNN` (ADR-005)

### Sentry-tags
- `module:game`
- `game:bingo|rocket|monsterbingo`
- `actorType:SYSTEM|USER|ADMIN|AGENT`

### Vanlige error-codes
| Code | Betydning | Handling |
|---|---|---|
| `BIN-G1-001` | Spill 1 — claim på ikke-tilhørende ticket | Sjekk player-ticket-binding |
| `BIN-G2-001` | Spill 2 — assertHost feilet (skal ikke kalles på perpetual) | Bug — fix call-site |
| `BIN-G3-001` | Spill 3 — pattern-eval feil for Game3PatternRow | Sjekk Pattern-config |

### Migrasjoner
Game-spesifikke tabell-endringer i `apps/backend/src/migrations/0NNN_*.sql`. Eksempler:
- `app_room`, `app_game_session`, `app_draw_event`, `app_claim`, `app_minigame_session`

### Pilot-skala
- 36 000 samtidige WebSocket-tilkoblinger
- ~10 trekninger per sekund (multi-rom)
- Postgres connection pool: 200

## Detaljert per-fil dokumentasjon

For dypere modul-dokumentasjon, se [`docs/architecture/modules/backend/`](../../../../docs/architecture/modules/backend/):
- BingoEngine.md, BingoEngineMiniGames.md, BingoEnginePatternEval.md, BingoEngineRecovery.md
- Game1AutoDrawTickService.md, Game1DrawEngineService.md, Game1HallReadyService.md
- Game3Engine.md
- ClaimSubmitterService.md, DrawOrchestrationService.md
- PhasePayoutService.md, PrizePolicyManager.md
- RoomLifecycleService.md, RoomLifecycleStore.md, RoomState.md

## Referanser

- ADR-001 (perpetual rom-modell)
- ADR-002 (system-actor)
- ADR-007 (spillkatalog-paritet)
- `docs/diagrams/03-draw-flow-spill1.md`
- `docs/diagrams/04-perpetual-loop-spill2-3.md`
- `docs/architecture/SPILLKATALOG.md` (autoritativ)
