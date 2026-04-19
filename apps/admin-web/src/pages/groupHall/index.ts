// PR-A5 (BIN-663) — GroupHall dispatcher (placeholder bolk).
//
// All four GroupHall routes stub to the same placeholder with banner
// pointing at Linear BIN-665 (blocker: backend har ingen CRUD-endpoints
// for hall-grupper ennå — `groupHallIds` finnes som schedule-felt, men
// ingen POST /api/admin/hall-groups). Når BIN-665 lander, erstattes
// placeholder med live-sider + oppdaterer også BIN-617 dashboard-widget.

import { t } from "../../i18n/I18n.js";
import {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
} from "../adminUsers/shared.js";

const GROUP_HALL_STATIC = new Set<string>(["/groupHall", "/groupHall/add"]);
const GROUP_HALL_EDIT_RE = /^\/groupHall\/edit\/[^/]+$/;
const GROUP_HALL_VIEW_RE = /^\/groupHall\/view\/[^/]+$/;

export function isGroupHallRoute(path: string): boolean {
  if (GROUP_HALL_STATIC.has(path)) return true;
  return GROUP_HALL_EDIT_RE.test(path) || GROUP_HALL_VIEW_RE.test(path);
}

export function mountGroupHallRoute(container: HTMLElement, path: string): void {
  container.innerHTML = "";
  const titleKey = pageTitleKey(path);
  container.innerHTML = `
    ${contentHeader(titleKey, "group_of_halls_management")}
    <section class="content">
      <div class="callout callout-warning" data-testid="group-halls-placeholder-banner">
        <i class="fa fa-clock-o"></i>
        ${escapeHtml(t("group_halls_placeholder_banner"))}
      </div>
      ${boxOpen(titleKey, "default")}
        <p class="text-muted" data-testid="group-halls-placeholder-body">
          <i class="fa fa-info-circle"></i>
          ${escapeHtml(t("coming_post_pilot"))}
        </p>
        <p>
          <a class="btn btn-default" href="#/hall" data-action="go-to-halls">
            <i class="fa fa-arrow-right"></i> ${escapeHtml(t("go_to_hall_list"))}
          </a>
        </p>
      ${boxClose()}
    </section>`;
}

function pageTitleKey(path: string): string {
  if (path === "/groupHall/add") return "create_group_of_halls";
  if (GROUP_HALL_EDIT_RE.test(path)) return "edit_group_of_halls";
  if (GROUP_HALL_VIEW_RE.test(path)) return "group_of_halls_management";
  return "hall_groups_list";
}
