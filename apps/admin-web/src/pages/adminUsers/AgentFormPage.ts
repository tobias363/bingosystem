// PR-A5 (BIN-663) — /agent/add + /agent/edit/:id.
//
// Data:
//   POST /api/admin/agents     { email, password, displayName, surname, phone, language, parentUserId, hallIds[], primaryHallId }
//   GET  /api/admin/agents/:id
//   PUT  /api/admin/agents/:id
//
// Multi-hall-select uses <select multiple> (native vanilla DOM) — we drop
// the legacy chosen.js dependency and let the browser paint the list.
//
// 2026-04-27 (Tobias-direktiv "agent-creation i admin-backend"):
//   - Language enum aligned with OpenAPI / backend AgentService.SUPPORTED_LANGUAGES
//     (nb/nn/en/sv/da). Earlier UI sent "no" which crashed backend with
//     INVALID_LANGUAGE. Default is "nb" (matches backend default).
//   - Password min-length aligned to platformService.register/setPassword (12).
//   - parentUserId-dropdown for manager-hierarki (OpenAPI-felt som tidligere
//     manglet i UI). Selv-referanse filtreres bort i edit-modus.
//   - Inline error-mapping for EMAIL_EXISTS, INVALID_PRIMARY_HALL, FORBIDDEN
//     (hall-scope-violation), INVALID_LANGUAGE.
//
// Hall-scope: HALL_OPERATOR backend (resolveHallScopeFilter / route-guard)
// begrenser hallIds til operatorens egen hall — UI viser alle haller men
// backend rejecter med FORBIDDEN ved cross-hall-tildeling. Lokalisert melding
// vises via mapAgentApiErrorToMessage.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import { ApiError } from "../../api/client.js";
import {
  createAgent,
  updateAgent,
  getAgent,
  listAgents,
  type Agent,
} from "../../api/admin-agents.js";
import { listHalls, type AdminHall } from "../../api/admin-halls.js";
import { boxClose, boxOpen, contentHeader, escapeHtml } from "./shared.js";

/** Aligned with OpenAPI `language` enum + backend SUPPORTED_LANGUAGES. */
const LANGUAGES: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "nb", labelKey: "norwegian" },
  { value: "nn", labelKey: "nynorsk" },
  { value: "en", labelKey: "english" },
  { value: "sv", labelKey: "swedish" },
  { value: "da", labelKey: "danish" },
];

/** Backend platformService.setPassword/register requires ≥ 12 chars. */
const PASSWORD_MIN_LENGTH = 12;

/**
 * Map backend error codes to lokalisert UI-melding. Faller tilbake til den
 * rå serverbeskjeden (allerede norsk) når koden er ukjent. Brukes for å
 * gi en presis melding i fail-closed UI-flow.
 */
function mapAgentApiErrorToMessage(err: unknown, fallbackKey: string): string {
  if (err instanceof ApiError) {
    if (err.code === "EMAIL_EXISTS") return t("agent_email_exists");
    if (err.code === "INVALID_PRIMARY_HALL") return t("agent_invalid_primary_hall");
    if (err.code === "FORBIDDEN") return err.message;
    if (err.code === "INVALID_LANGUAGE") return err.message;
    return err.message || t(fallbackKey);
  }
  return t(fallbackKey);
}

