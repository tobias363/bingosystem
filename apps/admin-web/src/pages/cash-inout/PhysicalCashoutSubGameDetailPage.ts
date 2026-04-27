// Physical cashout — sub-game detail page (wireframe §17.34).
//
// Displays the per-ticket cashout grid for a single sub-game with totals and
// a "Reward All" action. URL: `#/agent/physical-cashout/sub-game/:id`.
//
// FOLLOWUP-13 update: bank-icon now opens the per-ticket 5×5 pattern popup
// (PhysicalCashoutPatternModal) per wireframe §17.35. The popup highlights
// matched cells and shows Cashout/Rewarded status per pattern.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import { ApiError, apiRequest } from "../../api/client.js";
import { boxClose, boxOpen, contentHeader, escapeHtml, formatNOK } from "./shared.js";
import { openPhysicalCashoutPatternModal } from "./PhysicalCashoutPatternModal.js";
import type {
  PhysicalTicket,
  PhysicalTicketPattern,
} from "../../api/admin-physical-tickets.js";

interface CashoutTicketRow {
  uniqueId: string;
  ticketNumber: string;
  ticketType: string;
  ticketPriceCents: number;
  winningPattern: string;
  totalWinningCents: number;
  rewardedCents: number;
  pendingCents: number;
  numbersJson?: number[] | null;
  patternWon?: PhysicalTicketPattern | null;
  assignedGameId?: string | null;
  hallId?: string;
  batchId?: string;
  soldAt?: string | null;
}

interface SubGameDetailResponse {
  subGameId: string;
  subGameName: string;
  tickets: CashoutTicketRow[];
}

function extractSubGameIdFromHash(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const bare = hash.split("?")[0] ?? "";
  const match = /^\/agent\/physical-cashout\/sub-game\/([^/]+)$/.exec(bare);
  return match ? decodeURIComponent(match[1]!) : "";
}

