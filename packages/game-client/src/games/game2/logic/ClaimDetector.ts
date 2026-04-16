import type { Ticket } from "@spillorama/shared-types/game";

/**
 * Client-side pattern detection mirroring backend/src/game/ticket.ts.
 * Used to show claim buttons immediately when a pattern is achieved,
 * without waiting for server round-trip. Server always does authoritative validation.
 */

function isMarked(grid: number[][], marks: Set<number>, row: number, col: number): boolean {
  const cell = grid[row]?.[col];
  if (cell === undefined) return false;
  if (cell === 0) return true; // Free space
  return marks.has(cell);
}

/** Check if any complete row (all cols) or column (all rows) is fully marked. */
export function hasAnyCompleteLine(grid: number[][], marks: Set<number>): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  // Check rows
  for (let row = 0; row < rows; row++) {
    let complete = true;
    for (let col = 0; col < cols; col++) {
      if (!isMarked(grid, marks, row, col)) { complete = false; break; }
    }
    if (complete) return true;
  }

  // Check columns
  for (let col = 0; col < cols; col++) {
    let complete = true;
    for (let row = 0; row < rows; row++) {
      if (!isMarked(grid, marks, row, col)) { complete = false; break; }
    }
    if (complete) return true;
  }

  return false;
}

/** Check if all cells in the grid are marked. */
export function hasFullBingo(grid: number[][], marks: Set<number>): boolean {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (!isMarked(grid, marks, row, col)) return false;
    }
  }
  return true;
}

/** Check all tickets for claim eligibility. */
export function checkClaims(
  tickets: Ticket[],
  ticketMarks: number[][],
  drawnNumbers: number[],
): { canClaimLine: boolean; canClaimBingo: boolean } {
  const drawnSet = new Set(drawnNumbers);

  let canClaimLine = false;
  let canClaimBingo = false;

  for (let i = 0; i < tickets.length; i++) {
    // Merge ticket-specific marks with drawn numbers
    const marks = new Set(drawnSet);
    const ticketMarkSet = ticketMarks[i];
    if (ticketMarkSet) {
      for (const n of ticketMarkSet) marks.add(n);
    }

    if (!canClaimLine && hasAnyCompleteLine(tickets[i].grid, marks)) {
      canClaimLine = true;
    }
    if (!canClaimBingo && hasFullBingo(tickets[i].grid, marks)) {
      canClaimBingo = true;
    }

    if (canClaimLine && canClaimBingo) break;
  }

  return { canClaimLine, canClaimBingo };
}
