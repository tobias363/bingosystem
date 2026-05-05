# Module: `packages/shared-types/src`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen

## Ansvar

Sannhets-kilde for alle TypeScript-typer og Zod-schemas på tvers av apps og packages.
Hvis det er en kontrakt mellom backend og klient, ligger den her.

## Ikke-ansvar

- Implementasjon (kun typer + validerings-schemas)
- Backend- eller klient-spesifikk kode

## Public API

| Fil | Innhold |
|---|---|
| `index.ts` | Hovedeksport — Player, Room, Game, AuditActorType, etc. |
| `game.ts` | Game-spesifikke typer |
| `api.ts` | HTTP request/response shapes |
| `socket-events.ts` | Socket.IO event-signaturer |
| `spill1-patterns.ts` | Spill 1 pattern-definisjoner (5x5 grids) |
| `spill1-sub-variants.ts` | Spill 1 sub-game-varianter |
| `ticket-colors.ts` | 11-farge ticket palette (legacy paritet) |
| `reports.ts` | Rapport-shapes |
| `schemas.ts`, `schemas/` | Zod-schemas for runtime-validering |

## Invariants

1. **Backwards-compat:** legge til felter er OK, fjerne er breaking
2. **Zod-schemas er kilde:** TypeScript-typer er deriverte (`z.infer<typeof X>`)
3. **Begge sider validerer:** backend valider input, klient valider output
4. **Versjonering ved breaking changes:** ny type med suffix (V2)

## Bug-testing-guide

### "TypeScript-feil etter pull"
- Kjør `npm run check`
- Sjekk om shared-types har breaking change
- Sjekk hvilken side (backend eller klient) som er etter

### "Runtime validation feiler"
- Sjekk Zod-error i logs
- Verifiser at både backend og klient bruker samme Zod-version

## Referanser

- `__tests__/` — schema-validation-tester
- ADR-005 (structured error codes — definert her)
