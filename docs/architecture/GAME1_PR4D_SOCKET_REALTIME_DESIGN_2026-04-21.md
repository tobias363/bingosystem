# PR 4d — Spill 1 socket player-join + master-konsoll real-time + stop-refund

**Status:** Design-forslag, venter PM-review
**Dato:** 2026-04-21
**Agent:** Agent 1 (scope-plan) — kode kommer i senere PR-er etter PM-GO
**Følger:** [`GAME1_SCHEDULE_SPEC.md`](.claude/worktrees/interesting-ellis-eb99bd/GAME1_SCHEDULE_SPEC.md), [`WIRE_CONTRACT.md`](./WIRE_CONTRACT.md)

## 1. Mål + ikke-mål

**Mål for PR 4d:**
- Spillere kan joine et *schedulert* Spill 1 via `scheduled_game_id` (ikke ad-hoc `roomCode`).
- Multi-hall: samme schedulert spill kan ha spillere fra flere haller; `player.hallId` er del av player-objektet.
- Master-konsollen får sanntids-visning (socket-push) i stedet for REST-polling hver 5. sek.
- Master `stopGame` refunderer alle purchases automatisk med §11-audit.

**Ikke-mål (flyttes til senere PR-er):**
- Hall-ready-status real-time (fortsetter polling frem til egen PR).
- Lobby + schedule-visning real-time oppdatering.
- Socket-konvertering av øvrige admin-endepunkter.
- Stop-partial-refund-retry (feilet refund = alarm, ikke auto-retry).

## 2. Nåværende tilstand (rask oppsummering)

- **Ett default namespace `/`.** `apps/backend/src/sockets/gameEvents.ts` (~1200 LOC) håndterer `room:create`, `game:start`, `draw:next`, `claim:submit` osv. generisk for alle spill-varianter.
- **Auth:** accessToken i payload per event. `platformService.getUserFromAccessToken` validerer. Ingen session-cookie.
- **Admin-events** i separate handler-filer (`adminHallEvents.ts`, `adminDisplayEvents.ts`), men **samme default namespace**. Auth via payload-token.
- **Scheduled_games-tabellen mangler `room_code`** — ingen persistent mapping mellom schedulert spill og bingo-rom. Engine lager `room_code` ved `createRoom()`, men slipper koblingen.
- **`Game1MasterControlService.stopGame()`** bare setter `status='cancelled'` og kaller `engine.stopGame()`. **Ingen refund-logikk.** Purchases står urørt i `app_game1_ticket_purchases`.
- **Admin-web `Game1MasterConsole.ts`** poller `fetchGame1Detail(gameId)` hvert 5. sek via REST. Har ikke socket-client.
- **Agent 4's kontrakt-tester** (`multiWinnerEventOrdering.test.ts`, `reconnectMidPhase.test.ts`) dokumenterer nåværende event-flyt; PR 4d **må ikke bryte** disse.

## 3. Arkitektur-valg

### 3.1 Namespace-strategi

**Valg: Behold default `/` for spiller-events. Ny `/admin-game1` for master-konsoll.**

| | Default `/` (spiller-events) | `/admin-game1` (ny) |
|---|---|---|
| Bruker | Spillere + hall-operator-broadcast | Admin-web master-konsoll |
| Auth | accessToken i payload (som i dag) | Admin-JWT som handshake `auth.token` |
| Events inn | Eksisterende (claim:submit, ticket:mark, …) + ny `game1:join-scheduled` | Ingen — read-only push fra server |
| Events ut | `draw:new`, `pattern:won`, `room:update` (ufanget kontrakt) | `game1:status-update`, `game1:halls-ready-update`, `game1:refund-progress` |

**Hvorfor:**
- Spiller-namespacen har allerede wire-contract + kontrakt-tester. Å flytte til `/game1-scheduled` ville kopiere ~1200 LOC og reparsere fixture-banken.
- Admin-påvirkning er fundamentalt ulik (read-only sanntids-push til en gruppe admin-klienter som ikke eier et bingo-rom). Eget namespace gir bedre auth-separering.

