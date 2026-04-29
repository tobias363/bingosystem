// Physical Cashout — Per-Ticket 5×5 pattern popup (BIN-FOLLOWUP-13).
//
// Wireframe §17.35:
//   Modal-popup ved klikk på bank-ikon i Physical Cashout-tabellen:
//     - Header: ticket-ID + X-lukkeknapp
//     - 5×5 bingo-grid (25 celler) med vinnende celler highlighted
//     - Pattern-overlay (Row 1, Row 2, ..., Full House)
//     - Winning Patterns-tabell:
//         "Row 1: 100kr — Status: Cashout"
//         "Row 2: 100kr — Status: Rewarded"
//     - Reward-knapp + per-pattern Reward-knapp
//
// Statuser per wireframe:
//   - Cashout-status: vinning ikke betalt enda, klar for utbetaling
//   - Rewarded-status: vinning allerede gitt
//
// Datakilde: `PhysicalTicket` har `numbersJson` (25 tall fra papir-bongen) +
// `patternWon` (høyeste mønster). For å rendre AKTUELT trekte celler i
// 5×5-griden (ikke bare et "alle celler i rad N"-overlay) kalles
// `/api/agent/bingo/check` etter mount — som returnerer
// `matchedCellIndexes` + `winningPatterns[]`. Hvis API-kallet feiler eller
// drawnNumbers ikke er tilgjengelig, faller vi tilbake til
// pattern-overlay-fallback (rader basert på `patternWon`).
//
// Brukes av:
//   - PhysicalCashoutSubGameDetailPage.ts (cash-inout/) — bank-ikon i
//     8-kol-tabell.
//   - AgentPhysicalCashoutPage.ts (agent-portal/) — vis-pattern-ikon.

import { t } from "../../i18n/I18n.js";
import { Toast } from "../../components/Toast.js";
import { Modal } from "../../components/Modal.js";
import { ApiError } from "../../api/client.js";
import { escapeHtml } from "../../utils/escapeHtml.js";
import {
  agentCheckBingo,
  agentRewardTicket,
  type AgentCheckBingoResponse,
} from "../../api/agent-bingo.js";
import type {
  PhysicalTicket,
  PhysicalTicketPattern,
} from "../../api/admin-physical-tickets.js";

const GRID_SIZE = 5;
const TICKET_SIZE = GRID_SIZE * GRID_SIZE;

export interface PhysicalCashoutPatternModalOptions {
  /** Den fysiske billetten — må ha `uniqueId`, `numbersJson`, `patternWon`,
   * `wonAmountCents`, `isWinningDistributed`, og helst `assignedGameId`. */
  ticket: PhysicalTicket;
  /** Spillet som billetten ble spilt i. Brukes for accurate matched-cells
   * via `/api/agent/bingo/check`. Hvis null brukes pattern-overlay-fallback. */
  gameId?: string | null;
  /** True hvis billetten allerede er utbetalt. Bestemmer Cashout/Rewarded
   * status-label. Defaults til `ticket.isWinningDistributed`. */
  isRewarded?: boolean;
  /** Hvis dagens dato matcher salgsdag, vis Reward-knapp. Default false
   * (skjuler Reward-knappen). */
  canReward?: boolean;
  /** Callback etter en vellykket reward. Bør reloade kallets liste. */
  onRewarded?: () => void | Promise<void>;
}

/**
 * Åpner per-ticket 5×5-pattern-popup.
 *
 * Modalen rendres synkront med fallback-pattern-overlay; hvis `gameId` er
 * gitt og billetten har `numbersJson`, gjøres et asynkront kall til
 * `/api/agent/bingo/check` for å oppgradere highlighten med eksakte
 * matchedCellIndexes. Brukeren ser progress-state mens vi venter.
 */
