//
// Legacy layout: panel with DataTable of saved-game snapshots, Add button,
// per-row View / Edit / Delete actions.
//
// Wired to BIN-624 backend per admin-saved-games API.

import { t } from "../../../i18n/I18n.js";
import { DataTable } from "../../../components/DataTable.js";
import { Toast } from "../../../components/Toast.js";
import { Modal } from "../../../components/Modal.js";
import { escapeHtml } from "../common/escape.js";
import {
  fetchSavedGameList,
  deleteSavedGame,
  loadSavedGameToGame,
  type SavedGameRow,
} from "./SavedGameState.js";
import { applySavedGameToSchedule } from "../../../api/admin-saved-games.js";
import {
  listDailySchedules,
  type DailyScheduleRow,
} from "../../../api/admin-daily-schedules.js";
import { ApiError } from "../../../api/client.js";

export async function renderSavedGameListPage(container: HTMLElement): Promise<void> {
  container.innerHTML = renderShell();
  const tableHost = container.querySelector<HTMLElement>("#saved-game-list-table");
  if (!tableHost) return;
  tableHost.innerHTML = `<div class="text-center"><i class="fa fa-spinner fa-spin fa-2x" aria-hidden="true"></i></div>`;
  await loadAndRender(tableHost);
}

async function loadAndRender(tableHost: HTMLElement): Promise<void> {
  try {
    const rows = await fetchSavedGameList();
    renderTable(tableHost, rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tableHost.innerHTML = `<div class="alert alert-danger">${escapeHtml(msg)}</div>`;
  }
}

function renderShell(): string {
  return `
    <div class="page-wrapper"><div class="container-fluid">
      <section class="content-header">
        <h1>${escapeHtml(t("saved_game_list"))}</h1>
        <ol class="breadcrumb">
          <li><a href="#/admin"><i class="fa fa-dashboard" aria-hidden="true"></i> ${escapeHtml(t("dashboard"))}</a></li>
          <li class="active">${escapeHtml(t("saved_game_list"))}</li>
        </ol>
      </section>
      <section class="content">
        <div class="row"><div class="col-sm-12">
          <div class="panel panel-default card-view">
            <div class="panel-heading">
              <div class="pull-left"><h6 class="panel-title txt-dark">${escapeHtml(t("saved_game_list"))}</h6></div>
              <div class="pull-right">
                <a href="#/gameManagement" class="btn btn-primary btn-md"
                  data-action="back-to-gm">
                  <i class="fa fa-plus" aria-hidden="true"></i> ${escapeHtml(t("add_game"))}
                </a>
              </div>
              <div class="clearfix"></div>
            </div>
            <div class="panel-wrapper collapse in">
              <div class="panel-body">
                <div class="table-wrap"><div class="table-responsive">
                  <div id="saved-game-list-table"></div>
                </div></div>
              </div>
            </div>
          </div>
        </div></div>
      </section>
    </div></div>`;
}

function renderTable(host: HTMLElement, rows: SavedGameRow[]): void {
  DataTable.mount(host, {
    className: "saved-game-list pb-30",
    emptyMessage: t("no_data_available"),
    rows,
    columns: [
      { key: "name", title: t("game_name") },
      {
        key: "status",
        title: t("status"),
        render: (r) =>
          r.status === "active"
            ? `<span style="color:green;">${escapeHtml(t("active"))}</span>`
            : `<span style="color:red;">${escapeHtml(t("inactive"))}</span>`,
      },
      { key: "createdAt", title: t("creation_date_time") },
      {
        key: "_id",
        title: t("action"),
        align: "center",
        render: (r) => `
          <a href="#/savedGameList/${encodeURIComponent(r.gameTypeId)}/view/${encodeURIComponent(r._id)}"
             class="btn btn-info btn-xs btn-rounded" title="${escapeHtml(t("view"))}">
            <i class="fa fa-eye" aria-hidden="true"></i>
          </a>
          <button type="button"
            class="btn btn-success btn-xs btn-rounded m-lr-3"
            data-action="load-saved-game"
            data-id="${escapeHtml(r._id)}"
            data-name="${escapeHtml(r.name)}"
            title="${escapeHtml(t("load_to_game"))}">
            <i class="fa fa-cloud-download" aria-hidden="true"></i>
          </button>
          <button type="button"
            class="btn btn-purple btn-xs btn-rounded m-lr-3"
            data-action="apply-to-schedule"
            data-id="${escapeHtml(r._id)}"
            data-name="${escapeHtml(r.name)}"
            data-game-type-id="${escapeHtml(r.gameTypeId)}"
            title="${escapeHtml(t("apply_to_schedule"))}">
            <i class="fa fa-magic"></i>
          </button>
          <a href="#/savedGameList/${encodeURIComponent(r.gameTypeId)}/edit/${encodeURIComponent(r._id)}"
             class="btn btn-warning btn-xs btn-rounded"
             title="${escapeHtml(t("edit"))}">
            <i class="fa fa-edit" aria-hidden="true"></i>
          </a>
          <button type="button" class="btn btn-danger btn-xs btn-rounded m-lr-3"
            data-action="delete-saved-game"
            data-id="${escapeHtml(r._id)}"
            data-name="${escapeHtml(r.name)}"
            title="${escapeHtml(t("confirm_delete"))}">
            <i class="fa fa-trash" aria-hidden="true"></i>
          </button>`,
      },
    ],
  });

  host.querySelectorAll<HTMLButtonElement>('button[data-action="delete-saved-game"]').forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.dataset.id;
      const name = btn.dataset.name ?? "";
      if (!id) return;
      if (!window.confirm(`${t("confirm_delete")}\n${name}`)) return;
      void handleDelete(host, id);
    });
  });

  host.querySelectorAll<HTMLButtonElement>('button[data-action="load-saved-game"]').forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.dataset.id;
      if (!id) return;
      void handleLoad(btn, id);
    });
  });

  host.querySelectorAll<HTMLButtonElement>('button[data-action="apply-to-schedule"]').forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = btn.dataset.id;
      const gameTypeId = btn.dataset.gameTypeId ?? "";
      const name = btn.dataset.name ?? "";
      if (!id) return;
      void handleApply(host, btn, id, gameTypeId, name);
    });
  });
}

