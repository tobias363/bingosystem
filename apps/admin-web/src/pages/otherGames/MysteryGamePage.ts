// PR-A6 (BIN-674) — /mystery.
// Port of legacy/unity-backend/App/Views/otherGames/mysteryGame.html.
// 6 prizes.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import { escapeHtml } from "../adminUsers/shared.js";
import {
  getMysteryConfig,
  updateMysteryConfig,
} from "../../api/admin-other-games.js";
import { collectPrizes, renderOtherGamesShell, renderPrizeGrid, submitRow } from "./shared.js";

const MYSTERY_COUNT = 6;

export function renderMysteryGamePage(container: HTMLElement): void {
  const host = renderOtherGamesShell(
    container,
    "mystery_game",
    "mystery_game",
    "mystery-form-host",
    "mystery"
  );
  void mount(host);
}

async function mount(host: HTMLElement): Promise<void> {
  const cfg = await getMysteryConfig();

  host.innerHTML = `
    <form id="mystery-form" class="form-horizontal" data-testid="mystery-form">
      <div class="form-group">
        <label class="col-sm-12">${escapeHtml(t("mystery_game_prize"))}</label>
        <div class="col-sm-12" data-testid="mystery-prizes">
          ${renderPrizeGrid(cfg.prizeList, MYSTERY_COUNT, "price", "col-lg-2")}
        </div>
      </div>
      ${submitRow()}
    </form>`;

  const form = host.querySelector<HTMLFormElement>("#mystery-form")!;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void (async () => {
      try {
        const prizes = collectPrizes(form, "price", MYSTERY_COUNT);
        await updateMysteryConfig(prizes);
        Toast.success(t("success"));
      } catch {
        Toast.error(t("something_went_wrong"));
      }
    })();
  });
}
