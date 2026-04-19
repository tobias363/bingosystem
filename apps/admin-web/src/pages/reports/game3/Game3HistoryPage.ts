// PR-A4a (BIN-645) — /reportGame3/history/:gameId/:grpId/:hallname.
//
// Legacy: report/game3History.html (394 linjer).

import { t } from "../../../i18n/I18n.js";
import { renderGameHistoryPage } from "../shared/GameHistoryPage.js";

export async function renderGame3HistoryPage(
  container: HTMLElement,
  gameId: string,
  grpId: string,
  hallname: string
): Promise<void> {
  await renderGameHistoryPage(container, {
    title: `${t("game3")} — ${t("history")}`,
    gameType: "DATABINGO",
    scope: { gameId, grpId, hallname },
  });
}
