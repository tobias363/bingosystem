# Module Catalog — Infra (sockets, util, auth, services, ports, jobs, middleware, routes)

**Generated:** 2026-04-28
**Scope:** `apps/backend/src/` infrastrukturlag — sockets, util, auth, services, ports, jobs, middleware, routes

Tredje katalog-PR i serien (Game-modul-katalog først, så Admin/Wallet, nå infra). Hver modul dokumenterer:
- Path + LOC
- Ansvar
- Public API
- Avhengigheter
- State-management
- Bug-testing-guide

Kataloger i serien:
1. `MODULE_CATALOG_GAME_2026-04-28.md` (game/ — engines, services, mini-games)
2. `MODULE_CATALOG_ADMIN_WALLET_2026-04-28.md` (admin/, wallet/, compliance/)
3. **`MODULE_CATALOG_INFRA_2026-04-28.md`** ← denne fila

---

## Master-index

### Sockets — gameEvents/-cluster
1. [`gameEvents/roomEvents.ts`](#1-gameeventsroomeventsts) — room lifecycle + bet:arm + lucky:set
2. [`gameEvents/ticketEvents.ts`](#2-gameeventsticketeventsts) — ticket:mark/replace/swap/cancel
3. [`gameEvents/drawEvents.ts`](#3-gameeventsdraweventsts) — draw:next + extra-draw rejection
4. [`gameEvents/claimEvents.ts`](#4-gameeventsclaimeventsts) — claim:submit (BINGO/LINE)
5. [`gameEvents/context.ts`](#5-gameeventscontextts) — registry + socket-context builder
6. [`gameEvents/deps.ts`](#6-gameeventsdepsts) — `GameEventsDeps` interface
7. [`gameEvents/lifecycleEvents.ts`](#7-gameeventslifecycleeventsts) — leaderboard:get + disconnect
8. [`gameEvents/miniGameEvents.ts`](#8-gameeventsminigameeventsts) — jackpot:spin + minigame:play
9. [`gameEvents/chatEvents.ts`](#9-gameeventschateventsts) — chat:send + chat:history
10. [`gameEvents/stopVoteEvents.ts`](#10-gameeventsstopvoteeventsts) — game:stop:vote (Spillvett)
11. [`gameEvents/voucherEvents.ts`](#11-gameeventsvouchereventsts) — voucher:redeem

### Sockets — root
12. [`adminHallEvents.ts`](#12-adminhalleventsts) — admin:hall-event channel (BIN-515)
13. [`adminOpsEvents.ts`](#13-adminopseventsts) — admin:ops:subscribe room
14. [`game1ScheduledEvents.ts`](#14-game1scheduledeventsts) — game1:join-scheduled
15. [`adminGame1Namespace.ts`](#15-admingame1namespacets) — `/admin-game1` Socket.IO-namespace
16. [`adminDisplayEvents.ts`](#16-admindisplayeventsts) — TV-screen subscribe
17. [`game1PlayerBroadcasterAdapter.ts`](#17-game1playerbroadcasteradapterts) — wire scheduled-game emits
18. [`gameEvents.ts`](#18-gameeventsts-fasade) — fasade som registrerer alle clusters
19. [`miniGameSocketWire.ts`](#19-minigamesocketwirets) — Game 1 mini-game broadcaster
20. [`walletStatePusher.ts`](#20-walletstatepusherts) — `wallet:state` autoritativ push (BIN-760)

### Util/
21. [`canonicalRoomCode.ts`](#21-canonicalroomcodets) — single-room-per-link mapping
22. [`roomState.ts`](#22-roomstatets) — `RoomStateManager` (armed players, lucky, display cache)
23. [`roomHelpers.ts`](#23-roomhelpersts) — stateless room-payload builders
24. [`staleRoomBootSweep.ts`](#24-staleroombootsweepts) — boot-sweep av legacy-rom
25. [`logger.ts`](#25-loggerts) — pino-basert structured logger med trace-merge
26. [`CircuitBreaker.ts`](#26-circuitbreakerts) — CLOSED/OPEN/HALF_OPEN-state
27. [`schedulerSetup.ts`](#27-schedulersetupts) — DrawScheduler-callback factory
28. [`traceContext.ts`](#28-tracecontextts) — AsyncLocalStorage trace-id
29. [`pgPool.ts`](#29-pgpoolts) — pool-tuning fra env
30. [`metrics.ts`](#30-metricsts) — Prometheus client
31. [`validation.ts`](#31-validationts) — `mustBe*`-helpers
32. [`envConfig.ts`](#32-envconfigts) — env→typed BingoRuntimeConfig
33. [`pdfExport.ts`](#33-pdfexportts) — PDFKit-baserte rapport-generatorer
34. [`csvExport.ts`](#34-csvexportts) — RFC 4180 CSV writer
35. [`csvImport.ts`](#35-csvimportts) — Excel-NO CSV parser
36. [`httpHelpers.ts`](#36-httphelpersts) — env-parsing + URL-helpers
37. [`osloTimezone.ts`](#37-oslotimezonets) — Europe/Oslo date-key utils
38. [`iso3166.ts`](#38-iso3166ts) — country-code-tabell
39. [`currency.ts`](#39-currencyts) — `roundCurrency` + cents-conversion
40. [`bingoSettings.ts`](#40-bingosettingsts) — `BingoSchedulerSettings`-interface

### Auth/
41. [`AuthTokenService.ts`](#41-authtokenservicets) — password-reset + email-verify tokens
42. [`SessionService.ts`](#42-sessionservicets) — REQ-132 session lifecycle
43. [`Totp.ts`](#43-totpts) — RFC 6238 TOTP
44. [`TwoFactorService.ts`](#44-twofactorservicets) — REQ-129 2FA
45. [`UserPinService.ts`](#45-userpinservicets) — REQ-130 phone+PIN-login
46. [`PasswordRotationService.ts`](#46-passwordrotationservicets) — REQ-131 90-day rotation
47. [`phoneValidation.ts`](#47-phonevalidationts) — norsk phone-normalisering
48. [`AuditLogService.ts`](#48-auditlogservicets-complianceauditlogservicets) — append-only audit log (compliance/)
49. [`AdminAccessPolicy.ts`](#49-adminaccesspolicyts-platformadminaccesspolicyts) — RBAC permission map (platform/)

### Services/ + adapters/ + ports/ (Fase 0+1 unified pipeline)
50. [`PayoutService.ts`](#50-payoutservicets) — atomic 4-step payout (Fase 1)
51. [`adapters/WalletAdapterPort.ts`](#51-adapterswalletadapterportts) — WalletPort wrapper rundt adapter-laget
52. [`adapters/ComplianceAdapterPort.ts`](#52-adapterscomplianceadapterportts) — CompliancePort wrapper
53. [`adapters/AuditAdapterPort.ts`](#53-adaptersauditadapterportts) — AuditPort wrapper
54. [`ports/WalletPort.ts`](#54-portswalletportts) — narrow wallet-kontrakt (cents)
55. [`ports/CompliancePort.ts`](#55-portscomplianceportts) — narrow ledger + spillevett-port
56. [`ports/AuditPort.ts`](#56-portsauditportts) — fire-and-forget audit-log
57. [`ports/HallPort.ts`](#57-portshallportts) — hall-lookup + isTestHall
58. [`ports/ClockPort.ts`](#58-portsclockportts) — Date.now() injection-point
59. [`ports/IdempotencyKeyPort.ts`](#59-portsidempotencykeyportts) — deterministic key generator

### Jobs/ (cron-jobs)
60. [`JobScheduler.ts`](#60-jobschedulerts) — generic interval-scheduler + Redis-lock
61. [`bankIdExpiryReminder.ts`](#61-bankidexpiryreminderts) — daglig BankID-expiry sweep
62. [`game1AutoDrawTick.ts`](#62-game1autodrawtickts) — Spill 1 auto-draw cron
63. [`game1ScheduleTick.ts`](#63-game1scheduletickts) — Spill 1 spawning + status-transitions
64. [`game1TransferExpiryTick.ts`](#64-game1transferexpiryticks) — 60s transfer-handshake TTL
65. [`gameStartNotifications.ts`](#65-gamestartnotificationsts) — FCM 5-min-pre-start push
66. [`idempotencyKeyCleanup.ts`](#66-idempotencykeycleanupts) — 90-dager wallet idempotency-cleanup
67. [`jackpotDailyTick.ts`](#67-jackpotdailytickts) — Spill 1 daglig jackpot-akkumulering
68. [`loyaltyMonthlyReset.ts`](#68-loyaltymonthlyresetts) — månedlig loyalty-points-reset
69. [`machineTicketAutoClose.ts`](#69-machineticketautocloseTs) — Metronia/OK Bingo daglig auto-close
70. [`profilePendingLossLimitFlush.ts`](#70-profilependinglosslimitflushts) — 48h queue-flush
71. [`selfExclusionCleanup.ts`](#71-selfexclusioncleanupts) — utløpt pause/exclusion cleanup
72. [`swedbankPaymentSync.ts`](#72-swedbankpaymentsyncts) — hourly payment-reconcile
73. [`uniqueIdExpiry.ts`](#73-uniqueidexpiryts) — Customer Unique ID expiry-flag
74. [`walletAuditVerify.ts`](#74-walletauditverifyts) — nightly hash-chain verifier (BIN-764)
75. [`walletReconciliation.ts`](#75-walletreconciliationts) — nightly wallet-vs-entries-divergens
76. [`xmlExportDailyTick.ts`](#76-xmlexportdailyticks) — withdrawal XML daily export

### Middleware/
77. [`SocketRateLimiter` — `socketRateLimit.ts`](#77-socketratelimitts) — sliding-window per socket
78. [`socketAuth` (via context)](#78-socketauth-via-gameeventscontext) — accessor i `getAuthenticatedSocketUser`
79. [`httpRateLimit.ts`](#79-httpratelimitts) — Express per-route rate-limit
80. [`socketTraceId.ts`](#80-sockettraceidts) — trace-id propagering for Socket.IO
81. [`traceId.ts`](#81-traceidts) — Express trace-id middleware
82. [`errorReporter.ts`](#82-errorreporterts) — Express + process-level error catcher

### Routes/ (104 filer — gruppert)
83. [Auth-gruppen](#83-routes-auth-gruppen) — auth, players, kyc, profile (16 filer)
84. [Admin-gruppen](#84-routes-admin-gruppen) — `admin*.ts` (70 filer)
85. [Agent-gruppen](#85-routes-agent-gruppen) — `agent*.ts` (18 filer)
86. [Game-gruppen](#86-routes-game-gruppen) — game.ts, game1Purchase.ts, tvScreen.ts, validateGameView.ts, voucher.ts (5 filer)
87. [Wallet-gruppen](#87-routes-wallet-gruppen) — wallet.ts, payments.ts, paymentRequests.ts (3 filer)
88. [System-gruppen](#88-routes-system-gruppen) — notifications.ts, publicCms.ts, tvVoiceAssets.ts, playerProfileImage.ts (4 filer)

---

## Sockets — gameEvents/-cluster

### 1. `gameEvents/roomEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/roomEvents.ts`
- **LOC:** 771

**Ansvar:** Room-lifecycle + pre-round arming/lucky-number socket handlers. Mutterer/leser room state før game running.

**Public API:**
- `registerRoomEvents(ctx: SocketContext): void`
- Events handled: `room:create`, `room:join`, `room:resume`, `room:configure`, `room:state`, `bet:arm`, `lucky:set`

**Avhengigheter:**
- `BingoEngine` (via `ctx.engine`)
- `getCanonicalRoomCode` / `isCanonicalRoomCode`
- `WalletAdapter.reserve` for `bet:arm` delta-reservation (BIN-693 Option B)
- `platformService.getHall()` for `isTestHall`-lookup (Demo Hall bypass)
- BINGO1-alias-mapping for legacy-klienter

**State-management:**
- Pre-round arming-state lever i `RoomStateManager` (delt mellom roomEvents + ticketEvents)
- Wallet-reservasjoner persisteres i `wallet_reservations` (DB-rad)
- Canonical room-mapping er deterministisk — ingen state-cache, recomputes per request

**Bug-testing-guide:**
- Multi-hall HALL_MISMATCH-bugs: sjekk `effectiveHallId=null` for shared rooms
- bet:arm delta-reservation race: `roomEvents.reservePreRoundDelta.test.ts`
- Idempotency for armed-cycles: `roomEvents.armCycleIdempotency.test.ts`
- Canonical lookup ved stale-rom: `roomEvents.canonicalAwareLookup.test.ts`

---

### 2. `gameEvents/ticketEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/ticketEvents.ts`
- **LOC:** 249

**Ansvar:** Ticket-cluster handlers — alle pre-round-operasjoner pluss høyfrekvens marker.

**Public API:**
- `registerTicketEvents(ctx: SocketContext): void`
- Events: `ticket:mark` (BIN-499 — privat ack, ingen room-fanout), `ticket:replace` (BIN-509/545), `ticket:swap` (BIN-585 Game 5), `ticket:cancel` (BIN-692)

**Avhengigheter:**
- Zod-schemas fra `@spillorama/shared-types/socket-events` for validering av replace/swap/cancel
- `IdempotencyKeys` for replace/cancel-keys
- `engine.markNumber()` (mark)
- `deps.replaceDisplayTicket` / `deps.cancelPreRoundTicket` (display-cache aware)

**State-management:**
- Display ticket cache (delt med roomEvents) i `RoomStateManager`
- Mark-state lever i engine — ingen socket-side cache

**Bug-testing-guide:**
- BIN-499: ticket:mark må IKKE trigge room-fanout (300k full-snapshot ved 1000 spillere). Verifiser `socket.emit("ticket:marked")` kun til avsender.
- replace med insufficient funds: forventet INSUFFICIENT_FUNDS, refund-flyt
- swap (gratis Game 5): ingen wallet-tx
- cancel: gjenåpner armed-cycle for re-arm

---

### 3. `gameEvents/drawEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/drawEvents.ts`
- **LOC:** 125

**Ansvar:** Draw-cluster — `draw:next` + `draw:extra:purchase` (alltid REJECTED). Game2/Game3-spesifikke wire-effekter via `emitG2DrawEvents`/`emitG3DrawEvents`.

**Public API:**
- `registerDrawEvents(ctx: SocketContext): void`
- Events: `draw:next`, `draw:extra:purchase`

**Avhengigheter:**
- `Game2Engine` / `Game3Engine` (instanceof-greining)
- `emitG2DrawEvents` / `emitG3DrawEvents` (drawEmits.ts)
- Prometheus metrics
- BIN-694: emit `pattern:won` for hver phase auto-claim som committet under `drawNextNumber`

**State-management:** Stateless — leser kun engine-snapshot før/etter draw.

**Bug-testing-guide:**
- BIN-694 phase-auto-claim emit-rekkefølge: snapshot won-pattern-IDs FØR draw, sammenlign etterpå
- G2/G3 instanceof-greining må ikke matche feil engine-type
- Extra-draw alltid REJECTED + audit-log

---

### 4. `gameEvents/claimEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/claimEvents.ts`
- **LOC:** 124

**Ansvar:** `claim:submit` — eneste trigger for mini-game (Game 1) og jackpot (Game 5) aktivering.

**Public API:**
- `registerClaimEvents(ctx: SocketContext): void`
- Event: `claim:submit`

**Avhengigheter:**
- `ClaimSubmitPayloadSchema` (BIN-545 Zod-validering)
- Sentry breadcrumbs + Prometheus metrics
- `engine.submitClaim` for state-mutering

**State-management:** Mini-game/jackpot-state lever i engine-laget. Ingen socket-side state.

**Bug-testing-guide:**
- BIN-545: avvis claim uten roomCode/type (Zod-feil)
- pattern:won emit etter vellykket claim
- mini-game-aktivering kun når Game 1 + claim-result triggrer rotasjon

---

### 5. `gameEvents/context.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/context.ts`
- **LOC:** 325

**Ansvar:** Shared handler-context. `RegistryContext` bygges én gang ved server-start; `SocketContext` per `socket`-connection legger til rate-limiter + auth-asserter.

**Public API:**
- `buildRegistryContext(deps: GameEventsDeps): RegistryContext`
- `buildSocketContext(socket, base, deps): SocketContext`
- `RegistryContext` interface: `ackSuccess`, `ackFailure`, `appendChatMessage`, `setLuckyNumber`, `getAuthenticatedSocketUser`, `assertUserCanActAsPlayer`
- `SocketContext` interface: extends `RegistryContext` with `socket`, `rateLimited`, `requireAuthenticatedPlayerAction`

**Avhengigheter:**
- `BingoEngine`, `PlatformService`
- `getAccessTokenFromSocketPayload`
- pino logger med scope `{ module: "gameEvents" }`
- DomainError → toPublicError mapping

**State-management:** RegistryContext er immutable. SocketContext har socket-id-scope rate-limit-state som ryddes på disconnect.

**Bug-testing-guide:**
- Rate-limit per-socket + per-walletId (BIN-247): verifiser `cleanup` på disconnect
- `appendChatMessage` MAX_CHAT_MESSAGES_PER_ROOM = 100 — sjekk ring-buffer-oppførsel
- DomainError → ack.error.code propagering

---

### 6. `gameEvents/deps.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/deps.ts`
- **LOC:** 151

**Ansvar:** `GameEventsDeps`-interface + `BingoSchedulerSettings`-typedef. Definerer ALLE eksterne avhengigheter handler-clusterne trenger.

**Public API:**
- `interface GameEventsDeps { engine, platformService, io, socketRateLimiter, emitRoomUpdate, emitManyRoomUpdates, buildRoomUpdatePayload, enforceSingleRoomPerHall, runtimeBingoSettings, chatHistoryByRoom, luckyNumbersByRoom, armedPlayerIdsByRoom, ... }`
- `interface BingoSchedulerSettings { autoRoundStartEnabled, autoRoundStartIntervalMs, autoRoundMinPlayers, autoRoundTicketsPerPlayer, autoRoundEntryFee, payoutPercent, autoDrawEnabled, autoDrawIntervalMs }`

**Avhengigheter:** Re-eksporterer typer fra `BingoEngine`, `PlatformService`, `SocketRateLimiter`, `RoomSnapshot`, `Ticket`, `RoomUpdatePayload`.

**State-management:** Type-only — ingen runtime-state.

**Bug-testing-guide:** N/A — ren type-fil.

---

### 7. `gameEvents/lifecycleEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/lifecycleEvents.ts`
- **LOC:** 48

**Ansvar:** Generelle socket-lifecycle handlers — `leaderboard:get` (read-only) og `disconnect` (cleanup).

**Public API:**
- `registerLifecycleEvents(ctx: SocketContext): void`
- Events: `leaderboard:get` (BIN-512), `disconnect` (Socket.IO native)

**Avhengigheter:**
- `deps.buildLeaderboard`
- `engine.detachSocket`
- `socketRateLimiter.cleanup`
- Prometheus `reconnectTotal` med disconnect-reason label
- Sentry breadcrumb

**State-management:** Cleanup-only.

**Bug-testing-guide:**
- BIN-539: disconnect må alltid cleane rate-limiter-state (memory leak)
- Reason-label må være bounded (Socket.IO enumererer)

---

### 8. `gameEvents/miniGameEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/miniGameEvents.ts`
- **LOC:** 54

**Ansvar:** Mini-game-handlers som SPILLER mini-gamet (ikke aktiverer det). Aktivering skjer i claimEvents.ts.

**Public API:**
- `registerMiniGameEvents(ctx: SocketContext): void`
- Events: `jackpot:spin` (Game 5 Spillorama), `minigame:play` (Game 1 Wheel of Fortune / Treasure Chest)

**Avhengigheter:**
- `engine.spinJackpot(roomCode, playerId)` (privat result til kalleren)
- `engine.playMiniGame(roomCode, playerId, selectedIndex)`

**State-management:** Mini-game-state lever i engine. Ingen socket-fanout — privat for vinneren.

**Bug-testing-guide:**
- Sjekk at result kun går til kalleren (ingen room.emit)
- selectedIndex undefined → engine bruker sin egen RNG

---

### 9. `gameEvents/chatEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/chatEvents.ts`
- **LOC:** 135

**Ansvar:** Chat-cluster (BIN-516) — fail-closed hall-scope-sjekk (Bølge D Issue 3, MEDIUM 2026-04-25).

**Public API:**
- `registerChatEvents(ctx: SocketContext): void`
- Events: `chat:send`, `chat:history`

**Avhengigheter:**
- `randomUUID` for message-ID
- `chatHistoryByRoom` Map (in-memory cache)
- ChatMessageStore (DB persistens, fire-and-forget)

**State-management:** In-memory ring-buffer (max 100 per rom) + DB-persistens via store. DB-feil svelges (chat fortsetter selv ved DB-syk).

**Bug-testing-guide:**
- `chatEvents.failClosed.test.ts`: spiller uten hallId → HALL_REQUIRED + log anomalous
- DB-feil må ikke blokkere chat-flow (fire-and-forget)

---

### 10. `gameEvents/stopVoteEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/stopVoteEvents.ts`
- **LOC:** 83

**Ansvar:** GAP #38 — Player-initiated stop-game (Spillvett-vote). Hver autentisert spiller i rommet kan kaste én stemme per running runde.

**Public API:**
- `registerStopVoteEvents(ctx: SocketContext): void`
- Event: `game:stop:vote`

**Avhengigheter:**
- `deps.spill1StopVoteService` (returnerer NOT_SUPPORTED i test-harness uten service)
- Threshold-logikk i service-laget

**State-management:** Vote-state per game-id i service-laget (DB-rad eller in-memory). Når threshold treffes → service stopper game og frigir wallet-reservasjoner.

**Bug-testing-guide:**
- NOT_SUPPORTED når service ikke wired (fail-fast deploy)
- Én spiller = én stemme (idempotency på (gameId, playerId))

---

### 11. `gameEvents/voucherEvents.ts`
- **Path:** `apps/backend/src/sockets/gameEvents/voucherEvents.ts`
- **LOC:** 139

**Ansvar:** BIN-587 B4b follow-up — voucher-redemption (per-spiller, ikke room-broadcast).

**Public API:**
- `registerVoucherEvents(ctx: SocketContext): void`
- Inn-event: `voucher:redeem` (med `validateOnly` flag)
- Ut-events (private til socket): `voucher:redeemed`, `voucher:rejected`

**Avhengigheter:**
- VoucherService (DB-rad i `app_voucher_redemptions`)
- UNIQUE(voucher_id, user_id) for one-per-player idempotens

**State-management:** Persistens i DB. Cache lever ikke socket-side.

**Bug-testing-guide:**
- validateOnly=true må returnere applied-discount UTEN å skrive redemption-rad
- One-per-player constraint via DB UNIQUE
- Legacy parity: `ApplyVoucherCode` (G2/G3/G4) shape

---

## Sockets — root

### 12. `adminHallEvents.ts`
- **Path:** `apps/backend/src/sockets/adminHallEvents.ts`
- **LOC:** 515

**Ansvar:** BIN-515 — Live operatør-channel for hall-controls (admin:login, admin:room-ready, admin:pause-game, admin:resume-game, admin:force-end). Komplementerer eksisterende HTTP-endpoints (BIN-460).

**Public API:**
- `AdminHallDeps` interface
- `registerAdminHallEvents(socket, deps): void`
- Events: `admin:login`, `admin:room-ready`, `admin:pause-game`, `admin:resume-game`, `admin:force-end`, `admin:hall-balance`

**Avhengigheter:**
- `BingoEngine` (pauseGame, resumeGame, endGame)
- `canAccessAdminPermission(role, "ROOM_CONTROL_WRITE")`
- `WalletAdapter` for hall-balance
- `AdminHallBalancePayloadSchema` (Zod)

**State-management:** `socket.data.adminUser` (auth-pinning via JWT). Per-event permission-check.

**Bug-testing-guide:**
- admin:login uten ROOM_CONTROL_WRITE → login OK, men hver event-call gir FORBIDDEN
- admin:force-end emitter `admin:hall-event` med reason for spectator-clients
- Idempotent emergency-stop mellom draws

---

### 13. `adminOpsEvents.ts`
- **Path:** `apps/backend/src/sockets/adminOpsEvents.ts`
- **LOC:** 137

**Ansvar:** ADMIN Ops Console (Tobias 2026-04-27). Klient subscriber til `admin:ops`-rom for force-actions + alerts.

**Public API:**
- `ADMIN_OPS_ROOM_KEY = "admin:ops"`
- `registerAdminOpsEvents(socket, rateLimiter): void`
- In-event: `admin:ops:subscribe`
- Out-event: `admin:ops:update` med `{ kind, payload, at }` shape

**Avhengigheter:**
- `OPS_CONSOLE_READ_ROLES = ["ADMIN", "SUPPORT"]` (mirror av AdminAccessPolicy)
- pino logger

**State-management:** Stateless — kun room-membership.

**Bug-testing-guide:**
- Subscribe uten OPS_CONSOLE_READ → ack({ ok: false, error: "FORBIDDEN" })
- Reconnect → re-subscribe må være idempotent

---

### 14. `game1ScheduledEvents.ts`
- **Path:** `apps/backend/src/sockets/game1ScheduledEvents.ts`
- **LOC:** 436

**Ansvar:** GAME1_SCHEDULE PR 4d.2 — socket player-join for schedulert Spill 1.

**Public API:**
- `Game1ScheduledEventsDeps`
- `registerGame1ScheduledEvents(socket, deps): void`
- Event: `game1:join-scheduled`

**Avhengigheter:**
- Postgres pool (SELECT app_game1_scheduled_games)
- `Game1DrawEngineService.assignRoomCode` (atomisk persist med race-safety)
- `engine.createRoom` / `engine.joinRoom`
- `Game1JoinScheduledPayloadSchema` (Zod)

**State-management:** Scheduled-game-state i DB (`app_game1_scheduled_games`). Room-code-binding på samme rad.

**Bug-testing-guide:**
- Status-validering: kun `purchase_open` eller `running` aksepteres
- hallId må være i `participating_halls_json`
- Race ved samtidige joins: assignRoomCode må være atomisk
- ACK shape matcher room:create/room:join

---

### 15. `adminGame1Namespace.ts`
- **Path:** `apps/backend/src/sockets/adminGame1Namespace.ts`
- **LOC:** 532

**Ansvar:** GAME1_SCHEDULE PR 4d.3 — `/admin-game1` Socket.IO-namespace for admin-konsoll real-time events.

**Public API:**
- Namespace-isolasjon med JWT-handshake-auth
- Events ut (read-only): `game1:status-update`, `game1:draw-progressed`, `game1:phase-won`, `game1:physical-ticket-won`, `game1:auto-paused`, `game1:resumed`
- Event inn: `game1:subscribe { gameId }` → join `game1:<gameId>`-room

**Avhengigheter:**
- `GAME1_MASTER_WRITE`-rolle (ADMIN/HALL_OPERATOR/AGENT)
- BingoEngine state-events
- Game1MasterCoordinationService

**State-management:** Per-namespace authentication state (socket-data). Per-game subscriber-set.

**Bug-testing-guide:**
- Auth via handshake (ikke per-event payload)
- Read-only fan-out: events inn skal ikke endre state
- Cross-game-broadcast: events filtrerer på gameId

---

### 16. `adminDisplayEvents.ts`
- **Path:** `apps/backend/src/sockets/adminDisplayEvents.ts`
- **LOC:** 283

**Ansvar:** BIN-498 — Hall TV-display (read-only). Login binder socket til EN hall; subscribe joiner kanonisk hall-room for live draw/pattern/room-events.

**Public API:**
- `AdminDisplayDeps`
- Events: `admin-display:login`, `admin-display:subscribe`, `admin-display:state` (server pusher snapshot)

**Avhengigheter:**
- `BingoEngine.getRoomSnapshot`
- PlatformService (hall-validation)

**State-management:** Login → subscribe binding hindrer cross-hall sniffing. socket.data.hallId pinned.

**Bug-testing-guide:**
- Subscribe uten matching hallId → FORBIDDEN
- State-snapshot pushes ved subscribe (ingen wait til neste event)
- Room-update-broadcast må gå til både player-sockets OG TV-display

---

### 17. `game1PlayerBroadcasterAdapter.ts`
- **Path:** `apps/backend/src/sockets/game1PlayerBroadcasterAdapter.ts`
- **LOC:** 102

**Ansvar:** PR-C4 — adapter som implementerer `Game1PlayerBroadcaster` på toppen av default-namespace io + emitRoomUpdate.

**Public API:**
- `createGame1PlayerBroadcasterAdapter(deps): Game1PlayerBroadcaster`
- Methods: `onDrawNew`, `onPatternWon`, `onRoomUpdate`

**Avhengigheter:**
- Socket.IO Server
- `emitRoomUpdate`-hook

**State-management:** Stateless — wrapper kun.

**Bug-testing-guide:**
- Verifiser at scheduled Spill 1-spiller-klient mottar samme wire som ad-hoc Spill 2/3 (`draw:new`, `pattern:won`, `room:update`)
- Fire-and-forget: ingen kast til service-laget

---

### 18. `gameEvents.ts` (fasade)
- **Path:** `apps/backend/src/sockets/gameEvents.ts`
- **LOC:** 57

**Ansvar:** PR-R4 fasade — wire-up av alle clusters via `createGameEventHandlers`. Bevarer bakoverkompatibilitet med eksisterende importer i `index.ts`.

**Public API:**
- `createGameEventHandlers(deps: GameEventsDeps): (socket: Socket) => void`
- Re-eksport: `BingoSchedulerSettings`, `GameEventsDeps`, `emitG3DrawEvents`

**Avhengigheter:** Importerer alle 10 cluster-filer.

**State-management:** Ingen — bygger context og delegater til clusters.

**Bug-testing-guide:** Smoke-test at alle 10 cluster-handlers registreres på samme socket.

---

### 19. `miniGameSocketWire.ts`
- **Path:** `apps/backend/src/sockets/miniGameSocketWire.ts`
- **LOC:** 385

**Ansvar:** BIN-MYSTERY Gap D — socket-wire for Game 1 mini-games (wheel, chest, colordraft, oddsen, mystery).

**Public API:**
- `createMiniGameSocketWire(io, orchestrator, platformService)`: returnerer `{ broadcaster, register(socket) }`
- Events ut: `mini_game:trigger`, `mini_game:result` (til user-private rom `mini-game:user:<userId>`)
- Event inn: `mini_game:choice` med ack

**Avhengigheter:**
- `Game1MiniGameOrchestrator.setBroadcaster()` (denne PR-en koblet det inn i composition-root)
- `mini_game:join` for idempotent rom-join

**State-management:** User-private rom-membership. Orchestrator-state lever der.

**Bug-testing-guide:**
- Verifiser at default `NoopMiniGameBroadcaster` IKKE er i bruk lenger
- mini_game:choice ack returnerer result, broadcaster.onResult emitter til user-rom
- Fail-safe: broadcaster try/catch må ikke påvirke orchestrator-state

---

### 20. `walletStatePusher.ts`
- **Path:** `apps/backend/src/sockets/walletStatePusher.ts`
- **LOC:** 177

**Ansvar:** BIN-760 — autoritativ `wallet:state`-channel separat fra game-state. Eliminerer hele room:update-stale-balance-kategorien.

**Public API:**
- `WalletStatePusher` klasse
- `pusher.pushForWallet(walletId, reason, source?)`
- `walletRoomKey(walletId): string` (returnerer `wallet:<walletId>`)

**Avhengigheter:**
- WalletAdapter (`getWalletAccount`, `getAvailableBalance`, sum reservations)
- Socket.IO Server

**State-management:** Stateless — fetcher fersk state per push.

**Bug-testing-guide:**
- Etter wallet-credit/debit/transfer/reserve commit → push må fyre
- Klient joiner `wallet:<walletId>` ved auth/room-join (idempotent)
- Ingen race med room:update — autoritative payload alltid

---

## Util/

### 21. `canonicalRoomCode.ts`
- **Path:** `apps/backend/src/util/canonicalRoomCode.ts`
- **LOC:** 120

**Ansvar:** Single-room-per-link mapping (Tobias 2026-04-27). Mapper `gameSlug + hallId + groupId?` til EN deterministisk room-code.

**Public API:**
- `interface CanonicalRoomMapping { roomCode, effectiveHallId, isHallShared }`
- `getCanonicalRoomCode(gameSlug, hallId, groupId?)`: returnerer mapping
- `isCanonicalRoomCode(code: string): boolean`

**Mappings:**
- `bingo` (Spill 1): per-LINK (`BINGO_<groupId>` eller `BINGO_<hallId>`)
- `rocket` (Spill 2): GLOBAL (`ROCKET`)
- `monsterbingo` (Spill 3): GLOBAL (`MONSTERBINGO`)
- ukjent slug: per-hall, slug uppercased

**Avhengigheter:** Ingen runtime — pure function.

**State-management:** Stateless.

**Bug-testing-guide:**
- `canonicalRoomCode.test.ts` — alle 4 game-slug-cases
- effectiveHallId=null for shared rooms (HALL_MISMATCH-relaksering)
- Spill 1 fallback når hall ikke i gruppe

---

### 22. `roomState.ts`
- **Path:** `apps/backend/src/util/roomState.ts`
- **LOC:** 517

**Ansvar:** `RoomStateManager` — encapsulates shared mutable Maps for room-level state (armed players, lucky numbers, display ticket cache, per-room configured entry fees).

**Public API:**
- `class RoomStateManager`
- `interface TicketSelection { type, qty, name? }`
- `interface ChatMessage { id, playerId, playerName, message, emojiId, createdAt }`
- `interface RoomVariantInfo { gameType, config }`
- Methods: `armPlayer`, `disarmPlayer`, `disarmAllPlayers`, `getArmedPlayerIds`, `setLuckyNumber`, `cancelPreRoundTicket`, `replaceDisplayTicket`, `bindVariantConfigForRoom`, `clearDisplayTicketCache`

**Avhengigheter:**
- `generateTicketForGame` for ticket-creation
- `getDefaultVariantConfig` / `buildVariantConfigFromSpill1Config`

**State-management:** Maps — én-tråds Node.js (GC sikrer ingen lekkasjer ved disarmAllPlayers).

**Bug-testing-guide:**
- `roomState.bindDefaultVariantConfig.test.ts` (Spill 1 default)
- `roomState.cancelPreRoundTicket.test.ts` — wallet-refund-flyt
- `roomState.displayTicketColors.test.ts` — color-cycling

---

### 23. `roomHelpers.ts`
- **Path:** `apps/backend/src/util/roomHelpers.ts`
- **LOC:** 486

**Ansvar:** Stateless room-payload builders. Alle mutable data sendes inn som arg.

**Public API:**
- `compareRoomPriority(a, b): number` (RUNNING > playerCount > createdAt > code)
- `getPrimaryRoomForHall(hallId, summaries)`
- `findPlayerInRoomByWallet(snapshot, walletId)`
- `buildRoomSchedulerState(snapshot, nowMs, opts)`
- `interface RoomUpdatePayload`

**Avhengigheter:**
- `RoomSnapshot`, `RoomSummary`, `Ticket` types
- `PatternDefinition` fra `@spillorama/shared-types/game`
- `expandSelectionsToTicketColors`, `patternConfigToDefinitions`
- `roundCurrency`

**State-management:** Stateless — pure functions.

**Bug-testing-guide:**
- `roomHelpers.preRoundColors.test.ts`
- `roomHelpers.variantPatterns.test.ts`
- `roomHelpers.jackpotAndTicketDetails.test.ts`
- `roomHelpers.roundStateIsolation.test.ts`

---

### 24. `staleRoomBootSweep.ts`
- **Path:** `apps/backend/src/util/staleRoomBootSweep.ts`
- **LOC:** 193

**Ansvar:** Tobias 2026-04-28 — boot-sweep av stale non-canonical rom som ble skapt FØR PR #677 (canonical-aware lookup). Kjøres ÉN gang ved boot, ETTER Redis-load + crash-recovery.

**Public API:**
- `interface StaleRoomSweepResult { inspected, canonical, destroyed[], skippedActive[], skippedAtCap }`
- `runStaleRoomBootSweep(engine, opts?): Promise<StaleRoomSweepResult>`

**Trygghetsregler:**
- RØR IKKE rom som er RUNNING/PAUSED/WAITING (selv non-canonical)
- Canonical rom (BINGO_*, ROCKET, MONSTERBINGO) destroyer aldri
- Maks 50 rom destroy per boot (cap mot kaskaderende destroy)

**Avhengigheter:**
- `isCanonicalRoomCode`
- `engine.destroyRoom` (rydder player-records, drawLocks, variantConfig, luckyNumbersByPlayer, roomStateStore)

**State-management:** Run-once-per-boot. Idempotent ved restart.

**Bug-testing-guide:**
- Pilot-emergency 2026-04-27: TestBruker81632 i 4RCQSX selv etter PR #677
- RUNNING rom destroyer aldri (selv om kode er non-canonical)
- Dropp >50 logger warn for ops-rydding

---

### 25. `logger.ts`
- **Path:** `apps/backend/src/util/logger.ts`
- **LOC:** 121

**Ansvar:** BIN-168/309 + MED-1 — Centralized structured JSON pino-logger med automatic redaction og trace-context-merge.

**Public API:**
- `import { logger } from "../util/logger.js"`
- `logger.info({ roomCode, playerId }, "msg")`
- `logger.child({ module: "scheduler" })`

**Redacted fields:** password, token, accessToken, refreshToken, sessionToken, nationalId, ssn, personnummer, cardNumber, cvv, cvc, authorization header, x-api-key header

**Trace-merge (MED-1):** traceId, requestId, userId, roomCode, gameId, hallId, socketId via AsyncLocalStorage.

**Konfigurasjon:**
- `LOG_LEVEL`: trace/debug/info/warn/error/fatal (default info)
- `NODE_ENV`: production → JSON; ellers structured-readable

**Avhengigheter:** `pino`, `getTraceMergeFields` fra traceContext.

**State-management:** Singleton + child-loggers.

**Bug-testing-guide:**
- Verifiser ingen plaintext password/token-leakage i logs
- traceId i alle logs innenfor request-scope

---

### 26. `CircuitBreaker.ts`
- **Path:** `apps/backend/src/util/CircuitBreaker.ts`
- **LOC:** 266

**Ansvar:** BIN-165/HIGH-8 — Reusable circuit breaker. CLOSED → OPEN → HALF_OPEN → CLOSED transitioner.

**Public API:**
- `class CircuitBreaker`
- `breaker.execute(fn): Promise<T>`
- Constructor: `{ threshold, resetMs }`

**Transisjoner:**
- CLOSED → OPEN: `threshold` consecutive failures
- OPEN → HALF_OPEN: `resetMs` elapsed
- HALF_OPEN → CLOSED: probe success
- HALF_OPEN → OPEN: probe fail (re-cool)

**Avhengigheter:** Ingen.

**State-management:** Per-breaker state — caller eier instansen.

**Bug-testing-guide:**
- Race ved samtidig HALF_OPEN-probe: kun ÉN in-flight
- Reset-timer korrekt etter hver OPEN-overgang
- `CircuitBreaker.test.ts`

---

### 27. `schedulerSetup.ts`
- **Path:** `apps/backend/src/util/schedulerSetup.ts`
- **LOC:** 246

**Ansvar:** DrawScheduler-callback factory + pending-settings logikk.

**Public API:**
- `interface SchedulerCallbackDeps`
- `createSchedulerCallbacks(deps): SchedulerCallbacks`
- `applyPendingBingoSettings(...)` — hot-reload av runtime-settings

**Avhengigheter:**
- `DrawScheduler`, `BingoEngine`, `Server` (Socket.IO)
- `BingoSchedulerSettings`
- `yesterdayOsloKey` for daily-report-trigger

**State-management:** Pending-settings lever i scheduler. Stateless callback-factory.

**Bug-testing-guide:**
- `schedulerSetup.dailyReport.test.ts` — verifiser daily-report-trigger ved Oslo-midnatt
- Pending-settings må applies kun ved scheduler-tick (ikke mid-round)

---

### 28. `traceContext.ts`
- **Path:** `apps/backend/src/util/traceContext.ts`
- **LOC:** 129

**Ansvar:** MED-1 — AsyncLocalStorage-basert trace-id propagation. Auto-merger inn i alle logger-kall i samme async-scope.

**Public API:**
- `runWithTraceContext(fields, fn)`
- `getTraceMergeFields(): Record<string, unknown>` (brukes av logger)
- `setTraceField(key, value)`

**Avhengigheter:** `node:async_hooks` (AsyncLocalStorage).

**State-management:** AsyncLocalStorage — automatisk per request/socket-event.

**Bug-testing-guide:**
- `traceContext.test.ts` — propagering på tvers av await/Promise/setTimeout
- Boundary-cases: nested runWithTraceContext, parallelle Promise.all

---

### 29. `pgPool.ts`
- **Path:** `apps/backend/src/util/pgPool.ts`
- **LOC:** 26

**Ansvar:** BIN-175 — Shared Postgres pool tuning fra env (`PG_POOL_MAX`, `PG_POOL_IDLE_TIMEOUT_MS`, `PG_POOL_CONNECTION_TIMEOUT_MS`).

**Public API:**
- `interface PgPoolTuning { max, idleTimeoutMillis, connectionTimeoutMillis }`
- `getPoolTuning(): PgPoolTuning`

**Defaults:** max=20, idle=30s, connect-timeout=5s.

**Avhengigheter:** Ingen.

**State-management:** Stateless.

**Bug-testing-guide:**
- Spreader inn i `new Pool({ ...connection, ...getPoolTuning() })`
- Negative/non-finite env-values → fallback

---

### 30. `metrics.ts`
- **Path:** `apps/backend/src/util/metrics.ts`
- **LOC:** 171

**Ansvar:** BIN-172 — Prometheus client. Exposed via `GET /metrics`.

**Public API:**
- `import { metrics } from "../util/metrics.js"`
- Counters: `drawErrors`, `reconnectTotal`, `walletReconciliationDivergenceTotal`, ...
- Gauges: `activeRooms`, `connectedSockets`, ...
- Histograms: `requestDurationMs`, ...

**Avhengigheter:** `prom-client` (default Node-metrics + custom registry).

**State-management:** Singleton registry.

**Bug-testing-guide:**
- Cardinality-guard på labels (BIN-539 reason-label må være bounded)

---

### 31. `validation.ts`
- **Path:** `apps/backend/src/util/validation.ts`
- **LOC:** 119

**Ansvar:** BIN-167 — Shared `mustBe*`-helpers. Kaster `DomainError("INVALID_INPUT")` på feil shape.

**Public API:**
- `mustBeNonEmptyString(value, fieldName): string`
- `mustBePositiveAmount(value, fieldName?): number`
- `mustBeIntegerInRange(value, min, max, fieldName)`

**Avhengigheter:** `DomainError` fra `BingoEngine.js`.

**State-management:** Pure functions.

**Bug-testing-guide:** Edge-cases: tom string, "0", -1, NaN, Infinity, undefined.

---

### 32. `envConfig.ts`
- **Path:** `apps/backend/src/util/envConfig.ts`
- **LOC:** 426

**Ansvar:** Environment configuration parser. Konverterer `process.env` til typed config-objekter (`BingoRuntimeConfig`).

**Public API:**
- `interface BingoRuntimeConfig` — alle compliance-limits, scheduler-settings, feature-flags
- `parseRuntimeConfig(): BingoRuntimeConfig`

**Avhengigheter:** `parseBooleanEnv`, `parsePositiveIntEnv`, `parseNonNegativeNumberEnv` (fra httpHelpers).

**State-management:** Stateless — kalles én gang ved boot.

**Bug-testing-guide:** Test alle env-default-fallbacks.

---

### 33. `pdfExport.ts`
- **Path:** `apps/backend/src/util/pdfExport.ts`
- **LOC:** 428

**Ansvar:** BIN-588 — Shared PDF helpers + generic admin/report exports.

**Public API:**
- `generateTransactionReceiptPdf(deps, data)` — per-user wallet-tx-print
- `generatePlayerHistoryPdf(deps, data)` — player play-summary across halls
- `generateDailyCashSettlementPdf(deps, data)` — operator daily settlement

**Avhengigheter:** `pdfkit`. Komplementerer `spillevett/reportExport.ts` (BIN-272).

**State-management:** Stateless.

**Bug-testing-guide:** `pdfExport.test.ts` — verifiser PDF-bytes ikke-tom + headers.

---

### 34. `csvExport.ts`
- **Path:** `apps/backend/src/util/csvExport.ts`
- **LOC:** 122

**Ansvar:** BIN-588 — RFC 4180 CSV-writer med konfigurerbar separator (komma international, semikolon for Norsk regnskap/Excel-NO).

**Public API:**
- `writeCsvRow(values: string[], separator?)`
- `escapeCsvField(value: unknown): string`

**Avhengigheter:** Ingen — zero deps.

**State-management:** Stateless.

**Bug-testing-guide:** `csv.test.ts` — embedded comma/semicolon, newline, double-quote.

---

### 35. `csvImport.ts`
- **Path:** `apps/backend/src/util/csvImport.ts`
- **LOC:** 221

**Ansvar:** Excel-NO CSV parser (semicolon + UTF-8 BOM + CRLF). Brukes av admin Excel-import (Approved Players).

**Public API:**
- `parseCsv(content, opts?): string[][]`
- `detectDialect(content): { separator, hasBOM }`

**Avhengigheter:** Ingen.

**State-management:** Stateless.

**Bug-testing-guide:** Excel-NO files med BOM, embedded quotes.

---

### 36. `httpHelpers.ts`
- **Path:** `apps/backend/src/util/httpHelpers.ts`
- **LOC:** 282

**Ansvar:** Env-parsing helpers + URL/period-helpers.

**Public API:**
- `parseBooleanEnv(value, fallback)`
- `parsePositiveIntEnv`, `parseNonNegativeNumberEnv`
- `parseTicketsPerPlayerInput(input)`
- `getAccessTokenFromSocketPayload(payload)`
- `mustBeNonEmptyString` (re-export fra validation)
- `parseOptionalNonNegativeNumber`

**Avhengigheter:** `express`, `node:url`, `DomainError`.

**State-management:** Stateless.

**Bug-testing-guide:** Test alle parse-helpers ved invalid input.

---

### 37. `osloTimezone.ts`
- **Path:** `apps/backend/src/util/osloTimezone.ts`
- **LOC:** 141

**Ansvar:** LOW-2 (Casino-review 2026-04-26) — Europe/Oslo date-key utils. Daglige akkumuleringer/reports må nullstille på Norge-midnatt, ikke UTC-midnatt.

**Public API:**
- `osloDateKey(date?): string` (YYYY-MM-DD i Oslo-tz)
- `yesterdayOsloKey(now?): string`
- `osloMidnight(date?): Date`

**Avhengigheter:** `Intl.DateTimeFormat` (DST-håndtering automatisk).

**State-management:** Stateless.

**Bug-testing-guide:**
- `osloTimezone.test.ts` — DST-overgang, sommer-/vintertid
- Runde over Norge-midnatt mellom 00:00 og 01/02 UTC må havne i riktig dag
- BIN-584-fix: jackpot-akkumulering bruker dette nå

---

### 38. `iso3166.ts`
- **Path:** `apps/backend/src/util/iso3166.ts`
- **LOC:** 325

**Ansvar:** Country-code-tabell (ISO 3166-1 alpha-2).

**Public API:**
- `iso3166CountryCodes`: ReadonlyMap<string, string>
- `isValidCountryCode(code): boolean`
- `getCountryName(code): string | null`

**Avhengigheter:** Ingen.

**State-management:** Const-Map.

**Bug-testing-guide:** `iso3166.test.ts` — alle 249 ISO-koder.

---

### 39. `currency.ts`
- **Path:** `apps/backend/src/util/currency.ts`
- **LOC:** 33

**Ansvar:** `roundCurrency` + cents↔kroner-konvertering.

**Public API:**
- `roundCurrency(value: number): number` (rund til 2 desimaler)
- `nokToCents(nok: number): number`
- `centsToNok(cents: number): number`

**Avhengigheter:** Ingen.

**State-management:** Stateless.

**Bug-testing-guide:** `currency.test.ts` — floating-point edge-cases (0.1+0.2).

---

### 40. `bingoSettings.ts`
- **Path:** `apps/backend/src/util/bingoSettings.ts`
- **LOC:** 120

**Ansvar:** `BingoSchedulerSettings`-typedef + defaults. Brukes som runtime-settings i scheduler/engine.

**Public API:**
- `interface BingoSchedulerSettings { autoRoundStartEnabled, autoRoundStartIntervalMs, autoRoundMinPlayers, autoRoundTicketsPerPlayer, autoRoundEntryFee, payoutPercent, autoDrawEnabled, autoDrawIntervalMs }`
- `getDefaultBingoSchedulerSettings(): BingoSchedulerSettings`

**Avhengigheter:** Ingen.

**State-management:** Type-only + defaults.

**Bug-testing-guide:** N/A — pure types.

---

## Auth/

### 41. `AuthTokenService.ts`
- **Path:** `apps/backend/src/auth/AuthTokenService.ts`
- **LOC:** 250

**Ansvar:** BIN-587 B2.1 — Single-use token-service for password-reset og e-post-verify. SHA-256-hash av token som DB-kolonne.

**Public API:**
- `class AuthTokenService`
- `createPasswordResetToken(userId): Promise<CreateTokenResult>`
- `createEmailVerifyToken(userId): Promise<CreateTokenResult>`
- `validate(kind, token): Promise<userId | null>`
- `consume(kind, token): Promise<void>` (markerer used_at = now())

**TTL defaults:** password-reset 1t, email-verify 48t.

**Avhengigheter:** `pg`, `node:crypto` (randomBytes, createHash, randomUUID).

**State-management:** DB-rad i `app_auth_tokens`.

**Bug-testing-guide:**
- Klartekst-token returneres KUN ved create — aldri lagret
- consume må være atomisk (caller koordinerer med sin operasjon)
- Validate må sjekke expires_at + used_at

---

### 42. `SessionService.ts`
- **Path:** `apps/backend/src/auth/SessionService.ts`
- **LOC:** 303

**Ansvar:** REQ-132 — Session-håndtering. List aktive, logout-all, logout-spesifikk, 30-min inactivity-timeout, last_activity-tracking.

**Public API:**
- `class SessionService`
- `listActiveSessions(userId): Promise<Session[]>`
- `revokeSession(sessionId): Promise<void>`
- `logoutAll(userId, exceptCurrent?): Promise<void>`
- `recordLogin(sessionId, userAgent, ipAddress)`
- `touchActivity(sessionId): Promise<void>` (throttled 60s + 30-min timeout)

**Defaults:** INACTIVITY_TIMEOUT_MS = 30min, TOUCH_THROTTLE_MS = 60s.

**Avhengigheter:** `pg`, `getPoolTuning`. Komplementerer `PlatformService.createSession`.

**State-management:** DB-kolonner `app_sessions.{device_user_agent, ip_address, last_activity_at}`.

**Bug-testing-guide:**
- 30-min timeout: touch fanger og revoker
- Touch throttling: ikke DB-skriving < 60s
- Logout-all må respektere exceptCurrent

---

### 43. `Totp.ts`
- **Path:** `apps/backend/src/auth/Totp.ts`
- **LOC:** 168

**Ansvar:** REQ-129 — TOTP (RFC 6238 + RFC 4648 Base32) uten eksterne pakker.

**Public API:**
- `generateTotpSecret(): string` (Base32-encoded)
- `verifyTotpCode(secret, code): boolean` (±1 step / 90s vindu)
- `buildOtpauthUri(secret, accountName, issuer): string`

**Avhengigheter:** `node:crypto` (createHmac, randomBytes, timingSafeEqual).

**State-management:** Stateless. Replay-prevention via challenge-konsumering på laget over.

**Bug-testing-guide:**
- Verifiser mot Google Authenticator / 1Password / Authy
- ±1 step (90s vindu totalt)
- timingSafeEqual må brukes for code-comparison

---

### 44. `TwoFactorService.ts`
- **Path:** `apps/backend/src/auth/TwoFactorService.ts`
- **LOC:** 518

**Ansvar:** REQ-129 — Two-factor (TOTP) service. Håndterer livssyklusen til 2FA per bruker.

**Public API:**
- `class TwoFactorService`
- `setup(userId): Promise<{ secret, otpauthUri }>`
- `verifyAndEnable(userId, code): Promise<{ backupCodes: string[] }>`
- `verifyTotpForLogin(userId, code): Promise<boolean>` (TOTP eller backup)
- `disable(userId, code): Promise<void>`
- `getStatus(userId)` / `isEnabled(userId)`
- `createChallenge(userId)` / `consumeChallenge(challengeId)`

**Defaults:** CHALLENGE_TTL_MS = 5 min, BACKUP_CODE_COUNT = 10. Backup-format `XXXXX-XXXXX`.

**Avhengigheter:** `pg`, `node:crypto`, `Totp.ts`. Tabeller: `app_user_2fa`, `app_user_2fa_backup_codes`, `app_user_2fa_challenges`.

**State-management:** DB-rader; backup-codes single-use (sletter ved bruk).

**Bug-testing-guide:**
- Backup-codes single-use
- Challenge må konsumeres ved første match
- Disable krever TOTP-kode (eller passord på rute-nivå)

---

### 45. `UserPinService.ts`
- **Path:** `apps/backend/src/auth/UserPinService.ts`
- **LOC:** 365

**Ansvar:** REQ-130 — Phone+PIN-login. Setup, verify, disable. Lockout etter 5 feilede forsøk innen 15 min.

**Public API:**
- `class UserPinService`
- `setupPin(userId, pin): Promise<void>`
- `verifyPin(userId, pin): Promise<boolean>`
- `disablePin(userId): Promise<void>`
- `getPinStatus(userId)`

**Hashing:** scrypt (Node-built-in) — konsistent med `PlatformService.hashPassword`.

**Lockout:** failed_attempts >= 5 → locked_until = now() + LOCK_FAR_FUTURE_MS (admin-reset kreves).

**Avhengigheter:** `pg`, `node:crypto` (scrypt promisified, timingSafeEqual).

**State-management:** Tabell `app_user_pins`.

**Bug-testing-guide:**
- 5 feilede → lockout
- Vellykket nullstiller failed_attempts + locked_until
- timingSafeEqual for hash-comparison

---

### 46. `PasswordRotationService.ts`
- **Path:** `apps/backend/src/auth/PasswordRotationService.ts`
- **LOC:** 166

**Ansvar:** REQ-131 — 90-day password rotation. Per Wireframe Catalog (Frontend CR PDF 9 §8.2.2).

**Public API:**
- `class PasswordRotationService`
- `getRotationStatus(userId): Promise<{ daysRemaining, needsRotation }>`
- `recordPasswordChange(userId): Promise<void>`

**Konfigurasjon:** `PASSWORD_ROTATION_DAYS` (default 90). 0/negativ = deaktivert.

**Avhengigheter:** `pg`. Tabell-kolonne `app_users.password_changed_at`.

**State-management:** Stateless — beregner days-remaining per request.

**Bug-testing-guide:**
- Disabled (0) → alltid needsRotation=false
- 89 dager → daysRemaining=1, needsRotation=false
- 91 dager → needsRotation=true

---

### 47. `phoneValidation.ts`
- **Path:** `apps/backend/src/auth/phoneValidation.ts`
- **LOC:** 63

**Ansvar:** REQ-130 — Norsk telefonnummer-validering for Phone+PIN-login.

**Public API:**
- `normalizeNorwegianPhone(input): string` (returnerer `+47XXXXXXXX` eller kaster DomainError)

**Aksepterer:** `+47XXXXXXXX`, `0047XXXXXXXX`, `XXXXXXXX` (8-sifret nasjonalt). Mellomrom/bindestrek tillatt og fjernes.

**Avhengigheter:** `DomainError` fra BingoEngine.

**State-management:** Stateless.

**Bug-testing-guide:** Edge-cases: 7 sifre, 9 sifre, alfa-tegn, leading 0.

---

### 48. `AuditLogService.ts` (compliance/AuditLogService.ts)
- **Path:** `apps/backend/src/compliance/AuditLogService.ts`
- **LOC:** 442

**Ansvar:** BIN-588 — Centralised compliance audit log. Append-only. Erstatter scattered console.log + per-controller DB-writes.

**Public API:**
- `class AuditLogService`
- `record(input: AuditLogInput): Promise<void>` (fire-and-forget)
- `list(filter): Promise<AuditLogEntry[]>`
- `interface AuditLogInput { actorId, actorType, action, resource, resourceId, details, ipAddress, userAgent }`
- `type AuditActorType = "USER" | "ADMIN" | "HALL_OPERATOR" | "SUPPORT" | "PLAYER" | "SYSTEM"`

**Designvalg:**
- Immutable (no update/delete API)
- Fire-and-forget (DB-feil må aldri blokkere domain operations)
- PII redaction ved write-time (password, token, ssn, etc.)
- To impl: Postgres + in-memory (test-mocking)

**Avhengigheter:** `pg`, pino logger.

**State-management:** DB-rad i `app_audit_log`.

**Bug-testing-guide:**
- DB-feil må kun logge warning, ikke kaste
- PII-redaction (password, token, ssn) før write
- Action-strings stable dotted verbs (`player.kyc.approve`)

---

### 49. `AdminAccessPolicy.ts` (platform/AdminAccessPolicy.ts)
- **Path:** `apps/backend/src/platform/AdminAccessPolicy.ts`
- **LOC:** 513

**Ansvar:** RBAC permission map — sentral kilde for hvem som har lov til hva (per kjent permission-key).

**Public API:**
- `canAccessAdminPermission(role: UserRole, permission: AdminPermission): boolean`
- `assertAdminPermission(role, permission): void` (kaster `DomainError("FORBIDDEN")`)
- `enum AdminPermission` (~70 keys)

**Eksempel-permissions:**
- `ADMIN_PANEL_ACCESS`, `GAME_CATALOG_READ/WRITE`, `HALL_READ/WRITE`, `ROOM_CONTROL_WRITE`, `PAYMENT_REQUEST_READ/WRITE`, `PLAYER_KYC_READ/MODERATE/OVERRIDE`, `OPS_CONSOLE_READ`, ...

**Roller:** ADMIN, HALL_OPERATOR, SUPPORT, AGENT, PLAYER.

**Avhengigheter:** `DomainError`, `UserRole` fra `PlatformService`.

**State-management:** Const map — kompilerer ned til lookup-table.

**Bug-testing-guide:**
- Hver permission må være listet (compile-time exhaustiveness)
- Hall-scope-checks håndheves av call-stedet, ikke her

---

## Services/ + adapters/ + ports/ (Fase 0+1 unified pipeline)

### 50. `PayoutService.ts`
- **Path:** `apps/backend/src/services/PayoutService.ts`
- **LOC:** 592

**Ansvar:** Unified pipeline Fase 1 — Sentral atomic 4-step payout-service. Erstatter inline 3-step-mønsteret duplisert i 12+ kall-sites (Game1PayoutService, BingoEngine.payoutPhaseWinner, Game2/3Engine, MiniGameOddsenEngine, PotEvaluator, ...).

**Public API:**
- `class PayoutService`
- `payoutPhase(input: PayoutPhaseInput): Promise<PayoutPhaseResult>`
  - 1. Wallet-credit (én per vinner)
  - 2. Compliance-ledger PRIZE-event (én per vinner)
  - 3. Compliance-ledger HOUSE_RETAINED (hvis split-rounding rest)
  - 4. Audit-log-event (én per phase, summarisert)
- `splitPrize(totalCents, winnerCount): { perWinnerCents, houseRetained }`

**Atomicity-kontrakt:** Caller eier transaksjonen (typisk via `wallet.withTransaction`). PayoutService lager ingen ny tx — respekterer caller-tx eller best-effort.

**Feil-håndtering:**
- Wallet-credit-feil → kaster `PayoutWalletCreditError` (caller forventes å rolle tilbake)
- Compliance-ledger-feil → soft-fail (logger pino-warn, fortsetter)
- Audit-log-feil → soft-fail (fire-and-forget)

**Idempotency:** Wallet + compliance idempotent på `idempotencyKey`. Audit fire-and-forget (re-kall skriver flere rader).

**Multi-hall §71-binding:** Hver winner-kjøp bindes til kjøpe-hallen (ikke master), per Code Review #3 + K1-fix.

**Avhengigheter:** `WalletPort`, `CompliancePort`, `AuditPort`, `IdempotencyKeyPort`.

**State-management:** Stateless.

**Bug-testing-guide:**
- `PayoutService.test.ts` (Fase 0 invariant-tester)
- `PayoutServiceWithAdapters.test.ts` (Fase 1 — verify wiring)
- splitPrize: floor + houseRetained ∈ [0, winnerCount)
- Idempotent retry: skal ikke skrive duplikat wallet-tx eller ledger-rad

---

### 51. `adapters/WalletAdapterPort.ts`
- **Path:** `apps/backend/src/services/adapters/WalletAdapterPort.ts`
- **LOC:** 126

**Ansvar:** Unified pipeline Fase 1 — Wrapper som lar eksisterende kroner-baserte `WalletAdapter` brukes via cents-baserte `WalletPort`-kontrakten.

**Public API:**
- `class WalletAdapterPort implements WalletPort`
- Methods: `reserve`, `commitReservation`, `releaseReservation`, `credit`, `debit`, `getBalance`

**Konvertering:** cents-input fra port → `amountCents / 100` ved videresending. `Number.isInteger`-check unngår rundefeil.

**Avhengigheter:** `WalletAdapter` + `WalletError`. `WalletPort`-kontrakten + types.

**State-management:** Stateless wrapper.

**Bug-testing-guide:**
- Cents må alltid være heltall (ellers kast INVALID_AMOUNT)
- targetSide: "winnings" videresendes til `to: "winnings"` (admin-route-forbud bevart)
- Reserve-flyten: kast RESERVATION_NOT_SUPPORTED hvis adapter mangler

---

### 52. `adapters/ComplianceAdapterPort.ts`
- **Path:** `apps/backend/src/services/adapters/ComplianceAdapterPort.ts`
- **LOC:** 117

**Ansvar:** Unified pipeline Fase 1 — Wrapper som lar legacy `ComplianceLedgerPort` brukes via Fase 0 `CompliancePort`-kontrakten.

**Public API:**
- `class ComplianceAdapterPort implements CompliancePort`
- `recordEvent(event, idempotencyKey)` (videresender + injecter key i metadata)
- `isWalletAllowedForGameplay` / `wouldExceedLossLimit` — STUBS (returnerer "tillatt"; PayoutService bruker ikke disse)

**Avhengigheter:** `ComplianceLedgerPort`, pino logger.

**State-management:** Stateless.

**Bug-testing-guide:**
- Idempotency-key i metadata for traceability (DB UNIQUE-constraint håndhever idempotensen)
- Soft-fail kun for skrive-feil — caller velger om feilen kastes videre

---

### 53. `adapters/AuditAdapterPort.ts`
- **Path:** `apps/backend/src/services/adapters/AuditAdapterPort.ts`
- **LOC:** 35

**Ansvar:** Unified pipeline Fase 1 — Wrapper rundt `AuditLogService` for `AuditPort`-kontrakten.

**Public API:**
- `class AuditAdapterPort implements AuditPort`
- `log(event: AuditEvent): Promise<void>`

**Avhengigheter:** `AuditLogService`. Forberedt for Fase 2-split (game-/compliance-/security-audit).

**State-management:** Stateless.

**Bug-testing-guide:** Fire-and-forget kontrakt — kaster aldri.

---

### 54. `ports/WalletPort.ts`
- **Path:** `apps/backend/src/ports/WalletPort.ts`
- **LOC:** 152

**Ansvar:** Unified pipeline Fase 0 — narrow wallet-kontrakt (cents-basert) for game-pipelinen.

**Public API:**
- `interface WalletPort`: `reserve`, `commitReservation`, `releaseReservation`, `credit`, `debit`, `getBalance`
- `interface ReserveInput { walletId, amountCents, idempotencyKey, roomCode, expiresAt? }`
- `interface CommitReservationInput { reservationId, toAccountId, reason, targetSide?, idempotencyKey?, gameSessionId? }`
- `interface CreditInput / DebitInput`

**Beløp:** cents (NOK-øre) gjennom hele porten — adapter konverterer.

**Implementasjoner:** `InMemoryWalletPort` (Fase 0) + `WalletAdapterPort` (Fase 1).

**Avhengigheter:** Re-eksport av types fra `WalletAdapter`.

**State-management:** Type-only.

**Bug-testing-guide:** Invariant-tester i `services/__tests__/PayoutService.test.ts` med InMemoryWalletPort.

---

### 55. `ports/CompliancePort.ts`
- **Path:** `apps/backend/src/ports/CompliancePort.ts`
- **LOC:** 134

**Ansvar:** Unified pipeline Fase 0 — narrow compliance-ledger + spillevett-port.

**Public API:**
- `interface CompliancePort`: `recordEvent`, `isWalletAllowedForGameplay`, `wouldExceedLossLimit`
- `interface ComplianceEvent { hallId, gameType, channel, eventType, amount, ... }`
- `interface ComplianceAllowResult / LossLimitCheckResult`

**Bug-bakgrunn:** PILOT-STOP-SHIP 2026-04-28 — `recordComplianceLedgerEvent` ble kalt fra 12+ steder med samme idempotency-bug-mønster. UNIQUE-constraint på `app_rg_compliance_ledger.idempotency_key` (migrasjon `20260428080000_compliance_ledger_idempotency.sql`) håndhever nå idempotensen.

**Regulatorisk:** §71-rapport krever `hallId` lik kjøpe-hall, ikke master. §22/23 + §25 håndheves via `isWalletAllowedForGameplay` + `wouldExceedLossLimit`.

**Avhengigheter:** Type-only (`LedgerChannel`, `LedgerEventType`, `LedgerGameType`).

**State-management:** Type-only.

**Bug-testing-guide:** UNIQUE-constraint test — re-kall med samme key må returnere uten å skrive.

---

### 56. `ports/AuditPort.ts`
- **Path:** `apps/backend/src/ports/AuditPort.ts`
- **LOC:** 53

**Ansvar:** Unified pipeline Fase 0 — narrow audit-port. Game-pipelinen kan KUN logge, ikke lese/filtrere.

**Public API:**
- `interface AuditPort { log(event: AuditEvent): Promise<void> }`
- `interface AuditEvent { actorId, actorType, action, resource, resourceId, details?, ipAddress?, userAgent? }`

**Fire-and-forget:** `log()` skal ikke kaste. Implementasjonen logger pino-warning på skrive-feil.

**Implementasjoner:** `InMemoryAuditPort` (Fase 0) + `AuditAdapterPort` (Fase 1).

**Avhengigheter:** Type-only.

**State-management:** Type-only.

**Bug-testing-guide:** N/A — ren type-fil.

---

### 57. `ports/HallPort.ts`
- **Path:** `apps/backend/src/ports/HallPort.ts`
- **LOC:** 99

**Ansvar:** Unified pipeline Fase 0 — narrow hall-lookup. Bug-bakgrunn: `isTestHall`-bug-mønsteret (#660, #671, #677) skyldes manuell propagering av flagget gjennom 3-5 call-sites.

**Public API:**
- `interface HallPort`: `getHall(hallId)`, `getGroupForHall(hallId)`, `isTestHall(hallId): Promise<boolean>`
- `interface Hall { id, slug, name, isActive, isTestHall }` (subset av `HallDefinition`)
- `interface HallGroup { id, name, memberHallIds }`
- Helpers: `mapHallDefinitionToPortHall`, `mapHallGroupDefToPortGroup`

**Implementasjoner:** `InMemoryHallPort` (Fase 0).

**Avhengigheter:** Re-eksport av `HallDefinition`, `HallGroup` types.

**State-management:** Type-only.

**Bug-testing-guide:**
- Ukjent hallId → `isTestHall` returnerer FALSE (defensiv)
- mapHallDefinitionToPortHall: `isTestHall === true` (ikke truthy)

---

### 58. `ports/ClockPort.ts`
- **Path:** `apps/backend/src/ports/ClockPort.ts`
- **LOC:** 32

**Ansvar:** Unified pipeline Fase 0 — `Date.now()` / `new Date()` injection-point.

**Public API:**
- `interface ClockPort { now(): Date; nowMs(): number }`

**Implementasjoner:**
- `SystemClockPort` (Fase 0) — bruker `Date.now()`
- `FakeClockPort` (Fase 0) — fryst tid for tester
- `OsloBusinessDayClockPort` (Fase 1) — vrir til Europe/Oslo business-day-grense for jackpot

**Bug-bakgrunn:** Game1JackpotStateService Oslo-tz-bug (#584) — hardkodet `Date.now()` mot UTC.

**Avhengigheter:** Ingen.

**State-management:** Type-only — implementasjoner eier sin state (FakeClockPort har mutable now).

**Bug-testing-guide:** `FakeClockPort` for å fryse tid + tick til boundary-cases (Oslo-midnatt med DST).

---

### 59. `ports/IdempotencyKeyPort.ts`
- **Path:** `apps/backend/src/ports/IdempotencyKeyPort.ts`
- **LOC:** 119

**Ansvar:** Unified pipeline Fase 0 — Sentral kilde for deterministiske idempotency-keys for `WalletPort`, `CompliancePort` og `AgentTransactionService`.

**Bug-bakgrunn:**
- Compliance-ledger-bug fra 12+ steder skyldes per-callsite-key-format (#675-mønster)
- Agent-transactions retry-duplisering (migrasjon `20261120000000_agent_transactions_idempotency.sql`)
- Ticket-arm race: to samtidige `bet:arm` fra samme spiller → to wallet-reservasjoner

**Public API:**
- `interface IdempotencyKeyPort`
- `forArm(roomCode, playerId, armCycleId, totalWeighted): string` — `arm:${roomCode}:${playerId}:${armCycleId}:${totalWeighted}`
- `forPayout(gameId, phaseId, playerId): string` — `payout:${gameId}:${phaseId}:${playerId}`
- `forCashOp(agentUserId, playerUserId, clientRequestId): string` — `cashop:${agent}:${player}:${clientRequestId}`
- `forCompliance(eventType, gameId, claimId, playerId): string` — `${eventType}:${game}:${actor}`

**Implementasjoner:** `DefaultIdempotencyKeyPort` (eneste — pure-function, ingen state).

**Format-konvensjoner:**
- Komponenter separeres med `:`
- `null`/`undefined` → `"no-<field>"` (UNIQUE-constraint avviser NULL)
- Ingen randomness — alle inputs deterministiske

**Avhengigheter:** Ingen.

**State-management:** Stateless.

**Bug-testing-guide:**
- forCompliance må matche `makeComplianceLedgerIdempotencyKey` i `ComplianceLedger.ts`
- forArm-rekkefølge: armCycleId før totalWeighted (en cycle har flere `totalWeighted`-versjoner)

---

## Jobs/ (cron-jobs)

### 60. `JobScheduler.ts`
- **Path:** `apps/backend/src/jobs/JobScheduler.ts`
- **LOC:** 175

**Ansvar:** BIN-582 — Generic interval-scheduler. Wrapper rundt `setInterval` med Redis-lock for multi-instance, feature-flag og structured logs.

**Public API:**
- `interface JobDefinition { name, description, intervalMs, isEnabled, run(): Promise<JobResult> }`
- `interface JobResult { itemsProcessed, note? }`
- `createJobScheduler(jobs, deps): { start, stop }`

**Multi-instance:** `RedisSchedulerLock` med per-job key `bingo:lock:job:<name>` (60s TTL). Single-node uten Redis kjører hver tick (akseptert — jobs idempotente).

**Avhengigheter:** `RedisSchedulerLock` (optional), pino logger.

**State-management:** Per-job timer-id + lastRunKey.

**Bug-testing-guide:**
- Multi-instance: kun én tick per kalender-tid med Redis-lock
- Master kill-switch `JOBS_ENABLED` (default true)
- tick:start / tick:done / tick:error logger

---

### 61. `bankIdExpiryReminder.ts`
- **Path:** `apps/backend/src/jobs/bankIdExpiryReminder.ts`
- **LOC:** 131
- **Schedule:** Polling 15 min, kjører én gang per dag etter 07:00 lokal tid
- **Feature-flag:** `JOB_BANKID_ENABLED`

**Ansvar:** Daglig BankID/ID-card-expiry sweep. Finner brukere med utløpende KYC-verifisering (12 mnd fra `kyc_verified_at`), logger varsel + flipper utløpte til `kyc_status='EXPIRED'`.

**Bug-testing-guide:** SMTP-stubbed — log-only inntil signed off. 12-mnd-proxy via `kyc_verified_at` (legacy — venter på OIDC BankID-handshake med ekte expiry-kolonne).

---

### 62. `game1AutoDrawTick.ts`
- **Path:** `apps/backend/src/jobs/game1AutoDrawTick.ts`
- **LOC:** 50
- **Schedule:** Hvert sekund (default 1000ms)
- **Feature-flag:** `GAME1_AUTO_DRAW_ENABLED` (default false)

**Ansvar:** GAME1_SCHEDULE PR 4c — auto-draw tick for Spill 1 running games hvor `last_drawn_at + seconds_to_display ≤ now`. Robust mot tabell-mangler (42P01).

---

### 63. `game1ScheduleTick.ts`
- **Path:** `apps/backend/src/jobs/game1ScheduleTick.ts`
- **LOC:** 130
- **Schedule:** Hvert 15. sekund (legacy-paritet)
- **Feature-flag:** `GAME1_SCHEDULE_TICK_ENABLED` (default false)

**Ansvar:** Spill 1 schedule-orkestrering — 5 stages per tick:
1. `spawnUpcomingGame1Games` — spawner rader 24t frem
2. `openPurchaseForImminentGames` — flip `scheduled → purchase_open`
3. `transitionReadyToStartGames` — flip `purchase_open → ready_to_start` (PR 2)
4. `cancelEndOfDayUnstartedGames` — marker utløpte rader cancelled
5. `detectMasterTimeout` — logger `timeout_detected` audit etter 15 min uten START
6. `sweepStaleReadyRows` — REQ-007: revert ready ved bingovert > 60s stale

---

### 64. `game1TransferExpiryTick.ts`
- **Path:** `apps/backend/src/jobs/game1TransferExpiryTick.ts`
- **LOC:** 54
- **Schedule:** Hvert 5. sekund
- **Feature-flag:** `GAME1_TRANSFER_EXPIRY_TICK_ENABLED` (default true)

**Ansvar:** Task 1.6 — UPDATE status='expired' for transfer-handshake-requests med `valid_till < NOW()` + broadcast `game1:transfer-expired`. 60s TTL.

---

### 65. `gameStartNotifications.ts`
- **Path:** `apps/backend/src/jobs/gameStartNotifications.ts`
- **LOC:** 208
- **Schedule:** Hvert 1. min
- **Feature-flag:** `JOB_GAME_START_NOTIFICATIONS_ENABLED`

**Ansvar:** BIN-FCM — Send game-start push-notifications. Trigger: `now >= scheduled_start_time - notification_start_seconds`. Dedup via `app_notifications` med `data->>'scheduledGameId'`. Mottakere: alle spillere i `participating_halls`.

---

### 66. `idempotencyKeyCleanup.ts`
- **Path:** `apps/backend/src/jobs/idempotencyKeyCleanup.ts`
- **LOC:** 173
- **Schedule:** Daglig 04:00 lokal tid (off-peak)
- **Feature-flag:** `JOB_IDEMPOTENCY_CLEANUP_ENABLED` (default ON)

**Ansvar:** BIN-767 — Casino-grade industri-standard 90-dagers retention på `wallet_transactions.idempotency_key`. NULL-er kun kolonnen (audit-trail bevart). Batch 1000 rader per iterasjon med `ctid`-trick. Idempotent re-run.

---

### 67. `jackpotDailyTick.ts`
- **Path:** `apps/backend/src/jobs/jackpotDailyTick.ts`
- **LOC:** 95
- **Schedule:** Daglig 00:15 norsk tid (LOW-2 fix 2026-04-26)
- **Feature-flag:** `JOB_JACKPOT_DAILY_ENABLED` (default false inntil staging-test)

**Ansvar:** MASTER_PLAN §2.3 — Spill 1 daglig jackpot-akkumulering (+4000 kr/dag, max 30 000). Service-laget bruker `WHERE last_accumulation_date < today`-guard + `lastRunDateKey` i tick-et.

---

### 68. `loyaltyMonthlyReset.ts`
- **Path:** `apps/backend/src/jobs/loyaltyMonthlyReset.ts`
- **LOC:** 67
- **Schedule:** Daglig (sjekker month-key)
- **Feature-flag:** Internt via service

**Ansvar:** BIN-700 — Månedlig reset av `app_loyalty_player_state.month_points`. Idempotent via month_key-sammenligning (`month_key < nowMonthKey OR month_key IS NULL`). Bruker `YYYY-MM` i stedet for `YYYY-MM-DD`.

---

### 69. `machineTicketAutoClose.ts`
- **Path:** `apps/backend/src/jobs/machineTicketAutoClose.ts`
- **LOC:** 296
- **Schedule:** Polling 15 min, kjører én gang etter 00:00 lokal tid (legacy 00:00)
- **Feature-flag:** `JOB_MACHINE_AUTO_CLOSE_ENABLED`

**Ansvar:** Port av legacy `Boot/Server.js:583-618` `autoCloseTicket('Metronia') / ('OK Bingo')`. Scanner `app_machine_tickets` for `is_closed=false AND created_at <= now() - maxAgeHours` (default 24h). Per ticket: kall service `autoCloseTicket()`. Wallet credit + DB mark + audit. System-bruker `system:auto-close-cron`.

---

### 70. `profilePendingLossLimitFlush.ts`
- **Path:** `apps/backend/src/jobs/profilePendingLossLimitFlush.ts`
- **LOC:** 39
- **Schedule:** Hvert 15. min
- **Feature-flag:** `JOB_PROFILE_PENDING_LIMIT_FLUSH_ENABLED`

**Ansvar:** BIN-720 — Flush 48h-queued loss-limit-endringer til active når `effectiveFromMs <= now()`. Pairer med `ProfileSettingsService.flushPendingLossLimits()`.

---

### 71. `selfExclusionCleanup.ts`
- **Path:** `apps/backend/src/jobs/selfExclusionCleanup.ts`
- **LOC:** 115
- **Schedule:** Polling 15 min, daglig etter 00:00 lokal tid
- **Feature-flag:** `JOB_RG_CLEANUP_ENABLED`

**Ansvar:** Daglig cleanup av utløpte voluntary pauses (`timed_pause_until`) og 1-årig self-exclusion-minimum (`self_exclusion_minimum_until`). `self_excluded_at` bevares for audit. Selvute-styling kreves manuell heving (Spillvett policy).

---

### 72. `swedbankPaymentSync.ts`
- **Path:** `apps/backend/src/jobs/swedbankPaymentSync.ts`
- **LOC:** 105
- **Schedule:** Hvert 60. min
- **Feature-flag:** `JOB_SWEDBANK_ENABLED`

**Ansvar:** Spør `swedbank_payment_intents` for `status NOT IN ('PAID','CREDITED','FAILED','EXPIRED','CANCELLED')` og < 24h gamle. Kaller `SwedbankPayService.reconcileIntentForUser` per intent. Robust mot tabell-mangler (logger warn + 0 items).

---

### 73. `uniqueIdExpiry.ts`
- **Path:** `apps/backend/src/jobs/uniqueIdExpiry.ts`
- **LOC:** 89
- **Schedule:** Daglig
- **Feature-flag:** `JOB_UNIQUE_ID_EXPIRY_ENABLED`

**Ansvar:** Pilot-blokker K1A — Mark Customer Unique ID-cards som EXPIRED når `expiry_date < now()`. Uten denne ble `status='ACTIVE'` for alltid (read-time guard i `UniqueIdService.mustGetActive()` inspecter kun status, ikke timestamp). Bounded UPDATE; tabell er liten.

---

### 74. `walletAuditVerify.ts`
- **Path:** `apps/backend/src/jobs/walletAuditVerify.ts`
- **LOC:** 86
- **Schedule:** Daglig 02:00 lokal tid
- **Feature-flag:** `JOB_WALLET_AUDIT_VERIFY_ENABLED`

**Ansvar:** BIN-764 — Wallet hash-chain nightly verifier. Kjører `WalletAuditVerifier.verifyAll()`. Lotteritilsynet-pattern: nightly integrity-sweep → bevis at audit-trail ikke er manipulert post-hoc. Date-keyed.

---

### 75. `walletReconciliation.ts`
- **Path:** `apps/backend/src/jobs/walletReconciliation.ts`
- **LOC:** 404
- **Schedule:** Daglig 03:00 lokal tid (post-midnatt-burst, før morgen-trafikk)
- **Feature-flag:** `JOB_WALLET_RECONCILIATION_ENABLED`

**Ansvar:** BIN-763 — Pragmatic Play / Evolution-mønster. Sammenligner `wallet_accounts.{deposit_balance, winnings_balance}` mot `SUM(wallet_entries.amount)` (CREDIT minus DEBIT). Avvik > 0.01 NOK alarmerer:
- Skriver `wallet_reconciliation_alerts`-rad
- Prom-metric `wallet_reconciliation_divergence_total`
- ERROR-log med structured payload

**Skriver ALDRI tilbake** til wallet_accounts. ADMIN må undersøke + lukke alerts. Batched (1000 konti/iter, 50ms pause). Open-alert UNIQUE per (account_id, side) — `ON CONFLICT DO NOTHING`.

---

### 76. `xmlExportDailyTick.ts`
- **Path:** `apps/backend/src/jobs/xmlExportDailyTick.ts`
- **LOC:** 120
- **Schedule:** Daglig 23:00 lokal tid (legacy-mønster)
- **Feature-flag:** `JOB_XML_EXPORT_ENABLED`

**Ansvar:** Withdraw XML-eksport daglig cron. For hver aktiv agent med ACCEPTED bank-uttak siden forrige batch: generer XML + send som vedlegg til regnskaps-allowlisten. Guard via `lastRunDateKey`. Robust mot tabell-mangler.

---

## Middleware/

### 77. `socketRateLimit.ts`
- **Path:** `apps/backend/src/middleware/socketRateLimit.ts`
- **LOC:** 270

**Ansvar:** BIN-164 — Per-socket, per-event sliding-window rate limiter for Socket.IO. Pruner disconnected sockets.

**Public API:**
- `class SocketRateLimiter`
- `limiter.check(socketId, event): boolean`
- `limiter.cleanup(socketId): void`
- `interface RateLimitConfig { windowMs, maxEvents }`
- `DEFAULT_RATE_LIMITS`: room:create 3/60s, room:join 5/30s, draw:next 5/2s, ticket:mark 10/1s, ticket:replace 5/5s (BIN-509 stricter), claim:submit 5/5s, ...

**Avhengigheter:** Ingen.

**State-management:** Per-socketId per-event sliding window (in-memory). Cleanup på disconnect.

**Bug-testing-guide:**
- `socketRateLimit.test.ts`
- BIN-247: per-walletId-grouping for å hindre socket-cycling-bypass
- Memory leak: cleanup på disconnect

---

### 78. `socketAuth` (via gameEvents/context)
- **Path:** Implementert i `apps/backend/src/sockets/gameEvents/context.ts`
- **LOC:** Inline i context.ts (~50 linjer)

**Ansvar:** Socket-auth helper. `getAuthenticatedSocketUser(payload)` validerer accessToken og returnerer `PublicAppUser`. `assertUserCanActAsPlayer(user, roomCode, playerId)` håndhever room/player-binding.

**Public API:**
- `getAuthenticatedSocketUser(payload?: AuthenticatedSocketPayload): Promise<PublicAppUser>`
- `assertUserCanActAsPlayer(user, roomCode, playerId): void`
- `requireAuthenticatedPlayerAction(payload)` (kombinasjon)

**Avhengigheter:** `PlatformService.getAccessToken*`.

**State-management:** Stateless lookup per kall.

**Bug-testing-guide:**
- accessToken må normaliseres + validere pp-token-shape
- Kross-bruker-binding: en socket kan ikke act-as annen player

---

### 79. `httpRateLimit.ts`
- **Path:** `apps/backend/src/middleware/httpRateLimit.ts`
- **LOC:** 176

**Ansvar:** BIN-277 — Per-route sliding-window rate limiter for Express. IP-basert (eller user-id når auth tilgjengelig). GC av stale entries.

**Public API:**
- `createHttpRateLimit(config: HttpRateLimitConfig)`: returnerer middleware
- `interface HttpRateLimitConfig { windowMs, maxRequests }`

**Avhengigheter:** `express` types.

**State-management:** Per-key sliding window i Map med periodic GC.

**Bug-testing-guide:** `httpRateLimit.test.ts` — IP-basert + user-id-override.

---

### 80. `socketTraceId.ts`
- **Path:** `apps/backend/src/middleware/socketTraceId.ts`
- **LOC:** 110

**Ansvar:** MED-1 — Socket.IO trace-id propagation. Stamper `socket.data.traceId` ved connection-time + wrapper `socket.on` så hver event runner i `runWithTraceContext`.

**Public API:**
- `socketTraceMiddleware(socket, next)` (`io.use`-middleware)
- `wrapSocketEventHandlers(socket): void`

**Avhengigheter:** `runWithTraceContext`.

**State-management:** Connection-level traceId per socket.data.

**Bug-testing-guide:** `socketTraceId.test.ts` — propagation across event-dispatch microtasks.

---

### 81. `traceId.ts`
- **Path:** `apps/backend/src/middleware/traceId.ts`
- **LOC:** 83

**Ansvar:** MED-1 — Express middleware som etablerer per-request trace-id-context.

**Public API:**
- `traceIdMiddleware(): RequestHandler`

**Behavior:**
- Reads `X-Trace-Id` (trusted upstream proxy/LB)
- Ellers minter UUID v4
- Setter `X-Trace-Id` på response
- Wrapper `next()` i `runWithTraceContext`

**Avhengigheter:** `express`, `runWithTraceContext`, `randomUUID`.

**State-management:** Per-request via AsyncLocalStorage.

**Bug-testing-guide:** `traceId.test.ts` — header-pass-through, fresh-id-mint, response-header.

---

### 82. `errorReporter.ts`
- **Path:** `apps/backend/src/middleware/errorReporter.ts`
- **LOC:** 64

**Ansvar:** BIN-539 — Express error-reporter. Catcher unhandled errors, logger + forwarder til Sentry. Konsistent `apiFailure`-envelope. Installerer også `unhandledRejection` + `uncaughtException` for å fange async-bugs utenfor Express (scheduler ticks, socket handlers, shutdown hooks).

**Public API:**
- `errorReporter(): ErrorRequestHandler`
- `installProcessLevelHandlers(): void`

**Avhengigheter:** `express`, `captureError` fra `observability/sentry.js`.

**State-management:** Stateless.

**Bug-testing-guide:** Sammenlign error-envelope shape med `apiFailure` for konsistens.

---

## Routes/ (104 filer — gruppert)

Per Tobias-direktiv: KUN OVERSIKT — grupper etter tema. Per-fil-katalog ville duplisert OpenAPI-spec (`apps/backend/openapi.yaml`).

### 83. Routes — Auth-gruppen
**16 filer.** Auth, profile, KYC, players.

| Fil | Kort beskrivelse |
|---|---|
| `auth.ts` | `/api/auth/*` — login (email/phone-PIN), register, logout, refresh, me, change-password, forgot/reset-password, BankID, 2FA setup/verify/disable/login |
| `players.ts` | `/api/players/*` — me/profile (GDPR-views), profile-image, public-list |
| `userProfile.ts` | `/api/profile/*` — display-name, language, notification preferences |
| `playerProfileImage.ts` | `/api/profile/image` — avatar upload (Cloudinary) |
| `paymentRequests.ts` | `/api/payments/deposit-request`, `/api/payments/withdraw-request` (BIN-586) |
| `payments.ts` | `/api/payments/swedbank/*` — topup-intent, confirm, intents/{id}, callback (HMAC-verified BIN-603) |
| `wallet.ts` | `/api/wallet/me` — account, transactions, compliance, top-up, timed-pause, self-exclusion, loss-limits, transfer |
| `voucher.ts` | `/api/voucher/*` — redeem, validate |
| `notifications.ts` | `/api/notifications` — list, mark-read |
| `publicCms.ts` | `/api/public/*` — FAQ, T&C (gating future GAP #22/33) |
| `tvScreen.ts` | `/tv/:hallId/:hallToken` — public TV-display route |
| `tvVoiceAssets.ts` | `/api/tv/voice-assets` — voice-pack lookup |
| `validateGameView.ts` | `/api/games/validate` — game-config validation |
| `game.ts` | `/api/games`, `/api/halls`, `/api/halls/{id}/schedule`, `/api/rooms`, `/api/rooms/{code}`, leaderboard, launch-flyt for ekstern-spill (Candy) |
| `game1Purchase.ts` | `/api/games/game1/purchase` — pre-round bong-kjøp REST |

**Avhengigheter:** PlatformService, AuditLogService, WalletAdapter, ComplianceLedger, KYC-providers (Idkollen).

---

### 84. Routes — Admin-gruppen
**70 filer (`admin*.ts`).**

| Tema | Filer | Kort beskrivelse |
|---|---|---|
| **Auth + Users + Security** | `adminAuth.ts`, `adminUsers.ts`, `adminAgentPermissions.ts`, `adminSecurity.ts` | Admin login, RBAC, role-management |
| **Halls + Terminals + Group of Halls** | `adminHallsTerminals.ts`, `adminHallGroups.ts`, `adminGroupHallReports.ts` | CRUD haller, terminaler, hall-grupper |
| **Players + KYC + Compliance** | `adminPlayers.ts`, `adminPlayersTop.ts`, `adminPlayerActivity.ts`, `adminCompliance.ts`, `adminAml.ts`, `adminTrackSpending.ts` | KYC moderation, top-spillere, AML, spending-tracking |
| **Game Management** | `adminGameManagement.ts`, `adminGamesSettings.ts`, `adminGameOversight.ts`, `adminGameTypes.ts`, `adminSubGames.ts`, `adminPatterns.ts`, `adminMiniGames.ts`, `adminSavedGames.ts`, `adminGameReplay.ts` | Spill-config, sub-games, patterns, mini-game-config, saved game lists, audit replay |
| **Spill 1 specific** | `adminGame1Master.ts`, `adminGame1MasterTransfer.ts`, `adminGame1Pots.ts`, `adminGame1Ready.ts`, `adminReportsGame1Management.ts` | Master-controls, transfer-handshake, jackpot-pots, ready-state, Spill 1-rapporter |
| **Schedules + Daily** | `adminSchedules.ts`, `adminDailySchedules.ts`, `adminCloseDay.ts` | Spilleplan, daglige skjemaer, close-day |
| **Rooms** | `adminRooms.ts`, `adminRoomsCheckBingo.ts`, `adminMaintenance.ts` | Room CRUD, manuell bingo-check, ops-tools |
| **Physical tickets** | `adminPhysicalTickets.ts`, `adminStaticTickets.ts`, `adminAgentTicketRanges.ts`, `adminPhysicalTicketCheckBingo.ts`, `adminPhysicalTicketPayouts.ts`, `adminPhysicalTicketsRewardAll.ts`, `adminPhysicalTicketsGamesInHall.ts` | Fysiske tickets — CSV-import, range-assignment, batch-sale, payout, reward-all |
| **Reports** | `adminReports.ts`, `adminReportsHallSpecific.ts`, `adminReportsGameSpecific.ts`, `adminReportsPhysicalTickets.ts`, `adminReportsRedFlagPlayers.ts`, `adminReportsRedFlagCategories.ts`, `adminReportsSubgameDrillDown.ts`, `adminHallReports.ts` | Hall-account, game-specific, physical tickets, red-flag-spillere, drill-down |
| **Wallet + Transactions + Withdraw** | `adminWallet.ts`, `adminTransactions.ts`, `adminWalletReconciliation.ts`, `adminWithdrawXml.ts` | Admin-wallet override, tx-historikk, reconciliation-alerts, withdraw XML-export |
| **Ledger + Overskudd + Settlement** | `adminOverskudd.ts` | §11 overskudd til organisasjoner — preview, distributions, organizations CRUD |
| **Loyalty + Vouchers + Payouts** | `adminLoyalty.ts`, `adminLeaderboardTiers.ts`, `adminVouchers.ts`, `adminUniqueIdsAndPayouts.ts` | Loyalty-points, leaderboard-tiers, voucher-CRUD, Customer Unique ID admin |
| **CMS + Notifications + Screen Saver** | `adminCms.ts`, `adminScreenSaver.ts`, `adminNotifications.ts`, `adminSmsBroadcast.ts`, `adminChatModeration.ts` | CMS, TV-screensaver, push, SMS-broadcast, chat-moderation |
| **Settings + Audit + Ops** | `adminSettings.ts`, `adminSystemInfo.ts`, `adminAuditLog.ts`, `adminOps.ts`, `admin.ts`, `adminShared.ts`, `adminAgents.ts`, `adminProducts.ts` | Settings catalog, system-info, audit-log, ops-console, products (kiosk) |

**Felles dependencies:** AdminAccessPolicy (RBAC enforcement), AuditLogService, PlatformService, ComplianceLedger.

---

### 85. Routes — Agent-gruppen
**18 filer (`agent*.ts`).** BIN-583 B3.1-B3.5.

| Fil | Kort beskrivelse |
|---|---|
| `agent.ts` | Hoved-agent-router (combiner) |
| `agentContext.ts` | Felles middleware (shift-validation, hall-binding) |
| `agentDashboard.ts` | Dashboard KPIs, latest requests, top players |
| `agentTransactions.ts` | Cash-in/out (CASH/CARD), audit-tx-log, today's-tx |
| `agentSettlement.ts` | Daily-balance control, settlement (Metronia/OK Bingo/Franco/Otium + NT/Rikstoto + Rekvisita/Bilag/Bank), close-day, PDF-eksport |
| `agentTicketRegistration.ts` | Pre-game scan: registrer Initial+Final ID per ticket-type, F2-hotkey |
| `agentBingo.ts` | PAUSE Game + Check for Bingo + Reward All (manuell pattern-check) |
| `agentGame1.ts` | Game 1 master-controls (start, pause, resume, force-end) |
| `agentGame1MiniGame.ts` | Mini-game admin/agent-trigger (Wheel/Chest/Mystery) |
| `agentMiniGameWinning.ts` | Manuell entry av Spin Wheel + Treasure Chest winnings (sub-game-detalj) |
| `agentUniqueIds.ts` | Customer Unique ID — create, add-money, withdraw, list, transaction-history |
| `agentPhysicalTicketsInline.ts` | Add Physical Ticket inline fra sub-game-detalj |
| `agentReportsPastWinning.ts` | Past Game Winning History (read-only) |
| `agentHistoryLists.ts` | Sold tickets, order history, payout history |
| `agentMetronia.ts` | Metronia ticket — register/topup/payout/void + daily-sales |
| `agentOkBingo.ts` | OK Bingo ticket — register/topup/payout/void + open-day signal (ComandID=11) |
| `agentOpenDay.ts` | Maskin-spesifikk dagsstart |
| `agentProducts.ts` | Kiosk: Coffee/Chocolate/Rice — sell, order-history, view-order |

**Felles dependencies:** AgentService, AgentShiftService, AgentTransactionService, MetroniaService, OkBingoService, ProductService, PhysicalTicketService.

---

### 86. Routes — Game-gruppen
**5 filer.**

| Fil | Kort beskrivelse |
|---|---|
| `game.ts` | `/api/games`, `/api/games/{slug}/launch` (Candy ekstern), `/api/halls`, `/api/halls/{id}/schedule`, `/api/rooms`, `/api/rooms/{code}`, `/api/rooms/{code}/game/end`, `/api/rooms/{code}/game/extra-draw`, `/api/leaderboard` |
| `game1Purchase.ts` | `/api/games/game1/purchase/*` — pre-round REST bong-kjøp (GATE_PRE_DEBIT compliance check, BIN-687) |
| `tvScreen.ts` | `/tv/:hallId/:hallToken` — public TV-display |
| `tvVoiceAssets.ts` | `/api/tv/voice-assets` — voice pack metadata |
| `validateGameView.ts` | `/api/games/validate` — game config validation pre-create |
| `voucher.ts` | `/api/voucher/redeem`, `/api/voucher/validate` |

**Avhengigheter:** BingoEngine, PlatformService, ComplianceLedger, WalletAdapter.

---

### 87. Routes — Wallet-gruppen
**3 filer.**

| Fil | Kort beskrivelse |
|---|---|
| `wallet.ts` | `/api/wallet/me/*` — account+last 20 tx, transactions, compliance, top-up (manual/swedbank-simulert), timed-pause, self-exclusion, loss-limits. `/api/wallets`, `/api/wallets/{id}` admin-wallets, `/api/wallets/{id}/topup`, `/api/wallets/{id}/withdraw`, `/api/wallets/transfer` |
| `payments.ts` | `/api/payments/swedbank/topup-intent`, `/api/payments/swedbank/confirm`, `/api/payments/swedbank/intents/{id}` (refresh-flag), `/api/payments/swedbank/callback` (HMAC-verified BIN-603, fail-closed på manglende secret) |
| `paymentRequests.ts` | `/api/payments/deposit-request`, `/api/payments/withdraw-request` (BIN-586). Player-side. Admin-side ligger i `adminPaymentRequests`-history-routes (admin/payments/history) |

**Avhengigheter:** WalletAdapter, SwedbankPayService, ComplianceLedger, PaymentRequestService.

---

### 88. Routes — System-gruppen
**4 filer.**

| Fil | Kort beskrivelse |
|---|---|
| `notifications.ts` | `/api/notifications` (list), `/api/notifications/read` (mark-read) — V1 stub |
| `publicCms.ts` | Public-cms-endpoints (FAQ, T&C — fortsatt under utvikling per GAP #22/33) |
| `tvVoiceAssets.ts` | TV voice-pack metadata fetch |
| `playerProfileImage.ts` | Avatar upload — Cloudinary-integrasjon |

**Avhengigheter:** NotificationService, CmsService, CloudinaryService.

---

## Vedlegg: avhengighetsgraf (forenklet)

```
gameEvents.ts (fasade)
    ↓
gameEvents/context.ts ← BingoEngine, PlatformService, logger
    ↓
gameEvents/{room,ticket,draw,claim,miniGame,chat,lifecycle,stopVote,voucher,gameLifecycle}Events.ts

walletStatePusher.ts ← WalletAdapter, Socket.IO Server
adminHallEvents.ts ← BingoEngine, AdminAccessPolicy, Socket.IO
adminGame1Namespace.ts ← BingoEngine, Game1MasterCoordinationService

services/PayoutService.ts (Fase 1)
    ↓
ports/{Wallet,Compliance,Audit,Hall,Clock,IdempotencyKey}Port.ts (Fase 0 narrow contracts)
    ↑
services/adapters/{Wallet,Compliance,Audit}AdapterPort.ts (Fase 1 — wraps legacy)
    ↓
adapters/WalletAdapter.ts, ComplianceLedgerPort.ts, AuditLogService.ts (eksisterende)

jobs/JobScheduler.ts ← RedisSchedulerLock (optional)
    ↓
jobs/{15 cron-jobs}.ts

middleware/{socketRateLimit,httpRateLimit,traceId,socketTraceId,errorReporter}.ts

util/{canonicalRoomCode,roomState,roomHelpers,staleRoomBootSweep,logger,traceContext,...}.ts
```

## Vedlegg: kjente bugs / pilot-relevante fix-mønstre

| Fix-mønster | Modul | Beskrivelse |
|---|---|---|
| Compliance multi-hall §71-binding | PayoutService + CompliancePort | actor_hall_id må være kjøpe-hallen, ikke master (PR #443/688 fix) |
| Stale-room cleanup | staleRoomBootSweep + roomEvents | Boot-sweep + canonical-aware lookup (PR #677, #682) |
| isTestHall propagering | HallPort | Sentral hall-lookup eliminerer 3-5 manuelle propageringer |
| Idempotency-key format | IdempotencyKeyPort | DefaultIdempotencyKeyPort sentraliserer 12+ format-decisions |
| Wallet-state stale | walletStatePusher | BIN-760 separat channel, ikke piggyback room:update |
| Oslo-tz-bug | osloTimezone + jackpotDailyTick | Daglige nullstillinger må bruke Europe/Oslo, ikke UTC |
| Wallet idempotency-key cleanup | idempotencyKeyCleanup | 90-dager retention på `wallet_transactions.idempotency_key` |
| Wallet reconciliation | walletReconciliation + walletAuditVerify | Nightly divergens-sjekk + hash-chain-verifier (BIN-763/764) |

---

**End of catalog.** 88 moduler dokumentert (eller gruppert for routes). Master-index øverst for navigasjon.
