// Add Daily Balance — agent legger inn start-skift-balance.
//
// Legacy-referanse: wireframe PDF 17.5 (Agent V1.0 14.10.2024). Modal viser:
//   - "Current Balance: 0 kr"  (read-only display av aktuell daily-balance)
//   - "Enter Balance"          (input av beløpet som skal overføres fra
//                               hall-cash til shiftens daily-balance)
//
// Forretningsregler (per legacy + AgentOpenDayService):
//   - Bare tilgjengelig ved skift-start (eller når daily-balance == 0).
//   - amount må være > 0 og ≤ hall.cashBalance (backend validerer).
//   - Backend overfører fra app_halls.cash_balance til shift.daily_balance
//     atomisk via PostgresHallStore.transferBalance + AgentStore.applyShiftCashDelta.
//
// Wire-kontrakten er `{ amount, notes }` — se
// `apps/backend/src/routes/agentOpenDay.ts:86` (POST /api/agent/shift/open-day).

import { t } from "../../../i18n/I18n.js";
import { Modal } from "../../../components/Modal.js";
import { Toast } from "../../../components/Toast.js";
import { ApiError } from "../../../api/client.js";
import { getDailyBalance, openDay, type DailyBalance } from "../../../api/agent-shift.js";
import { escapeHtml } from "../../../utils/escapeHtml.js";

function formatNOK(n: number): string {
  return `${n.toFixed(2)} kr`;
}

export interface AddDailyBalanceModalOptions {
  /** Kalles etter vellykket open-day for å refreshe Daglig saldo-tabellen. */
  onSuccess?: (balance: DailyBalance) => void;
}

export function openAddDailyBalanceModal(opts: AddDailyBalanceModalOptions = {}): void {
  const form = document.createElement("form");
  form.innerHTML = `
    <p class="adb-current-balance">
      <strong>${escapeHtml(t("current_balance"))}:</strong>
      <span id="adb-current" data-marker="adb-current">${escapeHtml(t("loading_ellipsis"))}</span>
    </p>
    <div class="form-group">
      <label for="adb-amount">${escapeHtml(t("enter_balance"))} (kr)</label>
      <input type="number" step="0.01" min="0.01" class="form-control"
             id="adb-amount" name="amount" required autofocus>
    </div>
    <div class="form-group">
      <label for="adb-notes">${escapeHtml(t("note_optional"))}</label>
      <textarea class="form-control" id="adb-notes" name="notes" rows="2"></textarea>
    </div>`;

  // Hent current balance asynkront og fyll inn.
  void (async () => {
    try {
      const balance = await getDailyBalance();
      const el = form.querySelector<HTMLElement>("#adb-current");
      if (el) el.textContent = formatNOK(balance.dailyBalance);
    } catch {
      const el = form.querySelector<HTMLElement>("#adb-current");
      if (el) el.textContent = formatNOK(0);
    }
  })();

  Modal.open({
    title: t("add_daily_balance"),
    content: form,
    buttons: [
      { label: t("cancel_button"), variant: "default", action: "cancel" },
      {
        label: t("add"),
        variant: "success",
        action: "confirm",
        dismiss: false,
        onClick: async (instance) => {
          const amount = Number((form.querySelector<HTMLInputElement>("#adb-amount")!).value);
          if (!Number.isFinite(amount) || amount <= 0) {
            Toast.error(t("invalid_input") || t("something_went_wrong"));
            return;
          }
          const notes = (form.querySelector<HTMLTextAreaElement>("#adb-notes")!).value.trim() || undefined;
          try {
            const result = await openDay({ amount, notes });
            Toast.success(t("data_updated_successfully"));
            instance.close("button");
            opts.onSuccess?.(result);
          } catch (err) {
            const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
            Toast.error(msg);
          }
        },
      },
    ],
  });
}
