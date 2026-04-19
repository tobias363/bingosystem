// PR-A4a (BIN-645) — /reportGame2/history/:gameId/:grpId/:hallname.
//
// Legacy: report/game2History.html (390 linjer).

import { t } from "../../../i18n/I18n.js";
import { renderGameHistoryPage } from "../shared/GameHistoryPage.js";

export async function renderGame2HistoryPage(
  container: HTMLElement,
  gameId: string,
  grpId: string,
  hallname: string
): Promise<void> {
  await renderGameHistoryPage(container, {
    title: `${t("game2")} — ${t("history")}`,
    gameType: "DATABINGO",
    scope: { gameId, grpId, hallname },
  });
}
