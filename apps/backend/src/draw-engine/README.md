# Module: `apps/backend/src/draw-engine`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen

## Ansvar

Spill-uavhengig draw-engine:
- Crypto-secure RNG (`crypto.randomInt`)
- Draw-scheduling (timing mellom baller)
- Draw-locking (forhindrer dobbeltdraw på samme tick)
- Distributed lock provider (Redis SETNX eller in-memory)

## Hvorfor ikke i `game/`?

Draw-engine er en grunn-komponent. Game-spesifikk logikk (Spill 1 master vs perpetual loop) bygger på toppen.

## Public API

| Service | Funksjon |
|---|---|
| `DrawScheduler` | Timing av neste ball |
| `RngService` | crypto.randomInt-wrapper |
| `DrawLockProvider` | Distribuert lås |

## Invariants

1. **Crypto-secure RNG:** `crypto.randomInt`, ikke `Math.random`
2. **No external RNG:** vi sertifiserer ikke eksternt (ADR §4.4)
3. **Idempotent draws:** samme sessionId + drawNumber = samme ball (deterministisk)
4. **Lock-timeout:** 5 sek for å unngå dødlås

## Referanser

- `docs/compliance/KRITISK1_RNG_ALGORITMEBESKRIVELSE.md`
- `docs/architecture/modules/backend/DrawScheduler.md`
- `docs/architecture/modules/backend/DrawOrchestrationService.md`
