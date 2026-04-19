// PR-A6 (BIN-674) — /treasureChest.
// Port of legacy/unity-backend/App/Views/otherGames/treasureChest.html.
// 10 prizes.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import { escapeHtml } from "../adminUsers/shared.js";
import {
  getChestConfig,
  updateChestConfig,
} from "../../api/admin-other-games.js";
import { collectPrizes, renderOtherGamesShell, renderPrizeGrid, submitRow } from "./shared.js";

const CHEST_COUNT = 10;

export function renderTreasureChestPage(container: HTMLElement): void {
  const host = renderOtherGamesShell(
    container,
    "treasure_chest",
    "treasure_chest",
    "chest-form-host",
    "chest"
  );
  void mount(host);
}

async function mount(host: HTMLElement): Promise<void> {
  const cfg = await getChestConfig();

  host.innerHTML = `
    <form id="chest-form" class="form-horizontal" data-testid="chest-form">
      <div class="form-group">
        <label class="col-sm-12">${escapeHtml(t("treasure_chest_prize"))}</label>
        <div class="col-sm-12" data-testid="chest-prizes">
          ${renderPrizeGrid(cfg.prizeList, CHEST_COUNT, "price", "col-lg-2")}
        </div>
      </div>
      ${submitRow()}
    </form>`;

  const form = host.querySelector<HTMLFormElement>("#chest-form")!;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void (async () => {
      try {
        const prizes = collectPrizes(form, "price", CHEST_COUNT);
        await updateChestConfig(prizes);
        Toast.success(t("success"));
      } catch {
        Toast.error(t("something_went_wrong"));
      }
    })();
  });
}
