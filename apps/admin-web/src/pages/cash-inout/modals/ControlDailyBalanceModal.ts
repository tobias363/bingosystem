// Control daily balance — pre-close midtveis-sjekk av kontant-kasse.
//
// Legacy-referanse: wireframe PDF 17.3 (Agent V1.0 14.10.2024). Modal viser:
//   - Daily balance       (input — agent teller daglig kasse-skift-delta)
//   - Total cash balance  (input — agent teller total kontant i hallen)
//   - Submit-knapp
//
// Agent kan kalle dette flere ganger uten å påvirke shiften (no-op write —
// backend persisterer kun siste kontroll). Real close-day skjer via
// `SettlementModal` (Oppgjør-knappen).
//
// Backend-kontrakt: `POST /api/agent/shift/control-daily-balance`
//   body: { reportedDailyBalance, reportedTotalCashBalance, notes? }
//   resp: { shiftDailyBalance, reportedDailyBalance, diff, diffPct, severity }
//
// Severity-regler (matcher AgentSettlementService.computeDiffSeverity):
//   - OK              : |diff| ≤ 500 kr OG ≤ 5 %
//   - NOTE_REQUIRED   : 500 < |diff| ≤ 1000 kr ELLER 5 < |%| ≤ 10
//   - FORCE_REQUIRED  : |diff| > 1000 kr ELLER |%| > 10  (krever ADMIN ved close)
//
// To-stegs-flyt: første klikk validerer + kjører ett kall med (eller uten)
// notat. Hvis backend signaliserer NOTE_REQUIRED og notatet mangler, viser vi
// notat-feltet og lar agenten sende på nytt med forklaring.

import { t } from "../../../i18n/I18n.js";
import { Modal } from "../../../components/Modal.js";
import { Toast } from "../../../components/Toast.js";
import { ApiError } from "../../../api/client.js";
import {
  controlDailyBalance,
  type ControlDailyBalanceResult,
} from "../../../api/agent-shift.js";

const DIFF_LIMIT = 500;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function formatNOK(n: number): string {
  return `${n.toFixed(2)} kr`;
}

function formatPct(n: number): string {
  return `${n.toFixed(2)} %`;
}

export function openControlDailyBalanceModal(): void {
  const form = document.createElement("form");
  form.innerHTML = `
    <div class="form-group">
      <label for="cdb-daily-balance">${escapeHtml(t("daily_balance"))} (kr)</label>
      <input type="number" step="0.01" min="0" class="form-control"
             id="cdb-daily-balance" name="reportedDailyBalance" required autofocus>
    </div>
    <div class="form-group">
      <label for="cdb-total-cash">${escapeHtml(t("total_cash_balance"))} (kr)</label>
      <input type="number" step="0.01" min="0" class="form-control"
             id="cdb-total-cash" name="reportedTotalCashBalance" required>
    </div>
    <div id="cdb-result" style="display:none;">
      <hr>
      <dl class="dl-horizontal">
        <dt>${escapeHtml(t("expected_balance"))}</dt>
        <dd id="cdb-expected">—</dd>
        <dt>${escapeHtml(t("reported_daily_balance"))}</dt>
        <dd id="cdb-reported">—</dd>
        <dt>${escapeHtml(t("difference"))}</dt>
        <dd id="cdb-diff">—</dd>
        <dt>${escapeHtml(t("severity"))}</dt>
        <dd id="cdb-severity">—</dd>
      </dl>
      <div class="form-group" id="cdb-note-group" style="display:none;">
        <label for="cdb-notes">${escapeHtml(t("note_required", { limit: String(DIFF_LIMIT) }))}</label>
        <textarea class="form-control" id="cdb-notes" rows="3" required></textarea>
      </div>
    </div>`;

  Modal.open({
    title: t("control_daily_balance"),
    content: form,
    buttons: [
      { label: t("cancel_button"), variant: "default", action: "cancel" },
      {
        label: t("submit"),
        variant: "success",
        action: "confirm",
        // To-stegs: behold modalen åpen til respons er behandlet.
        dismiss: false,
        onClick: async (instance) => {
          const reportedDailyBalance = Number((form.querySelector<HTMLInputElement>("#cdb-daily-balance")!).value);
          const reportedTotalCashBalance = Number((form.querySelector<HTMLInputElement>("#cdb-total-cash")!).value);
          if (!Number.isFinite(reportedDailyBalance) || reportedDailyBalance < 0) {
            Toast.error(t("invalid_input") || t("something_went_wrong"));
            return;
          }
          if (!Number.isFinite(reportedTotalCashBalance) || reportedTotalCashBalance < 0) {
            Toast.error(t("invalid_input") || t("something_went_wrong"));
            return;
          }
          const notes = (form.querySelector<HTMLTextAreaElement>("#cdb-notes")?.value ?? "").trim();
          try {
            const res = await controlDailyBalance({
              reportedDailyBalance,
              reportedTotalCashBalance,
              notes: notes || undefined,
            });
            renderResult(form, res);

            // NOTE_REQUIRED uten notat → vis notat-felt og hold modalen åpen.
            // FORCE_REQUIRED → varsle, men la agent legge inn notat (close-day
            // krever ADMIN; control-daily-balance er informativt-only).
            if (res.severity === "NOTE_REQUIRED" && !notes) {
              Toast.warning(t("diff_exceeds_limit", { limit: String(DIFF_LIMIT) }));
              const ng = form.querySelector<HTMLElement>("#cdb-note-group");
              if (ng) ng.style.display = "";
              return;
            }
            if (res.severity === "FORCE_REQUIRED") {
              Toast.warning(t("admin_force_required") || t("diff_exceeds_limit", { limit: String(DIFF_LIMIT) }));
              const ng = form.querySelector<HTMLElement>("#cdb-note-group");
              if (ng) ng.style.display = "";
              if (!notes) return;
            }
            Toast.success(t("data_updated_successfully"));
            instance.close("button");
          } catch (err) {
            const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
            Toast.error(msg);
          }
        },
      },
    ],
  });
}

function renderResult(form: HTMLElement, res: ControlDailyBalanceResult): void {
  const resultBox = form.querySelector<HTMLElement>("#cdb-result")!;
  resultBox.style.display = "";

  const setText = (id: string, value: string): void => {
    const el = form.querySelector<HTMLElement>(`#${id}`);
    if (el) el.textContent = value;
  };

  setText("cdb-expected", formatNOK(res.shiftDailyBalance));
  setText("cdb-reported", formatNOK(res.reportedDailyBalance));

  const diffEl = form.querySelector<HTMLElement>("#cdb-diff");
  if (diffEl) {
    diffEl.textContent = `${formatNOK(res.diff)} (${formatPct(res.diffPct)})`;
    diffEl.style.color =
      res.severity === "OK" ? "#00a65a" :
      res.severity === "NOTE_REQUIRED" ? "#f39c12" :
      "#dd4b39";
  }

  setText("cdb-severity", severityLabel(res.severity));
}

function severityLabel(severity: ControlDailyBalanceResult["severity"]): string {
  switch (severity) {
    case "OK":              return t("severity_ok") || "OK";
    case "NOTE_REQUIRED":   return t("severity_note_required") || t("note_required", { limit: String(DIFF_LIMIT) });
    case "FORCE_REQUIRED":  return t("severity_force_required") || t("admin_force_required") || "FORCE_REQUIRED";
  }
}
