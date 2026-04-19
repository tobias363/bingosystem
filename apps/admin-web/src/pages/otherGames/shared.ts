// PR-A6 (BIN-674) — otherGames-delte helpers.

import { t } from "../../i18n/I18n.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../adminUsers/shared.js";

/** Render page shell with placeholder-banner, box, and form-host. */
export function renderOtherGamesShell(
  container: HTMLElement,
  titleKey: string,
  moduleKey: string,
  formHostId: string,
  testIdPrefix: string
): HTMLElement {
  container.innerHTML = `
    ${contentHeader(titleKey, moduleKey)}
    <section class="content">
      <div class="callout callout-warning" data-testid="${escapeHtml(testIdPrefix)}-placeholder-banner">
        <i class="fa fa-clock-o"></i>
        ${escapeHtml(t("other_games_placeholder_banner"))}
      </div>
      ${boxOpen(titleKey, "primary")}
        <div id="${escapeHtml(formHostId)}">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;
  return container.querySelector<HTMLElement>(`#${formHostId}`)!;
}

/** Render numeric prize grid with `count` inputs (uniform layout). */
export function renderPrizeGrid(
  values: number[],
  count: number,
  namePrefix: string,
  colSize: "col-lg-1" | "col-lg-2"
): string {
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    const v = values[i] ?? 0;
    items.push(`
      <li class="${colSize} m-b-1" style="display:inline-block;padding:4px;">
        <input type="number"
               class="form-control"
               name="${escapeHtml(namePrefix)}-${i}"
               data-index="${i}"
               min="0"
               required
               value="${escapeHtml(String(v))}">
      </li>`);
  }
  return `<ul style="list-style:none;padding:0;margin:0;">${items.join("")}</ul>`;
}

/** Collect prize values from a form input-set with data-index. */
export function collectPrizes(form: HTMLFormElement, namePrefix: string, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const el = form.querySelector<HTMLInputElement>(`input[name="${namePrefix}-${i}"]`);
    out.push(el ? Number(el.value) || 0 : 0);
  }
  return out;
}

/** Submit-button row (shared across all 4 otherGames pages). */
export function submitRow(backHash: string = "#/admin"): string {
  return `
    <div class="form-group">
      <div class="col-sm-offset-2 col-sm-10">
        <button type="submit" class="btn btn-success" data-action="save-prizes">
          <i class="fa fa-save"></i> ${escapeHtml(t("submit"))}
        </button>
        <a class="btn btn-default" href="${escapeHtml(backHash)}">${escapeHtml(t("cancel"))}</a>
      </div>
    </div>`;
}
