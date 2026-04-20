// BIN-634: Rediger spiller (admin-edit).
//
// Tillatte felter: displayName, surname, phone, hallId.
// E-post er IKKE redigerbar her (identitetsbevarende; backend returnerer
// INVALID_INPUT hvis `email` er med). Vi viser e-post read-only så admin
// skjønner at endring må gå en annen vei.
//
// Vi sender bare de feltene admin faktisk endret — tom diff gir
// INVALID_INPUT fra backend, som vi overflater som toast.

import { Modal, type ModalInstance } from "../../../components/Modal.js";
import { Toast } from "../../../components/Toast.js";
import {
  updatePlayer,
  type PlayerSummary,
  type UpdatePlayerInput,
} from "../../../api/admin-players.js";
import { ApiError } from "../../../api/client.js";
import { t } from "../../../i18n/I18n.js";
import { escapeHtml } from "../shared.js";

export interface EditPlayerOptions {
  player: PlayerSummary;
  onUpdated?: (updated: PlayerSummary) => void;
}

function readField(form: HTMLElement, id: string): string {
  const el = form.querySelector<HTMLInputElement>(`#${id}`);
  return el ? el.value.trim() : "";
}

function setError(form: HTMLElement, message: string | null): void {
  const host = form.querySelector<HTMLElement>("#edit-player-error");
  if (!host) return;
  if (!message) {
    host.style.display = "none";
    host.textContent = "";
    return;
  }
  host.textContent = message;
  host.style.display = "block";
}

function buildDiff(
  original: PlayerSummary,
  form: HTMLElement
): UpdatePlayerInput {
  const updates: UpdatePlayerInput = {};

  const displayName = readField(form, "ep-displayName");
  if (displayName && displayName !== original.displayName) {
    updates.displayName = displayName;
  }

  const surname = readField(form, "ep-surname");
  const originalSurname = original.surname ?? "";
  if (surname !== originalSurname) {
    updates.surname = surname.length > 0 ? surname : null;
  }

  const phone = readField(form, "ep-phone");
  const originalPhone = original.phone ?? "";
  if (phone !== originalPhone) {
    updates.phone = phone.length > 0 ? phone : null;
  }

  const hallId = readField(form, "ep-hallId");
  const originalHallId = original.hallId ?? "";
  if (hallId !== originalHallId) {
    updates.hallId = hallId.length > 0 ? hallId : null;
  }

  return updates;
}

export function openEditPlayerModal(opts: EditPlayerOptions): void {
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="edit-player-form" novalidate>
      <div class="form-group">
        <label for="ep-email">${escapeHtml(t("email_address"))}</label>
        <input type="email" id="ep-email" class="form-control" readonly
               value="${escapeHtml(opts.player.email)}">
        <p class="help-block">${escapeHtml(t("email_change_blocked_hint"))}</p>
      </div>
      <div class="row">
        <div class="form-group col-sm-6">
          <label for="ep-displayName">${escapeHtml(t("first_name"))} *</label>
          <input type="text" id="ep-displayName" class="form-control" required
                 maxlength="100" value="${escapeHtml(opts.player.displayName)}">
        </div>
        <div class="form-group col-sm-6">
          <label for="ep-surname">${escapeHtml(t("surname"))}</label>
          <input type="text" id="ep-surname" class="form-control"
                 maxlength="100" value="${escapeHtml(opts.player.surname ?? "")}">
        </div>
      </div>
      <div class="row">
        <div class="form-group col-sm-6">
          <label for="ep-phone">${escapeHtml(t("mobile_number"))}</label>
          <input type="tel" id="ep-phone" class="form-control"
                 maxlength="32" value="${escapeHtml(opts.player.phone ?? "")}">
        </div>
        <div class="form-group col-sm-6">
          <label for="ep-hallId">${escapeHtml(t("hall_id_optional"))}</label>
          <input type="text" id="ep-hallId" class="form-control"
                 maxlength="64" value="${escapeHtml(opts.player.hallId ?? "")}">
        </div>
      </div>
      <p id="edit-player-error" class="help-block"
         style="color:#a94442;display:none;margin-top:4px;"></p>
    </form>
  `;

  const submit = async (instance: ModalInstance): Promise<void> => {
    setError(body, null);

    // displayName er required når satt (backend tillater ikke tomt navn).
    const displayName = readField(body, "ep-displayName");
    if (!displayName) {
      setError(body, t("please_fill_required_fields"));
      return;
    }

    const diff = buildDiff(opts.player, body);
    if (Object.keys(diff).length === 0) {
      setError(body, t("no_changes_to_save"));
      return;
    }

    try {
      const result = await updatePlayer(opts.player.id, diff);
      Toast.success(t("player_updated_success"));
      opts.onUpdated?.(result.player);
      instance.close("button");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
      setError(body, msg);
      Toast.error(msg);
      // keep modal open
    }
  };

  Modal.open({
    title: t("edit_player_title"),
    content: body,
    backdrop: "static",
    keyboard: false,
    buttons: [
      { label: t("no_cancle"), variant: "default", action: "cancel" },
      {
        label: t("save"),
        variant: "primary",
        action: "confirm",
        dismiss: false,
        onClick: submit,
      },
    ],
  });
}