export function openPhysicalCashoutPatternModal(
  opts: PhysicalCashoutPatternModalOptions,
): void {
  const ticket = opts.ticket;
  const gameId = opts.gameId ?? ticket.assignedGameId ?? null;
  const isRewarded = opts.isRewarded ?? ticket.isWinningDistributed;
  const canReward = opts.canReward ?? false;

  const numbers = sanitizeNumbers(ticket.numbersJson);
  const patternFallback = patternToCellIndices(ticket.patternWon);
  const initialMatched = patternFallback;
  const canUpgrade = gameId !== null && Array.isArray(ticket.numbersJson);

  const wrap = document.createElement("div");
  wrap.dataset.marker = "physical-cashout-pattern-modal";
  wrap.innerHTML = renderModalContent({
    ticket,
    isRewarded,
    numbers,
    matchedIndexes: Array.from(initialMatched),
    winningPatterns: ticket.patternWon ? [ticket.patternWon] : [],
    upgrading: canUpgrade,
  });

  const buttons: Parameters<typeof Modal.open>[0]["buttons"] = [
    { label: t("close"), variant: "default", action: "close" },
  ];

  // Reward-knapp kun synlig hvis canReward + ikke allerede rewarded.
  if (canReward && !isRewarded && gameId) {
    buttons.unshift({
      label: t("agent_physical_cashout_reward"),
      variant: "success",
      action: "reward",
      onClick: async (instance) => {
        try {
          const res = await agentRewardTicket(ticket.uniqueId, {
            gameId,
            amountCents: ticket.wonAmountCents ?? 0,
          });
          if (res.status === "rewarded") {
            Toast.success(t("agent_physical_cashout_reward_success"));
          } else {
            const key = `reward_status_${res.status}`;
            Toast.warning(t(key));
          }
          instance.close("programmatic");
          if (opts.onRewarded) {
            await opts.onRewarded();
          }
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : t("something_went_wrong");
          Toast.error(msg);
        }
      },
    });
  }

  Modal.open({
    title: t("agent_physical_cashout_pattern_modal_title"),
    content: wrap,
    size: "lg",
    buttons,
  });

  // Asynkron oppgradering: hent eksakte matched-cells fra backend.
  // Hvis dette feiler beholder vi fallback-overlayet — agenten ser fortsatt
  // hvilket pattern som vant, bare ikke hvilke individuelle celler.
  if (canUpgrade && gameId) {
    void upgradeHighlight(wrap, ticket, gameId, numbers, isRewarded);
  }
}

interface RenderInput {
  ticket: PhysicalTicket;
  isRewarded: boolean;
  numbers: number[];
  matchedIndexes: number[];
  winningPatterns: PhysicalTicketPattern[];
  upgrading: boolean;
}