async function handleDelete(tableHost: HTMLElement, id: string): Promise<void> {
  try {
    const result = await deleteSavedGame(id);
    if ("ok" in result && result.ok) {
      Toast.success(t("saved_game_deleted"));
      await loadAndRender(tableHost);
      return;
    }
    if ("reason" in result) {
      Toast.error(result.message ?? t("something_went_wrong"));
    }
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
    Toast.error(msg);
  }
}

async function handleLoad(btn: HTMLButtonElement, id: string): Promise<void> {
  btn.disabled = true;
  try {
    const payload = await loadSavedGameToGame(id);
    if (!payload) {
      Toast.error(t("not_found"));
      return;
    }
    Toast.success(t("saved_game_loaded"));
    // Navigate to GameManagement add page with gameTypeId scoped.
    window.location.hash = `#/gameManagement/${encodeURIComponent(payload.gameTypeId)}/add`;
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
    Toast.error(msg);
  } finally {
    btn.disabled = false;
  }
}

/**
 * Vis modal med liste av aktive DailySchedules (filtrert på gameTypeId via
 * koblet GameManagement) og POST apply-to-schedule for valgt rad. Backend
 * gjør den endelige hall-scope-sjekken — vi viser bare det brukeren har lov
 * til å se via samme listings-endpoint.
 */
async function handleApply(
  tableHost: HTMLElement,
  btn: HTMLButtonElement,
  savedGameId: string,
  gameTypeId: string,
  templateName: string
): Promise<void> {
  btn.disabled = true;
  try {
    const result = await listDailySchedules({ status: "active", limit: 200 });
    const schedules = result.schedules;
    if (schedules.length === 0) {
      Toast.info(t("no_data_available"));
      return;
    }
    const optionsHtml = schedules
      .map((s) => renderScheduleOption(s))
      .join("");
    const bodyHtml = `
      <p>${escapeHtml(t("template_apply_select_schedule"))}</p>
      <p class="text-muted">${escapeHtml(templateName)} (${escapeHtml(gameTypeId)})</p>
      <select id="apply-schedule-select" class="form-control">
        ${optionsHtml}
      </select>`;
    Modal.open({
      title: t("apply_to_schedule"),
      content: bodyHtml,
      buttons: [
        { label: t("cancel"), variant: "default", action: "cancel" },
        {
          label: t("apply_to_schedule"),
          variant: "primary",
          action: "confirm",
          dismiss: false,
          onClick: async (instance) => {
            const select = instance.root.querySelector<HTMLSelectElement>(
              "#apply-schedule-select"
            );
            const scheduleId = select?.value ?? "";
            if (!scheduleId) {
              Toast.error(t("template_apply_select_schedule"));
              return;
            }
            try {
              await applySavedGameToSchedule(savedGameId, scheduleId);
              Toast.success(t("template_applied_success"));
              instance.close("button");
              await loadAndRender(tableHost);
            } catch (err) {
              const msg =
                err instanceof ApiError
                  ? err.message
                  : err instanceof Error
                    ? err.message
                    : String(err);
              Toast.error(msg);
            }
          },
        },
      ],
    });
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
    Toast.error(msg);
  } finally {
    btn.disabled = false;
  }
}

function renderScheduleOption(s: DailyScheduleRow): string {
  const label = `${s.name}${s.startDate ? ` — ${s.startDate}` : ""}${s.hallId ? ` (${s.hallId})` : ""}`;
  return `<option value="${escapeHtml(s.id)}">${escapeHtml(label)}</option>`;
}
