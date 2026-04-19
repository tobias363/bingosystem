// PR-A4a (BIN-645) — /reportGame1/history/:gameId/:grpId/:hallname.
//
// Legacy: report/game1History.html (744 linjer).

import { t } from "../../../i18n/I18n.js";
import { renderGameHistoryPage } from "../shared/GameHistoryPage.js";

export async function renderGame1HistoryPage(
  container: HTMLElement,
  gameId: string,
  grpId: string,
  hallname: string
): Promise<void> {
  await renderGameHistoryPage(container, {
    title: `${t("game1")} — ${t("history")}`,
    gameType: "MAIN_GAME",
    scope: { gameId, grpId, hallname },
  });
}