function renderModalContent(input: RenderInput): string {
  const wonCents = input.ticket.wonAmountCents ?? 0;
  const wonNok = formatNOK(wonCents);
  const upgradingNote = input.upgrading
    ? `<div class="text-muted" data-marker="cashout-modal-upgrading" style="font-size:11px;margin-top:4px;">
         <i class="fa fa-spinner fa-spin" aria-hidden="true"></i>
         ${escapeHtml(t("loading_ellipsis"))}
       </div>`
    : "";
  const evaluatedAt = input.ticket.evaluatedAt
    ? `<div><strong>${escapeHtml(t("agent_physical_cashout_evaluated_at"))}:</strong>
        ${escapeHtml(new Date(input.ticket.evaluatedAt).toLocaleString("nb-NO"))}</div>`
    : "";

  return `
    <style>
      .cashout-grid {
        display: grid;
        grid-template-columns: repeat(${GRID_SIZE}, minmax(48px, 64px));
        gap: 4px;
        justify-content: center;
        margin: 12px 0;
      }
      @media (max-width: 480px) {
        .cashout-grid {
          grid-template-columns: repeat(${GRID_SIZE}, minmax(40px, 56px));
        }
      }
      .cashout-cell {
        aspect-ratio: 1 / 1;
        background: #f5f5f5;
        border: 2px solid #ddd;
        border-radius: 4px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: 600;
        color: #333;
      }
      .cashout-cell-matched {
        background: #5cb85c;
        border-color: #449d44;
        color: #fff;
      }
      .cashout-cell-center {
        background: #f0ad4e;
        border-color: #eea236;
        color: #fff;
      }
      .cashout-pattern-list {
        margin-top: 8px;
      }
      .cashout-pattern-list .label {
        margin-right: 6px;
        font-size: 12px;
      }
      .cashout-pattern-table {
        margin-top: 8px;
        margin-bottom: 0;
      }
    </style>
    <div data-marker="cashout-pattern-header">
      <p>
        <strong>${escapeHtml(t("ticket_id"))}:</strong>
        <code>${escapeHtml(input.ticket.uniqueId)}</code><br>
        <strong>${escapeHtml(t("winning_pattern"))}:</strong>
        ${escapeHtml(patternLabel(input.ticket.patternWon))}
        ${renderStatusBadge(input.isRewarded)}<br>
        <strong>${escapeHtml(t("total_winning"))}:</strong> ${wonNok} kr
        ${evaluatedAt}
        ${upgradingNote}
      </p>
    </div>
    <div class="cashout-grid" data-marker="cashout-pattern-grid"
         role="grid" aria-label="${escapeHtml(t("ticket_numbers"))} 5x5">
      ${renderGridCells(input.numbers, input.matchedIndexes)}
    </div>
    <div class="cashout-pattern-list" data-marker="cashout-pattern-statuses">
      <strong>${escapeHtml(t("agent_physical_cashout_pattern_status_header"))}:</strong>
      ${renderPatternStatuses(input.ticket, input.isRewarded, input.winningPatterns)}
    </div>`;
}

function renderGridCells(numbers: number[], matchedIndexes: number[]): string {
  const matchedSet = new Set(matchedIndexes);
  const cells: string[] = [];
  for (let i = 0; i < TICKET_SIZE; i += 1) {
    const isCenter = i === 12;
    const isMatched = matchedSet.has(i);
    const classes = ["cashout-cell"];
    if (isMatched) classes.push("cashout-cell-matched");
    if (isCenter) classes.push("cashout-cell-center");
    const value = numbers[i] ?? 0;
    const display = isCenter ? "★" : value > 0 ? String(value) : "—";
    cells.push(`<div class="${classes.join(" ")}" role="gridcell" data-cell-idx="${i}">${escapeHtml(display)}</div>`);
  }
  return cells.join("");
}

function renderPatternStatuses(
  ticket: PhysicalTicket,
  isRewarded: boolean,
  winningPatterns: PhysicalTicketPattern[],
): string {
  const allPatterns: PhysicalTicketPattern[] = ["row_1", "row_2", "row_3", "row_4", "full_house"];
  const wonSet = new Set(winningPatterns);
  if (ticket.patternWon) wonSet.add(ticket.patternWon);

  const wonCents = ticket.wonAmountCents ?? 0;
  return allPatterns.map((p) => {
    const isWinner = wonSet.has(p);
    if (isWinner) {
      // Vis kr-beløp kun for det høyeste mønsteret som faktisk er stemplet
      // (det er det wonAmountCents refererer til). Andre mønstre er bare
      // markert som "vinner" uten beløp.
      const isPrimary = ticket.patternWon === p;
      const amount = isPrimary && wonCents > 0 ? `<strong>${formatNOK(wonCents)} kr</strong>` : "";
      const status = isRewarded
        ? t("agent_physical_cashout_status_rewarded")
        : t("agent_physical_cashout_status_cashout");
      const labelClass = isRewarded ? "label-success" : "label-warning";
      return `<div data-pattern="${p}" data-marker="cashout-pattern-row">
        ${escapeHtml(patternLabel(p))}: ${amount}
        <span class="label ${labelClass}">${escapeHtml(status)}</span>
      </div>`;
    }
    return `<div class="text-muted" data-pattern="${p}" data-marker="cashout-pattern-row" style="opacity:0.6">
      ${escapeHtml(patternLabel(p))}: —
    </div>`;
  }).join("");
}

