# Legacy savedGame backup-filer (arkivert 2026-04-19)

Flyttet fra `legacy/unity-backend/App/Views/savedGame/` som del av **PR-A3 (BIN-613)**.

## Filer

| Opprinnelig sti | Linjer | Notat |
|---|---|---|
| `savedGame/gameAdd_bkp.html` | 1185 | Backup av tidligere `gameAdd.html` — ikke referert av noen legacy-controller. |
| `savedGame/gameView_bkp.html` | 370 | Backup av tidligere `gameView.html` — ikke referert. |
| `savedGame/list copy.html` (arkivert som `list_copy.html`) | 422 | Åpen finder-duplikat av `list.html` — ikke referert. |

## Hvorfor arkivert

Per PM-beslutning i PR-A3-scope (2026-04-19):

> **Port 5 aktive savedGame-sider, arkivér 3 bkp-filer** til `docs/archive/legacy-savedgame-bkp/`

Filene er ikke del av legacy paritets-mandat (de reflekterer ikke produksjons-UI), men vi beholder dem her for eventuell historisk referanse / diff-sporbarhet.

## Aktive savedGame-sider (i port-scope)

Følgende 5 sider portes i PR-A3 fra fortsatt-aktive `legacy/unity-backend/App/Views/savedGame/`:

1. `list.html`
2. `gameAdd.html`
3. `gameView.html`
4. `editSaveGame3.html`
5. `game3View.html`