### 3.2 Scheduled_game ↔ room_code mapping

**Valg: Alt 1 (persistent kolonne).** `ALTER TABLE app_game1_scheduled_games ADD COLUMN room_code TEXT UNIQUE`.

Begrunnelse: Crash recovery krever persistent map. In-memory map ville miste state ved restart midt i runden — spillere som joiner etter restart mister sitt `roomCode`-oppslag.

Forward-only migrasjon per BIN-661. Tomt for historiske rader er OK (de er `completed` eller `cancelled`); constraint er `UNIQUE` uten `NOT NULL`.

### 3.3 Player-join-flyt

Ny socket-event `game1:join-scheduled` i default namespace:

```
Client → Server: game1:join-scheduled {
  scheduledGameId,   // UUID fra lobby-schedule
  accessToken,       // som i dag
  hallId,            // hallen spilleren spiller fra
  playerName,
}
```

Server-logikk:
1. Auth via `accessToken` (som `room:create` i dag).
2. Slå opp `scheduledGameId` i `app_game1_scheduled_games`.
   - `status` må være `purchase_open` eller `running`. Ellers `{ error: { code: "GAME_NOT_JOINABLE", ... }, status: 400 }`.
   - Sjekk at `hallId` er i `participating_halls_json` (multi-hall-validering).
3. Hvis `room_code` er NULL: server må opprette `bingoEngine.createRoom()` + persistere til scheduled_games.
   - Race-sikring: `INSERT ... ON CONFLICT ... UPDATE room_code = COALESCE(scheduled_games.room_code, excluded.room_code)` eller equivalent.
4. Hvis spilleren allerede er i rommet (reconnect): returner snapshot som i dag (`reconnectMidPhase`-kontrakten).
5. Ellers `engine.joinRoom({ roomCode, hallId, playerName, walletId: user.walletId })`.
6. ACK med `{ roomCode, snapshot: RoomSnapshot, playerId }`.

**Multi-hall-støtte:** `Player.hallId?` finnes allerede i shared-types. Per-hall-rapporter som bruker felte fungerer uendret. Hall-specific broadcast kan gjøres via `io.to(\`hall:\${hallId}:game:\${gameId}\`).emit(...)` — egen rom-konvensjon hvis trengs senere.

### 3.4 Real-time broadcast-kontrakter

**Spiller-events (default `/`) — uendret per Agent 4's kontrakt:**

```
draw:new       → io.to(roomCode).emit(payload)           // 1 per ball
pattern:won    → io.to(roomCode).emit(payload)           // 1 per fase, winnerIds[] inkludert
room:update    → io.to(roomCode).emit(snapshot)          // 1 per state-endring
```

Idempotency-key for `pattern:won`: `phase-<patternId>-<gameId>` (ikke per-spiller). Klienten dedupe-r på key.

**Admin-events (`/admin-game1`) — ny:**

```
game1:status-update        → { gameId, status, currentPhase?, actualStartTime?, stoppedByUserId? }
game1:halls-ready-update   → { gameId, hallsReady: [{ hallId, isReady, excluded }] }
game1:refund-progress      → { gameId, completed, total, lastPurchaseId? }  // emittes hver N'te refund
```

Emittes fra `Game1MasterControlService` etter DB-commit (etter-commit-hook). Admin-client auto-subscribe på `gameId` via `socket.emit("game1:subscribe", { gameId })` etter connection.

### 3.5 Master-konsoll sanntids-visning

**Klient-endring (`apps/admin-web/src/pages/games/master/Game1MasterConsole.ts`):**
- Fjern `setInterval(poll, 5000)`. Behold REST `fetchGame1Detail` som initial-load og fallback (ved socket-disconnect).
- Ny: `AdminGame1Socket`-klient (egen liten klasse) kobler til `/admin-game1` med JWT, abonnerer på `gameId`, oppdaterer Svelte/state på hver event.
- Hvis socket-disconnect: fall tilbake til REST-polling etter 10 sek uten reconnect.

