// BIN-633: Opprett spiller (admin-provisioned).
//
// Typisk flyt: support har en kontant-kunde i hall som trenger konto
// opprettet uten self-service. Admin fyller inn e-post, navn, fødselsdato,
// valgfritt telefon + hallId; backend genererer et temp-passord som vi
// viser admin én gang her. Admin videreformidler passordet ut-of-band
// (ikke i audit-loggen).
//
// Feil fra backend (INVALID_INPUT, EMAIL_EXISTS, AGE_RESTRICTED,
// HALL_NOT_FOUND) overflates som toast via ApiError.message.

import { Modal, type ModalInstance } from "../../../components/Modal.js";
import { Toast } from "../../../components/Toast.js";
import {
  createPlayer,
  type CreatePlayerInput,
  type CreatePlayerResult,
} from "../../../api/admin-players.js";
import { ApiError } from "../../../api/client.js";
import { t } from "../../../i18n/I18n.js";
import { escapeHtml } from "../shared.js";

export interface CreatePlayerOptions {
  onCreated?: (result: CreatePlayerResult) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIRTH_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readField(form: HTMLElement, id: string): string {
  const el = form.querySelector<HTMLInputElement>(`#${id}`);
  return el ? el.value.trim() : "";
}

function setError(form: HTMLElement, message: string | null): void {
  const host = form.querySelector<HTMLElement>("#create-player-error");
  if (!host) return;
  if (!message) {
    host.style.display = "none";
    host.textContent = "";
    return;
  }
  host.textContent = message;
  host.style.display = "block";
}

export function openCreatePlayerModal(opts: CreatePlayerOptions = {}): void {
  const body = document.createElement("div");
  body.innerHTML = `
    <form id="create-player-form" novalidate>
      <div class="form-group">
        <label for="cp-email">${escapeHtml(t("email_address"))} *</label>
        <input type="email" id="cp-email" class="form-control" required
               autocomplete="off" maxlength="254">
      </div>
      <div class="row">
        <div class="form-group col-sm-6">
          <label for="cp-displayName">${escapeHtml(t("first_name"))} *</label>
          <input type="text" id="cp-displayName" class="form-control" required
                 maxlength="100">
        </div>
        <div class="form-group col-sm-6">
          <label for="cp-surname">${escapeHtml(t("surname"))} *</label>
          <input type="text" id="cp-surname" class="form-control" required
                 maxlength="100">
        </div>
      </div>
      <div class="row">
        <div class="form-group col-sm-6">
          <label for="cp-birthDate">${escapeHtml(t("date_of_birth"))} *</label>
          <input type="date" id="cp-birthDate" class="form-control" required>
        </div>
        <div class="form-group col-sm-6">
          <label for="cp-phone">${escapeHtml(t("mobile_number"))}</label>
          <input type="tel" id="cp-phone" class="form-control" maxlength="32">
        </div>
      </div>
      <div class="form-group">
        <label for="cp-hallId">${escapeHtml(t("hall_id_optional"))}</label>
        <input type="text" id="cp-hallId" class="form-control" maxlength="64">
      </div>
      <p id="create-player-error" class="help-block"
         style="color:#a94442;display:none;margin-top:4px;"></p>
    </form>
  `;

  const validate = (): CreatePlayerInput | null => {
    setError(body, null);
    const email = readField(body, "cp-email");
    const displayName = readField(body, "cp-displayName");
    const surname = readField(body, "cp-surname");
    const birthDate = readField(body, "cp-birthDate");
    const phone = readField(body, "cp-phone");
    const hallId = readField(body, "cp-hallId");

    if (!email || !displayName || !surname || !birthDate) {
      setError(body, t("please_fill_required_fields"));
      return null;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setError(body, t("invalid_email_format"));
      return null;
    }
    if (!BIRTH_PATTERN.test(birthDate)) {
      setError(body, t("invalid_birth_date_format"));
      return null;
    }

    const input: CreatePlayerInput = {
      email,
      displayName,
      surname,
      birthDate,
    };
    if (phone) input.phone = phone;
    if (hallId) input.hallId = hallId;
    return input;
  };

  const submit = async (instance: ModalInstance): Promise<void> => {
    const input = validate();
    if (!input) return;
    try {
      const result = await createPlayer(input);
      Toast.success(t("player_created_success"));
      opts.onCreated?.(result);
      instance.close("button");
      showTemporaryPasswordDialog(result);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
      setError(body, msg);
      Toast.error(msg);
      // keep modal open so admin can correct
    }
  };

  Modal.open({
    title: t("create_player_title"),
    content: body,
    backdrop: "static",
    keyboard: false,
    buttons: [
      { label: t("no_cancle"), variant: "default", action: "cancel" },
      {
        label: t("create"),
        variant: "primary",
        action: "confirm",
        dismiss: false,
        onClick: submit,
      },
    ],
  });
}

/**
 * Én-gangs visning av temp-passord. Admin må notere det og sende det
 * out-of-band til spilleren — backend logger bare e-post-domenet, aldri
 * selve passordet.
 */
function showTemporaryPasswordDialog(result: CreatePlayerResult): void {
  const body = document.createElement("div");
  body.innerHTML = `
    <p>${escapeHtml(t("temporary_password_intro"))}</p>
    <p><strong>${escapeHtml(t("email_address"))}:</strong>
       ${escapeHtml(result.player.email)}</p>
    <div class="form-group">
      <label for="cp-temppw">${escapeHtml(t("temporary_password"))}</label>
      <input type="text" id="cp-temppw" class="form-control" readonly
             value="${escapeHtml(result.temporaryPassword)}">
    </div>
    <p class="text-warning"><strong>${escapeHtml(t("show_once_warning"))}</strong></p>`;

  Modal.open({
    title: t("temporary_password"),
    content: body,
    backdrop: "static",
    keyboard: false,
    buttons: [
      {
        label: t("copy"),
        variant: "default",
        action: "copy",
        dismiss: false,
        onClick: async () => {
          const input = body.querySelector<HTMLInputElement>("#cp-temppw");
          if (!input) return;
          input.select();
          try {
            await navigator.clipboard?.writeText?.(result.temporaryPassword);
            Toast.success(t("copied_to_clipboard"));
          } catch {
            Toast.warning(t("copy_manual"));
          }
        },
      },
      { label: t("close"), variant: "primary", action: "close" },
    ],
  });
}
