# Diagram 4: Perpetual Loop — Spill 2 og 3 (System-driven)

**Sist oppdatert:** 2026-05-06

Spill 2 (`rocket`) og Spill 3 (`monsterbingo`) bruker ETT globalt rom per spill — ikke per hall.
Loop er drevet av cron-tick (system-actor), ikke av menneskelig handler.

Se [ADR-001](../decisions/ADR-001-perpetual-room-model-spill2-3.md) for begrunnelse.

```mermaid
stateDiagram-v2
    [*] --> LOBBY: Server startet

    LOBBY --> PLAYING: Cron-tick<br/>(perpetualLoopTick)<br/>RUN_DELAY=30s utløpt

    PLAYING --> PLAYING: drawNextBall()<br/>hvert 2s<br/>(AUTO_DRAW_INTERVAL_MS)

    PLAYING --> ENDED: Coverall vunnet<br/>eller alle baller trukket

    ENDED --> LOBBY: Cron-tick<br/>etter PERPETUAL_LOOP_DELAY_MS=30s

    note right of LOBBY
        Spillere kan kjøpe tickets
        Forhåndskjøp aktivt
        Jackpot-display oppdatert
    end note

    note right of PLAYING
        Auto-draw kjører
        Ingen kjøp lenger
        Pre-purchased tickets aktive
    end note

    note right of ENDED
        Vinnere bekreftet
        Payout utført
        30s pause før neste
    end note
```

## Cron-tick-flyt

```mermaid
sequenceDiagram
    autonumber
    participant Cron as perpetualLoopTick<br/>(every 1s)
    participant BE as Backend<br/>(Game2Engine / Game3Engine)
    participant DB as Postgres
    participant R as Redis
    participant P as Spillere
    participant TV as TV-skjerm

    Note over Cron,TV: Rom er i LOBBY<br/>nextRoundAt = now + 30s

    Cron->>BE: tick()
    BE->>R: GET roomState
    R-->>BE: { state: LOBBY, nextRoundAt: T }
    BE->>BE: now < nextRoundAt? Skip.

    Note over Cron,TV: 30 sek senere

    Cron->>BE: tick()
    BE->>R: GET roomState
    R-->>BE: { state: LOBBY, nextRoundAt: T }
    BE->>BE: now >= nextRoundAt? Start runde.

    BE->>DB: BEGIN TX
    BE->>DB: INSERT app_game_session<br/>(actorType=SYSTEM, subsystem=perpetual-loop)
    BE->>DB: UPDATE app_room SET state=PLAYING
    BE->>DB: COMMIT
    BE->>R: Set state=PLAYING

    BE-->>P: socket emit game.started
    BE-->>TV: socket emit room.state_changed

    Note over Cron,TV: Auto-draw cron tar over

    loop Hvert 2s, til Coverall eller alle baller
        Cron->>BE: autoDrawTick()
        BE->>R: GET drawnBalls
        BE->>BE: drawNextBall() (crypto.randomInt)
        BE->>DB: INSERT app_draw_event
        BE->>R: Push ball til drawnBalls
        BE-->>P: socket emit draw.new<br/>{ ball, drawNumber }
        BE-->>TV: socket emit draw.new

        BE->>BE: evaluateClaims()
        alt Coverall funnet
            BE->>DB: INSERT claim + payout
            BE-->>P: socket emit claim.confirmed
            BE-->>TV: socket emit claim.confirmed
            BE->>DB: UPDATE state=ENDED
            BE->>R: Set state=ENDED, nextRoundAt=now+30s
            BE-->>P: socket emit game.ended
        end
    end

    Note over Cron,TV: Loop fortsetter, neste runde om 30s
```

## Hvorfor system-actor?

Spill 2/3 har ingen "host" — ingen menneske trykker "start". Cron-tick produserer eventet, så audit-log
må reflektere det:

```typescript
auditLog.write({
  actorType: "SYSTEM",
  actorId: null,
  details: {
    subsystem: "perpetual-loop",
    sessionId: "..."
  },
  action: "game.started",
  resource: "game_session"
});
```

Se ADR-002 for full begrunnelse.

## Globalt rom — én RoomState

I motsetning til Spill 1 (én RoomState per hall), Spill 2 og 3 har **kun én** RoomState hver, identifisert
av room-code:

- `ROCKET` (Spill 2)
- `MONSTERBINGO` (Spill 3)

Alle spillere uansett hall ser samme trekning samtidig. Compliance-ledger binder fortsatt kjøp til
spillerens hall (ADR-007 §11).

## Ingen `assertHost`

Pre-pilot-bug #942 var Spill 2/3 som arvet `assertHost`-check fra Spill 1 — men perpetual-rom har
ingen host. Fix: skip assertHost for perpetual-spill.

## Konfigurasjon

| Konstant | Verdi | Funksjon |
|---|---|---|
| `PERPETUAL_LOOP_DELAY_MS` | 30000 (30s) | Pause mellom runder |
| `AUTO_DRAW_INTERVAL_MS` | 2000 (2s) | Mellom baller |
| `PRE_ROUND_PURCHASE_WINDOW_MS` | 30000 (30s) | Forhåndskjøps-vindu |

## Referanser

- `apps/backend/src/game/Game2RoomFactory.ts`
- `apps/backend/src/game/Game3Engine.ts`
- `apps/backend/src/jobs/perpetualLoopTickCron.ts`
- ADR-001 (perpetual vs master)
- ADR-002 (system-actor)
- PR [#942](https://github.com/tobias363/Spillorama-system/pull/942) (skip assertHost)