**Server-endring:**
- Ny `apps/backend/src/sockets/adminGame1Events.ts` (ny handler-fil).
- Middleware validerer admin-JWT i `socket.handshake.auth.token` (ved connection, ikke per event).
- `Game1MasterControlService` + `Game1HallReadyService` får injisert `adminGame1Broadcaster` (port) som kalles etter hver state-change.

### 3.6 stopGame-refund-loop

**Plassering:** Egen metode `Game1TicketPurchaseService.refundAllForGame(gameId, { reason, actorUserId, actorType })`. Kaldt fra `Game1MasterControlService.stopGame()` **etter** `engine.stopGame()` har kjørt.

```ts
// Game1MasterControlService.stopGame pseudo:
await db.update(scheduled_games).set({ status: "cancelled", ... });
await auditLog.insert(master_audit, { action: "stop", ... });
await engine.stopGame(roomCode);                           // eksisterende
await ticketPurchase.refundAllForGame(gameId, {            // NY
  reason: "master_stop",
  actorUserId: actor.userId,
  actorType: actor.role === "ADMIN" ? "ADMIN" : "HALL_OPERATOR",
});
```

**Loop-logikk:**
1. `listPurchasesForGame(gameId)` — returnerer alle non-refunded purchases.
2. For hver purchase: `refundPurchase(id, { reason, actorUserId, actorType })`.
   - `refundPurchase` er allerede idempotent (sjekker `refunded_at IS NULL`).
   - Hver refund kredit-er wallet (`digital_wallet`) eller logger manuell refund (`cash_agent`).
   - Audit-entry skrives i samme transaksjon.
3. Ved feil på én purchase: logg warning, fortsett. Samlet resultat returnerer `{ succeeded, failed[] }`.
4. Hvis `failed.length > 0`: oppdater `scheduled_games.stop_reason = 'refund_failed_partial'` + send alarm (pino-warn for nå, PagerDuty-hook senere).
5. Admin-konsoll får `game1:refund-progress` hver 10 refunds + endelig `status-update` med ferdig-status.

**§11-audit per refund:**
- `AuditLogService.log({ action: "refund", resource: "game1_ticket_purchase", resourceId: purchaseId, details: { gameId, amountCents, paymentMethod, reason: "master_stop" }, actorType, actorId })`.
- Eksisterende `refundPurchase` (Game1TicketPurchaseService:24) gjør allerede dette — gjenbruk uendret.

## 4. Migrasjoner

**20260601000000_app_game1_scheduled_games_room_code.sql:**
```sql
ALTER TABLE app_game1_scheduled_games ADD COLUMN room_code TEXT;
CREATE UNIQUE INDEX idx_app_game1_scheduled_games_room_code
  ON app_game1_scheduled_games (room_code)
  WHERE room_code IS NOT NULL;
```

Forward-only. Ingen backfill — historiske rader har `NULL`. `joinScheduled`-handler lager `room_code` ved første join etter start.

## 5. Test-plan

**Nye tester (alle i `apps/backend/src/sockets/__tests__/`):**

| Fil | Dekker |
|---|---|
| `game1Scheduled.playerJoin.test.ts` | scheduledGameId → room_code lazy-init, multi-hall auth, avvist ved feil status, reconnect-snapshot |
| `game1Scheduled.masterConsoleRealtime.test.ts` | `game1:status-update` + `halls-ready-update` emittes ved state-change, admin-JWT-auth, fallback ved disconnect |
| `game1Scheduled.stopRefund.test.ts` | Loop, idempotens (2x stop = 1x refund), partial-failure isolasjon, §11-audit-entries |

