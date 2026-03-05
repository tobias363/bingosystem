# TEST2 UI/Performance Report (Chat 2)

## Scope

1. Draw-loop ytelse.
2. Near-win blink og bonuspanel animasjon.
3. Visuell korrekthet (ingen blaa win-fill, korrekt blink, bonusheader stabil).

## Miljo

1. Branch:
2. Build (commit):
3. Dato:
4. Enhet/nettleser:

## Profilering setup

1. Scene:
2. Antall spillrunder:
3. Capture-varighet:
4. Verktøy (Unity Profiler, browser profiler):

## Resultater (for/etter)

| Metode | For | Etter | Endring |
|---|---:|---:|---:|
| p95 frame time desktop (ms) |  |  |  |
| p95 frame time mobil (ms) |  |  |  |
| GC spikes under draw-loop |  |  |  |
| CPU time draw update (ms) |  |  |  |

## Visuell regresjonssjekk

1. Ingen blaa fill ved win-line:
- Status:

2. Blink kun der ett tall mangler:
- Status:

3. Bonusheader/prize label forsvinner ikke:
- Status:

## Funn

1.
2.
3.

## Kodeendringer

1.
2.
3.

## Risiko / restarbeid

1.
2.

## Konklusjon

- [ ] PASS
- [ ] FAIL
