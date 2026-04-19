# Legacy report backup-filer (arkivert 2026-04-19)

Flyttet fra `legacy/unity-backend/App/Views/` som del av **PR-A4a (BIN-645)**.

## Filer

| Opprinnelig sti | Linjer | Notat |
|---|---|---|
| `hallAccountReport/hallAccount-old.html` | 369 | Eksplisitt "old"-variant av `hallAccount.html` — ikke referert av noen legacy-controller. |
| `PayoutforPlayers/payoutPlayers-backup.html` | 595 | Backup av `payoutPlayers.html` — ikke referert. |

## Hvorfor arkivert

Per PM-beslutning i PR-A4-scope (2026-04-19):

> **Arkivér 2 backup-HTML-filer** til `docs/archive/legacy-report-bkp/` som egen commit (sporbar, per PR-A3a-mønster).

Filene er ikke del av legacy paritets-mandat (de reflekterer ikke produksjons-UI), men vi beholder dem her for eventuell historisk referanse / diff-sporbarhet. Samme praksis som PR-A3a `docs/archive/legacy-savedgame-bkp/`.

## Aktive sider i port-scope (PR-A4a + PR-A4b)

### PR-A4a — report/ (15 sider)
1. `report/game1reports.html`
2. `report/subgame1reports.html`
3. `report/game1History.html`
4. `report/game2reports.html`
5. `report/game2History.html`
6. `report/game3reports.html`
7. `report/game3History.html`
8. `report/game4reports.html`
9. `report/game5reports.html`
10. `report/hallReport.html`
11. `report/physicalTicketReport.html`
12. `report/unique1reports.html`
13. `report/redFlagCategories.html`
14. `report/viewUserTransaction.html`
15. `report/totalRevenueReport.html`

### PR-A4b — hallAccountReport/ + PayoutforPlayers/ (7 sider)
- `hallAccountReport/list.html`
- `hallAccountReport/hallAccount.html`
- `hallAccountReport/settlement.html`
- `PayoutforPlayers/payoutPlayers.html`
- `PayoutforPlayers/payoutTickets.html`
- `PayoutforPlayers/viewPayoutPlayers.html`
- `PayoutforPlayers/viewPayoutTickets.html`

**Total:** 22 aktive sider portert + 2 arkivert = 24 sider totalt-sporet.
