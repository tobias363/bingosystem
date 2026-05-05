# Diagram 5: Master-handover

**Sist oppdatert:** 2026-05-06

Spill 1 (Spill 1, master-styrt per hall) støtter overføring av master-kontroll mellom haller med 60s
handshake. Brukes når master-hallen blir uoperasjonell (agent slutter skift, hall stenger, network-issue).

Implementert i `Game1TransferHallService.ts` (PR #453).

```mermaid
sequenceDiagram
    autonumber
    participant CMA as Current Master-agent
    participant TMA as Target Master-agent<br/>(annen hall)
    participant BE as Backend<br/>(Game1TransferHallService)
    participant DB as Postgres
    participant R as Redis
    participant P as Alle spillere

    Note over CMA,P: Spill pågår, CMA er master

    CMA->>BE: POST /api/game1/transfer-hall<br/>{ targetHallId }
    BE->>R: SET handshake { from, to, expiresAt: now+60s }
    BE->>DB: INSERT app_audit (transfer.requested)
    BE-->>CMA: 200 + handshakeId
    BE-->>TMA: socket emit transfer.requested<br/>{ handshakeId, expiresAt }

    Note over TMA: Target-agent ser popup

    alt Target accepter innen 60s
        TMA->>BE: POST /api/game1/transfer-hall/:handshakeId/accept
        BE->>R: GET handshake
        BE->>BE: Sjekk now < expiresAt
        BE->>DB: BEGIN TX
        BE->>DB: UPDATE app_room SET master_hall_id = targetHall
        BE->>DB: INSERT app_audit (transfer.completed)
        BE->>DB: COMMIT
        BE->>R: DELETE handshake
        BE->>R: Update masterHall in roomState
        BE-->>TMA: 200 + ny master-status
        BE-->>CMA: socket emit transfer.completed<br/>(du er ikke master lenger)
        BE-->>P: socket emit master.changed<br/>(nytt master-hall)

        Note over TMA: TMA er nå master
    else Target reject
        TMA->>BE: POST /api/game1/transfer-hall/:handshakeId/reject
        BE->>R: DELETE handshake
        BE->>DB: INSERT app_audit (transfer.rejected)
        BE-->>TMA: 200
        BE-->>CMA: socket emit transfer.rejected
    else Timeout (60s passert)
        Note over BE: handshakeExpiryTick (cron, hvert 5s)
        BE->>R: SCAN handshakes WHERE expiresAt < now
        BE->>R: DELETE expired handshakes
        BE->>DB: INSERT app_audit (transfer.expired)
        BE-->>CMA: socket emit transfer.expired
        BE-->>TMA: socket emit transfer.expired
        Note over CMA: CMA forblir master
    end
```

## Sikkerhet

- **Audit-trail:** alle handshake-events logges (requested/completed/rejected/expired)
- **TTL i Redis:** 60s expire forhindrer dangling handshakes
- **Permission-check:** kun ADMIN-role eller designert hall-master kan trigge transfer
- **Race-protection:** Postgres TX sikrer at to samtidige accept-er ikke begge får master

## Auto-eskalering

Hvis master-hall ikke responderer på `hall.ready_state` event innen X sekunder, og runde er stuck i
`ready_to_start`-state, kjører `game1ScheduleTick`-cron og eskalerer:

1. Forsøker å pinge master-hall via socket
2. Hvis ingen respons: marker master-hall som disconnected
3. Velger ny master automatisk (første hall i ready-listen alfabetisk)
4. Logger eskaleringen som SYSTEM-actor

Se BIN-XXX og `apps/backend/src/jobs/game1ScheduleTickCron.ts`.

## Hvorfor 60 sekunder?

- Kort nok til at spillet ikke henger lenge
- Lang nok til at agent kan se popup, vurdere, klikke accept/reject
- Industri-norm (Playtech bingo bruker 30-90s)

## Pilot-blokker (lukket)

PR #453 var pilot-blokker — uten transfer-handover kunne master-hall-disconnect føre til DB-admin-job
mid-runde. Nå håndterer systemet det automatisk.

## Referanser

- `apps/backend/src/game/Game1TransferHallService.ts`
- `apps/backend/src/jobs/handshakeExpiryTick.ts`
- PR [#453](https://github.com/tobias363/Spillorama-system/pull/453) — initial implementasjon
- `docs/architecture/MASTER_PLAN_SPILL1_PILOT_2026-04-24.md` §1.4 (hvorfor pilot-blokker)
