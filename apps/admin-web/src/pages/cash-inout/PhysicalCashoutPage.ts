// Physical cashout list — legacy agent-flow view for closed/cashed-out tickets
// on the current shift. Port of agent `/agent/physicalCashOut` route.
//
// FOLLOWUP-13: hver rad har en "Vis pattern (5×5 grid)"-action som åpner
// PhysicalCashoutPatternModal med matched cells per wireframe §17.35.
// Header har "Reward All"-genvei til /agent/physical-cashout-vyen som
// håndterer bulk-payout av pending vinnere.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import { DataTable } from "../../components/DataTable.js";
import { ApiError } from "../../api/client.js";
import {
  getPhysicalCashouts,
  getPhysicalCashoutSummary,
  type PhysicalCashoutItem,
} from "../../api/agent-shift.js";
import { boxClose, boxOpen, contentHeader, escapeHtml, formatNOK } from "./shared.js";
import { openPhysicalCashoutPatternModal } from "./PhysicalCashoutPatternModal.js";
import type { PhysicalTicket } from "../../api/admin-physical-tickets.js";

export function renderPhysicalCashoutPage(container: HTMLElement): void {
  container.innerHTML = `
    ${contentHeader("physical_cash_out")}
    <section class="content">
      ${boxOpen("physical_cash_out", "default")}
        <div class="row" style="margin-bottom:12px;">
          <div class="col-sm-4">
            <strong>${escapeHtml(t("registered_ticket_count"))}:</strong> <span id="po-count">—</span>
          </div>
          <div class="col-sm-4 text-right">
            <strong>${escapeHtml(t("total_winning"))}:</strong> <span id="po-total">—</span> kr
          </div>
          <div class="col-sm-4 text-right">
            <a href="#/agent/physical-cashout"
               class="btn btn-warning btn-sm"
               data-action="reward-all-shortcut"
               title="${escapeHtml(t("agent_physical_cashout_reward_all"))}">
              <i class="fa fa-trophy" aria-hidden="true"></i>
              ${escapeHtml(t("agent_physical_cashout_reward_all"))}
            </a>
          </div>
        </div>
        <div id="po-table">${escapeHtml(t("loading_ellipsis"))}</div>
      ${boxClose()}
    </section>`;

  const tableHost = container.querySelector<HTMLElement>("#po-table")!;
  const countEl = container.querySelector<HTMLElement>("#po-count")!;
  const totalEl = container.querySelector<HTMLElement>("#po-total")!;

  void (async () => {
    try {
      const [items, summary] = await Promise.all([
        getPhysicalCashouts(),
        getPhysicalCashoutSummary(),
      ]);
      countEl.textContent = String(summary.count);
      totalEl.textContent = formatNOK(summary.totalAmount);

      DataTable.mount<PhysicalCashoutItem>(tableHost, {
        columns: [
          {
            key: "createdAt",
            title: t("date_time"),
            render: (r) => escapeHtml(new Date(r.createdAt).toLocaleString("nb-NO")),
          },
          { key: "ticketNumber", title: t("ticket_number") },
          { key: "gameId", title: t("game_name") },
          {
            key: "amount",
            title: t("amount"),
            align: "right",
            render: (r) => `${formatNOK(r.amount)} kr`,
          },
          {
            key: "ticketNumber",
            title: t("action"),
            align: "center",
            render: (r) =>
              `<button type="button"
                       class="btn btn-default btn-xs po-row-pattern"
                       data-ticket-number="${escapeHtml(r.ticketNumber)}"
                       data-game-id="${escapeHtml(r.gameId)}"
                       data-amount-cents="${r.amount * 100}"
                       title="${escapeHtml(t("agent_physical_cashout_view_pattern"))}"
                       aria-label="${escapeHtml(t("agent_physical_cashout_view_pattern"))}">
                <i class="fa fa-th" aria-hidden="true"></i>
                <span class="sr-only">5×5 grid</span>
              </button>`,
          },
        ],
        rows: items,
        emptyMessage: t("no_data_available_in_table"),
      });

      // FOLLOWUP-13: åpne pattern-popup (5×5 grid) for raden.
      // Den faktiske ticket-row har bare ticketNumber + amount; popup
      // bruker /api/agent/bingo/check for å rendre matched cells.
      tableHost.querySelectorAll<HTMLButtonElement>(".po-row-pattern").forEach((btn) => {
        btn.addEventListener("click", () => {
          const uniqueId = btn.getAttribute("data-ticket-number");
          const gameId = btn.getAttribute("data-game-id");
          const amountCentsAttr = btn.getAttribute("data-amount-cents");
          if (!uniqueId) return;
          const amountCents = amountCentsAttr ? Number(amountCentsAttr) : 0;
          openPhysicalCashoutPatternModal({
            ticket: makePartialTicket(uniqueId, amountCents),
            gameId: gameId || null,
            // Cashed-out items er allerede rewarded.
            isRewarded: true,
            canReward: false,
          });
        });
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
      Toast.error(msg);
      tableHost.innerHTML = "";
    }
  })();
}

/**
 * Bygger et minimal-PhysicalTicket fra row-data slik at popup-modulen kan
 * rendre 5×5-grid uten en ekstra fetch. `numbersJson` er null fordi denne
 * tabellen ikke har det per-rad — popup faller tilbake til
 * pattern-overlay (alle 5 rad-pattern-celler highlightet) hvis vi ikke
 * får accurate matched cells fra /api/agent/bingo/check.
 */
function makePartialTicket(uniqueId: string, amountCents: number): PhysicalTicket {
  return {
    id: uniqueId,
    batchId: "",
    uniqueId,
    hallId: "",
    status: "SOLD",
    priceCents: null,
    assignedGameId: null,
    soldAt: null,
    soldBy: null,
    buyerUserId: null,
    voidedAt: null,
    voidedBy: null,
    voidedReason: null,
    createdAt: "",
    updatedAt: "",
    numbersJson: null,
    patternWon: null,
    wonAmountCents: amountCents,
    evaluatedAt: null,
    isWinningDistributed: true,
    winningDistributedAt: null,
  };
}
