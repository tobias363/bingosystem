# Spillorama Event Protocol — Authoritative Catalog

**Last reviewed:** 2026-04-30
**Status:** First version (HV-5 from REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md). Will be regenerated as new events are added.

This document is the single source of truth for every Socket.IO event + REST endpoint that the Spillorama system exposes. Every new event MUST be added here in the same PR that introduces it.

**Contract guarantees:**
- Every event has a Zod schema in `packages/shared-types/src/socket-events.ts` or `api.ts`.
- Server-side handlers validate inbound payloads with `Schema.safeParse()` before acting (BIN-545 pattern).
- Server emits use `as const` typed payloads — never untyped `any`.
- Versioning: events with breaking changes get a new name suffix (e.g. `pattern:won-v2`); old name stays for ≥ 30 days for client roll-out.

---

## 1. Socket.IO event flow

### 1.1 Direction notation

- **C→S** = Client emits, server handles. Has Zod schema for payload.
- **S→C** = Server emits, client handles. Has TypeScript interface for payload.
- **S→S** = Internal namespace event (admin / monitoring).

### 1.2 Channels

- **Default namespace** (`/`): player-facing events.
- **`/admin`**: admin-side events (Game1MasterConsole, hall-management).
- **Per-room channel** (`socket.join(roomCode)`): broadcasts scoped to one game-room.

---

## 2. Catalog — Player events (`/`)

### 2.1 Room lifecycle

| Event | Direction | Schema | Description |
|---|---|---|---|
| `room:join` | C→S | `RoomJoinPayload` | Player requests to join a room (by `roomCode` or `hallId+gameSlug`). Returns ack with snapshot. |
| `room:leave` | C→S | `{ roomCode }` | Voluntary leave. Server evicts player and broadcasts `room:update`. |
| `room:state` | S→C | `RoomSnapshot` | Full state push (initial join + reconnect). |
| `room:configure` | C→S (admin) | `{ ... }` | Admin overrides room settings live. |
| `room:create` | C→S (admin) | `{ ... }` | Admin creates a new room. |
| `room:resume` | C→S (admin) | `{ ... }` | Admin resumes a paused room. |
| `room:update` | S→C (broadcast) | `RoomSnapshot` | State delta push to all players in room. Triggered by any state-mutation. |

### 2.2 Round lifecycle

| Event | Direction | Schema | Description |
|---|---|---|---|
| `game:start` | C→S (admin) | `{ roomCode, ... }` | Start a new round in this room. |
| `game:end` | C→S (admin) | `{ roomCode, reason }` | Manual round end. Sets `endedReason: MANUAL_END`. |
| `draw:next` | C→S (admin) | `{ roomCode }` | Trigger one ball-draw (manual mode only). |
| `draw:new` | S→C (broadcast) | `{ number, drawIndex, gameId }` | New ball drawn — UI animates. |
| `pattern:won` | S→C (broadcast) | `PatternWonPayload` | A pattern was claimed; UI shows winner-popup. |

### 2.3 Tickets + bet-arming

| Event | Direction | Schema | Description |
|---|---|---|---|
| `bet:arm` | C→S | `BetArmPayload` | Player arms ticket-buy-in for next round (pre-round phase). PR #725: enforces loss-limit with partial-buy. |
| `claim:submit` | C→S | `ClaimSubmitPayload` | Player claims a winning pattern (LINE/BINGO/etc). Returns full snapshot. |
| `ticket:cancel` | C→S | `{ roomCode, ticketId }` | Cancel a pre-round ticket. |
| `ticket:mark` | C→S | `{ roomCode, ticketId, number }` | Manual mark (currently auto-marked by server in Spill 1). |
| `ticket:marked` | S→C (own player) | `{ ticketId, number }` | Server confirms a mark. |
| `ticket:replace` | C→S | `{ ... }` | Replace an unwanted ticket pre-round. |
| `ticket:swap` | C→S | `{ ... }` | Swap with another player (Spill 5 SpinnGo only). |
| `lucky:set` | C→S | `{ roomCode, number }` | Player picks lucky number (Spill 1 bonus). |

### 2.4 Mini-games

