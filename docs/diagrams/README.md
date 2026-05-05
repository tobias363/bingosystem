# Architecture Diagrams

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen

Mermaid-diagrammer for hovedflows i Spillorama. Disse oppdateres ved arkitektur-endring.

## Indeks

| # | Diagram | Beskrivelse |
|---|---|---|
| 1 | [System tiers](./01-system-tiers.md) | Tre-tier-arkitektur (klient, backend, infra) |
| 2 | [Login flow](./02-login-flow.md) | Spiller-autentisering ende-til-ende |
| 3 | [Draw flow (Spill 1)](./03-draw-flow-spill1.md) | Master-styrt trekning per hall |
| 4 | [Perpetual loop (Spill 2/3)](./04-perpetual-loop-spill2-3.md) | Globalt rom, system-driven loop |
| 5 | [Master-handover](./05-master-handover.md) | 60s handshake for master-overføring |

## Hvordan oppdatere

Mermaid-diagrammer er inline i markdown. Github og de fleste markdown-rendrere viser dem direkte.

For å redigere:
1. Åpne markdown-fil
2. Endre mermaid-blokken
3. Bekreft at diagrammet rendrerer korrekt (preview i VS Code eller GitHub)
4. Commit

Lokal preview: `npx @mermaid-js/mermaid-cli -i diagram.md -o diagram.png` (krever `npm install -g @mermaid-js/mermaid-cli`).
