// PR-A6 (BIN-674) — settings dispatcher.
//
// Routes:
//   /settings                     → SettingsPage (globale app-versjoner +
//                                    spiller-tak read-only banner)
//   /maintenance                  → MaintenanceListPage
//   /maintenance/edit/:id         → MaintenanceFormPage (hash-regex)
//
// Backend-gap: BIN-A6-SETTINGS (ingen /api/admin/system/settings ennå).

import { renderSettingsPage } from "./SettingsPage.js";
import { renderMaintenanceListPage } from "./MaintenanceListPage.js";
import { renderMaintenanceFormPage } from "./MaintenanceFormPage.js";

const MAINTENANCE_EDIT_RE = /^\/maintenance\/edit\/[^/]+$/;

export function isSettingsRoute(path: string): boolean {
  if (path === "/settings" || path === "/maintenance") return true;
  return MAINTENANCE_EDIT_RE.test(path);
}

export function mountSettingsRoute(container: HTMLElement, path: string): void {
  container.innerHTML = "";
  if (path === "/settings") return renderSettingsPage(container);
  if (path === "/maintenance") return renderMaintenanceListPage(container);
  if (MAINTENANCE_EDIT_RE.test(path)) {
    const id = decodeURIComponent(path.slice("/maintenance/edit/".length));
    return renderMaintenanceFormPage(container, id);
  }
  container.innerHTML = `<div class="box box-danger"><div class="box-body">Unknown settings route: ${path}</div></div>`;
}
