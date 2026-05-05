# Module: `packages/game-client/src`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen
**LOC:** ~36 670 (kun `games/`)

## Ansvar

Pixi.js-basert game-client for web (og senere iOS/Android shells). Eier:
- Rendering av Spill 1, 2, 3 (i `games/`)
- Socket.IO-klient (`net/`)
- Bridge-laget (`bridge/`) — JS-bro mot Unity-fallback (legacy)
- Audio-manager (`audio/`)
- Diagnostics + telemetry (`diagnostics/`, `telemetry/`)
- Visual-harness for testing (`visual-harness/`)

## Ikke-ansvar

- Spill-logikk (server er sannhets-kilde, klient er view)
- Authentication (browser session-token, sendes med hvert request)
- Wallet-mutering (server eier)

## Public API

Subdir-organisering:
- `games/game1/`, `games/game2/`, `games/game3/`, `games/game5/` — per-spill rendering
- `bridge/` — JS-bro for shell-Unity-integrasjon
- `core/` — felles bingo-engine (klient-side state)
- `net/` — Socket.IO + REST klient
- `components/` — felles UI-komponenter
- `audio/` — AudioManager
- `diagnostics/` — debug-suite (ADR-006)
- `telemetry/` — trace-id, event-buffer (ADR-010)
- `preview/` — design-preview-tool

## Avhengigheter

- Pixi.js 8.6 (rendering)
- Socket.IO-client 4.x
- `@spillorama/shared-types` (Zod-schemas + types)

## Invariants

1. **Server er sannhets-kilde:** klient simulerer aldri trekninger lokalt
2. **State-overgang via socket-events:** ingen lokal state-mutasjon basert på timer
3. **Reconnect-snapshot er authoritativ:** klient resetter state fullt ved reconnect
4. **Ingen `console.log` i committed kode:** bruk `clientLogger.event(...)`
5. **Trace-ID på alle events:** ADR-006 + ADR-010
6. **Backwards-compat:** klient må håndtere både gamle og nye event-shapes

## Bug-testing-guide

### "Spillet henger på loading"
- Sjekk Socket.IO-tilkobling i Network tab
- Sjekk om Bearer-token er gyldig (sjekk localStorage)
- Sjekk for failed Pixi-asset-loading

### "Ball-animasjon synker ikke"
- Sjekk `draw.new` event-rate (skal være 2 sek for perpetual)
- Sjekk timer-drift på klient (kan oppstå ved tab-bytte)
- Sjekk om snapshot ved reconnect kommer etter at draw allerede er trukket

### "Pre-purchase tickets vises ikke ved game-start"
- Sjekk `preRoundTickets` vs `myTickets`-state
- Verifiser PR #923 logikk: `running ? myTickets : preRoundTickets`

### "Reconnect viser feil state"
- Sjekk om server sender snapshot etter reconnect (PR #913)
- Sjekk `clientLogger` ring-buffer for siste events før disconnect

## Referanser

- ADR-006 (klient-debug-suite)
- ADR-010 (observability)
- `docs/architecture/modules/frontend/`
- `docs/architecture/modules/frontend/Game1Controller.md`
- `docs/architecture/modules/frontend/PlayScreen.md`