function renderStatusBadge(isRewarded: boolean): string {
  if (isRewarded) {
    return `<span class="label label-success">${escapeHtml(t("agent_physical_cashout_status_rewarded"))}</span>`;
  }
  return `<span class="label label-warning">${escapeHtml(t("agent_physical_cashout_status_cashout"))}</span>`;
}

async function upgradeHighlight(
  wrap: HTMLElement,
  ticket: PhysicalTicket,
  gameId: string,
  numbers: number[],
  isRewarded: boolean,
): Promise<void> {
  try {
    const res: AgentCheckBingoResponse = await agentCheckBingo({
      uniqueId: ticket.uniqueId,
      gameId,
      numbers,
    });
    // Re-render content med eksakte matched cells + fullt sett av winning
    // patterns (slik at en billett som dekker både Row 1 og Row 2 lyser opp
    // begge i pattern-listen).
    wrap.innerHTML = renderModalContent({
      ticket,
      isRewarded,
      numbers,
      matchedIndexes: res.matchedCellIndexes,
      winningPatterns: res.winningPatterns,
      upgrading: false,
    });
  } catch (err) {
    // Fallback: behold pattern-overlay men fjern "loading"-indikatoren.
    const upgradingNote = wrap.querySelector<HTMLElement>("[data-marker='cashout-modal-upgrading']");
    if (upgradingNote) upgradingNote.remove();
    if (err instanceof ApiError) {
      // Vis ApiError diskret (f.eks. NUMBERS_MISMATCH ved feil-stemplet
      // billett). Vi vil ikke skjule popup for det — fallback-pattern er
      // fortsatt brukbar.
      const banner = document.createElement("div");
      banner.className = "alert alert-warning";
      banner.style.marginTop = "8px";
      banner.style.fontSize = "12px";
      banner.dataset.marker = "cashout-modal-upgrade-error";
      banner.textContent = err.message;
      const header = wrap.querySelector<HTMLElement>("[data-marker='cashout-pattern-header']");
      if (header) header.append(banner);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatNOK(cents: number): string {
  if (!Number.isFinite(cents)) return "0.00";
  return (cents / 100).toFixed(2);
}

function patternLabel(p: PhysicalTicketPattern | null): string {
  if (!p) return "—";
  switch (p) {
    case "row_1": return t("pattern_label_row_1");
    case "row_2": return t("pattern_label_row_2");
    case "row_3": return t("pattern_label_row_3");
    case "row_4": return t("pattern_label_row_4");
    case "full_house": return t("pattern_label_full_house");
    default: return p;
  }
}

/** Map et winning-pattern til de 5 cell-indices det dekker (0..24). For
 * full_house brukes alle 25. Brukes som fallback når vi ikke har
 * drawnNumbers tilgjengelig fra backend. */
function patternToCellIndices(p: PhysicalTicketPattern | null): Set<number> {
  const s = new Set<number>();
  if (!p) return s;
  if (p === "row_1") {
    for (let i = 0; i < 5; i += 1) s.add(i);
  } else if (p === "row_2") {
    for (let i = 5; i < 10; i += 1) s.add(i);
  } else if (p === "row_3") {
    for (let i = 10; i < 15; i += 1) s.add(i);
  } else if (p === "row_4") {
    for (let i = 15; i < 20; i += 1) s.add(i);
  } else if (p === "full_house") {
    for (let i = 0; i < 25; i += 1) s.add(i);
  }
  return s;
}

function sanitizeNumbers(raw: number[] | null | undefined): number[] {
  if (!Array.isArray(raw)) return new Array(TICKET_SIZE).fill(0) as number[];
  const out: number[] = [];
  for (let i = 0; i < TICKET_SIZE; i += 1) {
    const v = raw[i];
    out.push(typeof v === "number" && Number.isFinite(v) ? v : 0);
  }
  return out;
}
