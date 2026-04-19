// PR-A6 (BIN-674) — /wheelOfFortune.
// Port of legacy/unity-backend/App/Views/otherGames/wheelOfFortune.html.
// 24 prize-segmenter.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import {
  escapeHtml,
} from "../adminUsers/shared.js";
import {
  getWheelConfig,
  updateWheelConfig,
} from "../../api/admin-other-games.js";
import { collectPrizes, renderOtherGamesShell, renderPrizeGrid, submitRow } from "./shared.js";

const WHEEL_SEGMENTS = 24;

export function renderWheelOfFortunePage(container: HTMLElement): void {
  const host = renderOtherGamesShell(
    container,
    "wheel_of_fortune",
    "wheel_of_fortune",
    "wheel-form-host",
    "wheel"
  );
  void mount(host);
}

async function mount(host: HTMLElement): Promise<void> {
  const cfg = await getWheelConfig();

  host.innerHTML = `
    <form id="wheel-form" class="form-horizontal" data-testid="wheel-form">
      <div class="form-group">
        <label class="col-sm-12">${escapeHtml(t("wheel_of_fortune_prize"))}</label>
        <div class="col-sm-12" data-testid="wheel-prizes">
          ${renderPrizeGrid(cfg.prizeList, WHEEL_SEGMENTS, "price", "col-lg-1")}
        </div>
      </div>
      ${submitRow()}
    </form>`;

  const form = host.querySelector<HTMLFormElement>("#wheel-form")!;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void (async () => {
      try {
        const prizes = collectPrizes(form, "price", WHEEL_SEGMENTS);
        await updateWheelConfig(prizes);
        Toast.success(t("success"));
      } catch {
        Toast.error(t("something_went_wrong"));
      }
    })();
  });
}
