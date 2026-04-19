// PR-A6 (BIN-674) — /colorDraft.
// Port of legacy/unity-backend/App/Views/otherGames/colordraft.html.
// 3 colors × 4 prize-tiers.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import { escapeHtml } from "../adminUsers/shared.js";
import {
  getColorDraftConfig,
  updateColorDraftConfig,
} from "../../api/admin-other-games.js";
import { collectPrizes, renderOtherGamesShell, renderPrizeGrid, submitRow } from "./shared.js";

const COLOR_TIER_COUNT = 4;

export function renderColorDraftPage(container: HTMLElement): void {
  const host = renderOtherGamesShell(
    container,
    "color_draft",
    "color_draft",
    "colordraft-form-host",
    "colordraft"
  );
  void mount(host);
}

async function mount(host: HTMLElement): Promise<void> {
  const cfg = await getColorDraftConfig();

  host.innerHTML = `
    <form id="colordraft-form" class="form-horizontal" data-testid="colordraft-form">
      <div class="form-group">
        <label class="col-sm-4 control-label">${escapeHtml(t("red_color_prize"))}</label>
        <div class="col-sm-8" data-testid="colordraft-red">
          ${renderPrizeGrid(cfg.redPrizes, COLOR_TIER_COUNT, "redColorPrize", "col-lg-2")}
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-4 control-label">${escapeHtml(t("yellow_color_prize"))}</label>
        <div class="col-sm-8" data-testid="colordraft-yellow">
          ${renderPrizeGrid(cfg.yellowPrizes, COLOR_TIER_COUNT, "yellowColorPrize", "col-lg-2")}
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-4 control-label">${escapeHtml(t("green_color_prize"))}</label>
        <div class="col-sm-8" data-testid="colordraft-green">
          ${renderPrizeGrid(cfg.greenPrizes, COLOR_TIER_COUNT, "greenColorPrize", "col-lg-2")}
        </div>
      </div>
      ${submitRow()}
    </form>`;

  const form = host.querySelector<HTMLFormElement>("#colordraft-form")!;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void (async () => {
      try {
        const redPrizes = collectPrizes(form, "redColorPrize", COLOR_TIER_COUNT);
        const yellowPrizes = collectPrizes(form, "yellowColorPrize", COLOR_TIER_COUNT);
        const greenPrizes = collectPrizes(form, "greenColorPrize", COLOR_TIER_COUNT);
        await updateColorDraftConfig({ redPrizes, yellowPrizes, greenPrizes });
        Toast.success(t("success"));
      } catch {
        Toast.error(t("something_went_wrong"));
      }
    })();
  });
}