export function renderAgentFormPage(container: HTMLElement, editId: string | null): void {
  const isEdit = editId !== null;
  const titleKey = isEdit ? "edit_agent" : "add_agent";

  container.innerHTML = `
    ${contentHeader(titleKey, "agent_management")}
    <section class="content">
      ${boxOpen(titleKey, "primary")}
        <div id="agent-form-host">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;

  const host = container.querySelector<HTMLElement>("#agent-form-host")!;
  void mount(host, editId, isEdit);
}

async function mount(host: HTMLElement, editId: string | null, isEdit: boolean): Promise<void> {
  let halls: AdminHall[] = [];
  let existing: Agent | null = null;
  let potentialParents: Agent[] = [];
  try {
    [halls, existing, potentialParents] = await Promise.all([
      listHalls().catch(() => [] as AdminHall[]),
      isEdit && editId ? getAgent(editId) : Promise.resolve(null),
      // Active agents only — best-effort load. Failure should not block
      // agent-creation (parent-hierarki er valgfritt).
      listAgents({ status: "active", limit: 200 }).catch(() => [] as Agent[]),
    ]);
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
    host.innerHTML = `<div class="callout callout-danger">${escapeHtml(msg)}</div>`;
    return;
  }

  const assignedHallIds = new Set((existing?.halls ?? []).map((h) => h.hallId));
  const primaryHallId =
    (existing?.halls ?? []).find((h) => h.isPrimary)?.hallId ??
    (existing?.halls ?? [])[0]?.hallId ??
    "";

  // Filter out the agent being edited from parent-options to avoid self-reference.
  const parentOptions = potentialParents.filter((a) => a.userId !== existing?.userId);
  const currentParentId = existing?.parentUserId ?? "";

  host.innerHTML = `
    <form id="agent-form" class="form-horizontal" data-testid="agent-form">
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-displayName">${escapeHtml(t("first_name"))}</label>
        <div class="col-sm-9">
          <input type="text" id="af-displayName" name="displayName" class="form-control" required
            value="${escapeHtml(existing?.displayName ?? "")}">
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-surname">${escapeHtml(t("last_name"))}</label>
        <div class="col-sm-9">
          <input type="text" id="af-surname" name="surname" class="form-control"
            value="${escapeHtml(existing?.surname ?? "")}">
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-email">${escapeHtml(t("email"))}</label>
        <div class="col-sm-9">
          <input type="email" id="af-email" name="email" class="form-control" required
            value="${escapeHtml(existing?.email ?? "")}">
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-phone">${escapeHtml(t("agent_phone"))}</label>
        <div class="col-sm-9">
          <input type="text" id="af-phone" name="phone" class="form-control"
            value="${escapeHtml(existing?.phone ?? "")}">
        </div>
      </div>
      ${isEdit ? "" : `
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-password">${escapeHtml(t("password"))}</label>
        <div class="col-sm-9">
          <input type="password" id="af-password" name="password" class="form-control" required
            minlength="${PASSWORD_MIN_LENGTH}" autocomplete="new-password">
          <p class="help-block" data-testid="agent-password-help">${escapeHtml(t("agent_password_help"))}</p>
        </div>
      </div>`}
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-language">${escapeHtml(t("agent_language"))}</label>
        <div class="col-sm-9">
          <select id="af-language" name="language" class="form-control">
            ${LANGUAGES.map(
              (l) =>
                `<option value="${escapeHtml(l.value)}"${(existing?.language ?? "nb") === l.value ? " selected" : ""}>${escapeHtml(t(l.labelKey))}</option>`
            ).join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-parentUserId">${escapeHtml(t("agent_parent_user"))}</label>
        <div class="col-sm-9">
          <select id="af-parentUserId" name="parentUserId" class="form-control" data-testid="agent-parent-select">
            <option value="">${escapeHtml(t("agent_parent_user_none"))}</option>
            ${parentOptions
              .map((a) => {
                const label = a.surname ? `${a.displayName} ${a.surname}` : a.displayName;
                return `<option value="${escapeHtml(a.userId)}"${currentParentId === a.userId ? " selected" : ""}>${escapeHtml(label)} (${escapeHtml(a.email)})</option>`;
              })
              .join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-halls">${escapeHtml(t("assign_halls"))}</label>
        <div class="col-sm-9">
          <select id="af-halls" name="hallIds" class="form-control" multiple size="5"
                  data-testid="agent-hall-multiselect">
            ${halls
              .map(
                (h) =>
                  `<option value="${escapeHtml(h.id)}"${assignedHallIds.has(h.id) ? " selected" : ""}>${escapeHtml(h.name)}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label" for="af-primary">${escapeHtml(t("primary_hall"))}</label>
        <div class="col-sm-9">
          <select id="af-primary" name="primaryHallId" class="form-control">
            <option value="">${escapeHtml(t("select_hall"))}</option>
            ${halls
              .map(
                (h) =>
                  `<option value="${escapeHtml(h.id)}"${primaryHallId === h.id ? " selected" : ""}>${escapeHtml(h.name)}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <div class="col-sm-offset-3 col-sm-9">
          <button type="submit" class="btn btn-success" data-action="save-agent">
            <i class="fa fa-save" aria-hidden="true"></i> ${escapeHtml(t("submit"))}
          </button>
          <a class="btn btn-default" href="#/agent">${escapeHtml(t("cancel"))}</a>
        </div>
      </div>
    </form>`;

  const form = host.querySelector<HTMLFormElement>("#agent-form")!;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void submit(form, existing);
  });
}

async function submit(form: HTMLFormElement, existing: Agent | null): Promise<void> {
  const displayName = (form.querySelector<HTMLInputElement>("#af-displayName")!).value.trim();
  const surname = (form.querySelector<HTMLInputElement>("#af-surname")!).value.trim();
  const email = (form.querySelector<HTMLInputElement>("#af-email")!).value.trim();
  const phone = (form.querySelector<HTMLInputElement>("#af-phone")!).value.trim();
  const language = (form.querySelector<HTMLSelectElement>("#af-language")!).value;
  const passwordEl = form.querySelector<HTMLInputElement>("#af-password");
  const password = passwordEl ? passwordEl.value : "";
  const parentUserIdRaw = (form.querySelector<HTMLSelectElement>("#af-parentUserId")!).value;
  const parentUserId: string | null = parentUserIdRaw ? parentUserIdRaw : null;
  const hallsSel = form.querySelector<HTMLSelectElement>("#af-halls")!;
  const hallIds = Array.from(hallsSel.selectedOptions).map((o) => o.value);
  const primaryHallIdRaw = (form.querySelector<HTMLSelectElement>("#af-primary")!).value;
  const primaryHallId = primaryHallIdRaw || (hallIds[0] ?? "");

  if (!displayName || !email) {
    Toast.error(t("all_fields_are_required"));
    return;
  }
  if (hallIds.length === 0) {
    Toast.error(t("select_halls"));
    return;
  }
  if (primaryHallId && !hallIds.includes(primaryHallId)) {
    // Ensure primary hall is part of assigned halls.
    hallIds.push(primaryHallId);
  }

  try {
    if (existing) {
      await updateAgent(existing.userId, {
        displayName,
        email,
        phone: phone || null,
        language,
        parentUserId,
        hallIds,
        primaryHallId: primaryHallId || undefined,
      });
      Toast.success(t("success"));
    } else {
      if (password.length < PASSWORD_MIN_LENGTH) {
        Toast.error(t("password_too_short"));
        return;
      }
      await createAgent({
        email,
        password,
        displayName,
        surname,
        phone,
        language,
        parentUserId,
        hallIds,
        primaryHallId: primaryHallId || undefined,
      });
      Toast.success(t("success"));
    }
    window.location.hash = "#/agent";
  } catch (err) {
    Toast.error(mapAgentApiErrorToMessage(err, existing ? "agent_update_failed" : "agent_create_failed"));
  }
}