**Uendrede kontrakter (må ikke brytes):**
- `multiWinnerEventOrdering.test.ts` — event-rekkefølge + `winnerIds[]`
- `reconnectMidPhase.test.ts` — snapshot bevarer vunne faser, ingen replay av historiske events
- `wireContract.test.ts` — alle broadcast-events validerer mot Zod-schemas

**Shared-types-utvidelser:**
- `AdminGame1StatusUpdatePayload`, `AdminGame1HallsReadyUpdatePayload`, `AdminGame1RefundProgressPayload` — nye Zod-schemas i `packages/shared-types/src/schemas.ts` + fixtures.
- `Game1JoinScheduledPayload` (client → server ack).

## 6. Sub-PR-struktur + estimat

| Sub-PR | Scope | LOC | Dager |
|---|---|---|---|
| 4d.1 | Migrasjon + `room_code`-mapping + Game1DrawEngine wiring | ~200 | 0.5 |
| 4d.2 | `game1:join-scheduled` handler + shared-types + tester | ~600 | 1 |
| 4d.3 | `/admin-game1` namespace + master-konsoll-subscribe + admin-web client | ~700 | 1 |
| 4d.4 | `refundAllForGame` + stopGame-integrasjon + §11-audit + tester | ~500 | 1 |
| **Totalt** | | **~2000** | **3.5** |

Hver sub-PR leveres separat med rapport-før-kode-gate mellom hver.

## 7. Risiko + mitigering

| Risiko | Mitigering |
|---|---|
| Nye namespace-events går ikke gjennom wire-contract-testene | Legg til i `WIRE_CONTRACT.md` + fixture-bank i samme PR som introduserer dem |
| Refund-feil på cash_agent-purchases blir ikke oppdaget i tide | Alarm via pino-warn + `stop_reason='refund_failed_partial'` + admin-konsoll viser rødt |
| Race ved første `room_code`-assign (2 spillere joiner samtidig) | `INSERT ... ON CONFLICT (id) DO UPDATE SET room_code = COALESCE(scheduled_games.room_code, excluded.room_code)` sikrer én vinner |
| Admin-web mister socket-connection midt i spill | 10s reconnect-attempt → fall tilbake til REST-polling automatisk |
| §11-audit-sletting ved feil på én refund | AuditLogService er fire-and-forget; refund-transaksjonen committer separat |

## 8. Åpne spørsmål til PM

1. **Admin-socket-auth:** JWT i `handshake.auth.token` er trygt (TLS-only), men vi har ikke gjort det for admin-web før. Alternativt: query-param (synlig i server-logs) eller egen session-cookie. **Min anbefaling: JWT i handshake.auth.**
2. **Refund-policy for `cash_agent`-purchases:** §11 krever manuell bekreftelse. Skal UI vise en separat liste "krever manuell refund" som hall-operator må bekrefte? Eller godtas bare digital refund i 4d og cash-agent flyttes til 4e?
3. **Hall-ready real-time:** Er det verdt 0.5 dag ekstra i 4d.3 å også socket-pushe `HallReady`-status, eller vente til egen PR?
4. **Alarm-destinasjon for partial refund-failure:** Bare pino-warn i 4d, eller trigg PagerDuty/Slack-webhook? (Kan legges til senere.)
5. **Rollback-plan:** Hvis 4d.1-migrasjonen går galt i prod, har vi en dokumentert rollback-prosedyre (kun drop index, behold kolonnen så data ikke slettes)?

## 9. Notater

- Agent 4's PR #321-kontrakt-tester er "grønn referanse" og må forbli grønne gjennom hele 4d.
- Ingen Spill 1-spesifikk kode i nåværende `gameEvents.ts` — ny `game1:join-scheduled` blir første slike event. Vurder om vi bør flytte den til egen `game1Events.ts`-fil eller holde den i `gameEvents.ts` med Game1-prefix. Jeg heller mot egen fil for isolasjon.
- Denne dokumenten er scope-plan. PM reviewer → gir GO per sub-PR → kode kommer i egne PR-er med rapport-før-kode-gate.