| Event | Direction | Schema | Description |
|---|---|---|---|
| `minigame:activated` | S→C (own player) | `MiniGameActivatedPayload` | Backend triggers mini-game UI for the Fullt Hus winner (legacy adapter, PR #728). |
| `minigame:play` | C→S | `{ roomCode, type, choice }` | Player makes a choice (wheel-spin, chest-pick, etc). |
| `mini_game:trigger` | S→C | `MiniGameTriggerPayload` | Newer M6-router trigger (BingoEngineMiniGames). |
| `mini_game:result` | S→C | `MiniGameResultPayload` | Resolved mini-game payout — UI animates result. |
| `jackpot:activated` | S→C (own player) | `{ ... }` | Spillorama-spill (game5) jackpot UI activated. |
| `jackpot:spin` | C→S | `{ ... }` | Player spins jackpot wheel. |

### 2.5 Vouchers

| Event | Direction | Schema | Description |
|---|---|---|---|
| `voucher:redeem` | C→S | `{ code }` | Player redeems voucher code. |
| `voucher:redeemed` | S→C (own player) | `{ amount, source }` | Successful redemption. |
| `voucher:rejected` | S→C (own player) | `{ reason }` | Rejection (expired/invalid/used). |

### 2.6 Chat

| Event | Direction | Schema | Description |
|---|---|---|---|
| `chat:send` | C→S | `{ roomCode, message }` | Player sends chat message. Fail-closed test: `chatEvents.failClosed.test.ts`. |
| `chat:history` | C→S | `{ roomCode }` | Request last N messages on join. |
| `chat:message` | S→C (broadcast) | `{ playerId, message, timestamp }` | New message. |

### 2.7 Stop-vote (GAP #38, REQ-145)

| Event | Direction | Schema | Description |
|---|---|---|---|
| `stop-vote:initiate` | C→S | `{ roomCode }` | Player triggers vote to stop the game. |
| `stop-vote:cast` | C→S | `{ roomCode, vote: yes\|no }` | Player casts vote. |
| `stop-vote:result` | S→C (broadcast) | `{ outcome, counts }` | Vote concluded. |

### 2.8 Wallet state

| Event | Direction | Schema | Description |
|---|---|---|---|
| `wallet:state` | S→C (own player) | `WalletStatePushPayload` | Push when balance changes (PR #725 wallet-state-pusher). |
| `wallet:loss-state-push` | S→C (own player) | `WalletLossStateEvent` | Loss-limit-state push (BIN-625). |
| `bet:rejected` | S→C (own player) | `BetRejectedEvent` | Loss-limit blocked bet:arm; UI shows reason (PR #725). |

### 2.9 Leaderboard

| Event | Direction | Schema | Description |
|---|---|---|---|
| `leaderboard:get` | C→S | `{ period, hallId? }` | Request leaderboard. |
| `leaderboard:data` | S→C (own caller) | `LeaderboardEntry[]` | Response. |

---

## 3. Catalog — Admin events (`/admin`)

### 3.1 Game 1 master-console

| Event | Direction | Schema | Description |
|---|---|---|---|
| `game1:hall-status-update` | S→C (admin) | `Game1HallStatusPayload` | Per-hall ready-state for multi-hall master view. |
| `game1:master-changed` | S→C (admin) | `{ newMasterId, hallId }` | Master-hall changed. |
| `game1:phase-won` | S→C (admin) | `Game1PhaseWonPayload` | Phase completion event for admin display. |
| `game1:transfer-request` | C→S (admin) | `{ targetHallId }` | Request to transfer master to another hall. |
| `game1:transfer-approved` | S→C (admin broadcast) | `{ ... }` | Target hall approved. |
| `game1:transfer-rejected` | S→C (admin broadcast) | `{ ... }` | Target hall declined. |
| `game1:transfer-expired` | S→C (admin broadcast) | `{ ... }` | 60s handoff window timed out. |

### 3.2 Hall TV-screen

| Event | Direction | Schema | Description |
|---|---|---|---|
| `hall:tv-url` | C→S (admin) | `{ hallId }` | Request signed TV URL. |
| `admin:hall-event` | S→C (admin) | `{ ... }` | Hall-level event push (status changes etc). |

### 3.3 Admin auth

| Event | Direction | Schema | Description |
|---|---|---|---|
| `admin:login` | C→S (admin) | `{ email, password }` | Admin auth handshake. |

---

## 4. REST endpoints (HTTP API)

The full OpenAPI spec is at [`apps/backend/openapi.yaml`](../../apps/backend/openapi.yaml). Highlights:

### 4.1 Auth (`/api/auth/*`)
- `POST /register` — new player account
- `POST /login` — email + password
- `POST /login-phone` — phone + PIN (REQ-130)
- `POST /2fa/setup` + `/verify` + `/login` (REQ-129)
- `GET /sessions` + `POST /sessions/logout-all` (REQ-132)

### 4.2 Wallet (`/api/wallet/*`)
- `GET /me` — balance + last 20 transactions
- `GET /me/compliance?hallId=...` — limits + can-play status
- `POST /me/topup` — manual top-up
- `POST /me/timed-pause` — voluntary pause
- `POST /me/self-exclusion` — 1-year self-exclusion (§23)
- `PUT /me/loss-limits` — set per-hall daily/monthly limits

### 4.3 Games (`/api/games/*`, `/api/rooms/*`)
- `GET /games` — list enabled games
- `GET /halls` — list active halls
- `POST /games/:slug/launch` — launch external game (Candy)
- `GET /rooms?hallId=...` — list active rooms
- `GET /rooms/:roomCode` — full snapshot

### 4.4 Spillevett (`/api/spillevett/*`)
- `GET /report?period=last7&hallId=...` — gambling-activity report
- `POST /report/export` — PDF export

### 4.5 Payments (`/api/payments/*`)
- `POST /swedbank/topup-intent` — start Swedbank Pay flow
- `POST /swedbank/callback` — webhook (HMAC-verified, PR BIN-603)
- `POST /payments/deposit-request` — manual cash/Vipps queue (BIN-586)

### 4.6 Admin
- `/api/admin/auth/*`, `/api/admin/halls/*`, `/api/admin/games/*`, `/api/admin/players/*`
- `/api/admin/payments/requests/*` (deposit/withdraw queue)
- `/api/admin/wallets/*` (compliance overrides)
- `/api/admin/reports/*` (daily, hall-account, settlement)
- `/api/admin/overskudd/*` (§11 distribution)
- `/api/admin/players/*/audit` — KYC + compliance audit log

### 4.7 Agent portal (`/api/agent/*`)
- `/api/agent/auth/*` — agent login + shift
- `/api/agent/cash-inout/*` — Cash In/Out, Unique ID, Settlement
- `/api/agent/metronia/*` + `/api/agent/okbingo/*` — machine integrations

---

## 5. Versioning + breaking changes

### 5.1 Backwards-compatible additions
- **Adding a new optional field to a payload** → no version bump.
- **Adding a new event** → just add to this catalog.

### 5.2 Breaking changes
- **Removing a field, changing a field's type, or renaming an event** → introduce a new event suffix (`-v2`), keep the old one for 30 days, and announce deprecation in PR description.

### 5.3 Schema validation
- Every C→S event handler MUST do `Schema.safeParse()` before acting. Failures throw `DomainError("INVALID_INPUT", ...)`. See [`claimEvents.ts`](../../apps/backend/src/sockets/gameEvents/claimEvents.ts) for the canonical pattern.

---

## 6. Known event-protocol-debt

| Item | Status | Owner | Notes |
|---|---|---|---|
| Mini-game-events use both `minigame:*` and `mini_game:*` namespaces | 🟡 cleanup | HV-1 in audit-report | Adapter PR #728 bridges legacy → M6 router |
| `room:state` and `room:update` are sometimes used interchangeably | 🟡 polish | — | Should standardize on `room:update` for deltas, `room:state` for full re-state. |
| Some scheduled-engine events not yet in shared-types | 🟡 — | post-pilot | E.g. `game1:transfer-*`-events have ad-hoc types in Game1HallReadyService. |
| No event versioning strategy in production yet | 🆕 — | next refactor | Currently no breaking-change has happened; need policy doc when first does. |

---

## 7. How to add a new event

1. Define payload + ack interface in `packages/shared-types/src/socket-events.ts`.
2. Add Zod schema for the payload (BIN-545 pattern).
3. Implement handler in appropriate `apps/backend/src/sockets/gameEvents/*.ts` file.
4. Use `parsed.safeParse()` validation at handler entry.
5. Add unit + integration tests.
6. **Add row to this catalog under correct §section.**
7. Reference catalog row in PR description.

CI gate (TODO) will fail if a new socket-event-name appears in a `*.ts` file but not in this `EVENT_PROTOCOL.md`.

---

**Maintained by:** PM-agent + per-PR contributor. Update at every PR that touches socket-events.