export function renderPhysicalCashoutSubGameDetailPage(container: HTMLElement): void {
  const subGameId = extractSubGameIdFromHash();
  container.innerHTML = `
    ${contentHeader("physical_cash_out", t("sub_game_name"))}
    <section class="content">
      ${boxOpen("physical_cash_out", "default")}
        <div class="row" style="margin-bottom:12px;">
          <div class="col-sm-6">
            <strong>${escapeHtml(t("sub_game_name"))}:</strong>
            <span id="po-subgame-name">${escapeHtml(subGameId || "—")}</span>
          </div>
          <div class="col-sm-6 text-right">
            <button type="button" id="po-reward-all" class="btn btn-success">
              <i class="fa fa-money" aria-hidden="true"></i> ${escapeHtml(t("reward_all"))}
            </button>
          </div>
        </div>
        <div id="po-table-host">${escapeHtml(t("loading_ellipsis"))}</div>
        <div id="po-totals" class="row" style="margin-top:16px;border-top:1px solid #eee;padding-top:12px;">
          <div class="col-sm-4">
            <strong>${escapeHtml(t("total_winnings"))}:</strong>
            <span id="po-total">—</span> kr
          </div>
          <div class="col-sm-4">
            <strong>${escapeHtml(t("rewarded_amount"))}:</strong>
            <span id="po-rewarded">—</span> kr
          </div>
          <div class="col-sm-4">
            <strong>${escapeHtml(t("pending_amount"))}:</strong>
            <span id="po-pending">—</span> kr
          </div>
        </div>
      ${boxClose()}
    </section>`;

  const tableHost = container.querySelector<HTMLElement>("#po-table-host")!;
  const totalEl = container.querySelector<HTMLElement>("#po-total")!;
  const rewardedEl = container.querySelector<HTMLElement>("#po-rewarded")!;
  const pendingEl = container.querySelector<HTMLElement>("#po-pending")!;
  const rewardAllBtn = container.querySelector<HTMLButtonElement>("#po-reward-all")!;

  if (!subGameId) {
    tableHost.innerHTML = `<p class="text-muted">${escapeHtml(t("no_data_available_in_table"))}</p>`;
    rewardAllBtn.disabled = true;
    return;
  }

  void loadAndRender();

  rewardAllBtn.addEventListener("click", () => {
    void onRewardAll(subGameId, () => loadAndRender());
  });

  async function loadAndRender(): Promise<void> {
    try {
      const data = await fetchSubGameDetail(subGameId);
      renderTickets(tableHost, data.tickets);
      const totals = computeTotals(data.tickets);
      totalEl.textContent = formatNOK(totals.totalWinning / 100);
      rewardedEl.textContent = formatNOK(totals.rewarded / 100);
      pendingEl.textContent = formatNOK(totals.pending / 100);
      rewardAllBtn.disabled = totals.pending <= 0;
      const subGameNameEl = container.querySelector<HTMLElement>("#po-subgame-name");
      if (subGameNameEl) {
        subGameNameEl.textContent = data.subGameName || subGameId;
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Noe gikk galt.";
      if (err instanceof ApiError && err.code === "NOT_IMPLEMENTED") {
        tableHost.innerHTML = `<p class="text-muted">${escapeHtml(msg)}</p>`;
        rewardAllBtn.disabled = true;
        totalEl.textContent = "0.00";
        rewardedEl.textContent = "0.00";
        pendingEl.textContent = "0.00";
        return;
      }
      Toast.error(msg);
      tableHost.innerHTML = "";
    }
  }
}

function fetchSubGameDetail(subGameId: string): Promise<SubGameDetailResponse> {
  return apiRequest<SubGameDetailResponse>(
    `/api/agent/physical-cashout/sub-game/${encodeURIComponent(subGameId)}`,
    { auth: true },
  );
}

async function onRewardAll(subGameId: string, reload: () => Promise<void>): Promise<void> {
  if (!window.confirm(t("reward_all_pending_winings"))) return;
  try {
    await apiRequest(
      `/api/agent/physical-cashout/sub-game/${encodeURIComponent(subGameId)}/reward-all`,
      { method: "POST", body: {}, auth: true },
    );
    Toast.success(t("reward_all_complete"));
    await reload();
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : "Noe gikk galt.";
    Toast.error(msg);
  }
}

interface Totals {
  totalWinning: number;
  rewarded: number;
  pending: number;
}

function computeTotals(rows: CashoutTicketRow[]): Totals {
  let totalWinning = 0;
  let rewarded = 0;
  let pending = 0;
  for (const row of rows) {
    totalWinning += row.totalWinningCents;
    rewarded += row.rewardedCents;
    pending += row.pendingCents;
  }
  return { totalWinning, rewarded, pending };
}

function renderTickets(host: HTMLElement, rows: CashoutTicketRow[]): void {
  if (rows.length === 0) {
    host.innerHTML = `<p class="text-muted">${escapeHtml(t("no_data_available_in_table"))}</p>`;
    return;
  }
  const headers = [
    t("physical_ticket_number"),
    t("ticket_type"),
    t("ticket_price"),
    t("winning_pattern"),
    t("total_winning"),
    t("rewarded_amount"),
    t("pending_amount"),
    t("action"),
  ]
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join("");

  const body = rows
    .map(
      (r) => `
        <tr data-unique-id="${escapeHtml(r.uniqueId)}">
          <td>${escapeHtml(r.ticketNumber)}</td>
          <td>${escapeHtml(r.ticketType)}</td>
          <td class="text-right">${formatNOK(r.ticketPriceCents / 100)} kr</td>
          <td>${escapeHtml(r.winningPattern)}</td>
          <td class="text-right">${formatNOK(r.totalWinningCents / 100)} kr</td>
          <td class="text-right">${formatNOK(r.rewardedCents / 100)} kr</td>
          <td class="text-right">${formatNOK(r.pendingCents / 100)} kr</td>
          <td class="text-center">
            <button type="button" class="btn btn-default btn-sm po-pattern-btn"
                    data-unique-id="${escapeHtml(r.uniqueId)}"
                    title="${escapeHtml(t("agent_physical_cashout_view_pattern"))}"
                    aria-label="${escapeHtml(t("agent_physical_cashout_view_pattern"))}">
              <i class="fa fa-university" aria-hidden="true"></i>
            </button>
          </td>
        </tr>`,
    )
    .join("");

  host.innerHTML = `
    <div class="table-responsive">
      <table class="table table-bordered table-striped">
        <thead><tr>${headers}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  // FOLLOWUP-13: bank-ikon åpner 5×5 pattern-popup per wireframe §17.35.
  host.querySelectorAll<HTMLButtonElement>(".po-pattern-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uniqueId = btn.getAttribute("data-unique-id");
      if (!uniqueId) return;
      const row = rows.find((r) => r.uniqueId === uniqueId);
      if (!row) {
        Toast.error(t("something_went_wrong"));
        return;
      }
      const ticket = rowToPhysicalTicket(row);
      const isRewarded = row.pendingCents <= 0 && row.rewardedCents > 0;
      openPhysicalCashoutPatternModal({
        ticket,
        gameId: row.assignedGameId ?? null,
        isRewarded,
        canReward: false,
      });
    });
  });
}

function rowToPhysicalTicket(row: CashoutTicketRow): PhysicalTicket {
  return {
    id: row.uniqueId,
    batchId: row.batchId ?? "",
    uniqueId: row.uniqueId,
    hallId: row.hallId ?? "",
    status: "SOLD",
    priceCents: row.ticketPriceCents,
    assignedGameId: row.assignedGameId ?? null,
    soldAt: row.soldAt ?? null,
    soldBy: null,
    buyerUserId: null,
    voidedAt: null,
    voidedBy: null,
    voidedReason: null,
    createdAt: "",
    updatedAt: "",
    numbersJson: Array.isArray(row.numbersJson) ? row.numbersJson : null,
    patternWon: row.patternWon ?? coercePattern(row.winningPattern),
    wonAmountCents: row.totalWinningCents,
    evaluatedAt: null,
    isWinningDistributed: row.pendingCents <= 0 && row.rewardedCents > 0,
    winningDistributedAt: null,
  };
}

function coercePattern(raw: string): PhysicalTicketPattern | null {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, "_");
  const known: PhysicalTicketPattern[] = ["row_1", "row_2", "row_3", "row_4", "full_house"];
  return known.includes(norm as PhysicalTicketPattern) ? (norm as PhysicalTicketPattern) : null;
}
