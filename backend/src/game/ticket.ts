import { randomInt } from "node:crypto";
import type { Ticket } from "./types.js";

const TRADITIONAL_BOARD_SIZE = 5;
const CANDY_ROWS = 3;
const CANDY_COLUMNS = 5;
const CANDY_COLUMN_RANGES: Array<readonly [number, number]> = [
  [1, 12],
  [13, 24],
  [25, 36],
  [37, 48],
  [49, 60]
];

function shuffle<T>(values: T[]): T[] {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickUniqueInRange(start: number, end: number, count: number): number[] {
  const values = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  return shuffle(values).slice(0, count).sort((a, b) => a - b);
}

export function makeRoomCode(existingCodes: Set<string>): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  while (true) {
    const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
    if (!existingCodes.has(code)) {
      return code;
    }
  }
}

export function makeShuffledBallBag(maxNumber = 75): number[] {
  return shuffle(Array.from({ length: maxNumber }, (_, i) => i + 1));
}

export function generateTraditional75Ticket(): Ticket {
  const columns = [
    pickUniqueInRange(1, 15, TRADITIONAL_BOARD_SIZE),
    pickUniqueInRange(16, 30, TRADITIONAL_BOARD_SIZE),
    pickUniqueInRange(31, 45, TRADITIONAL_BOARD_SIZE - 1),
    pickUniqueInRange(46, 60, TRADITIONAL_BOARD_SIZE),
    pickUniqueInRange(61, 75, TRADITIONAL_BOARD_SIZE)
  ];

  const grid: number[][] = [];
  for (let row = 0; row < TRADITIONAL_BOARD_SIZE; row += 1) {
    const rowValues: number[] = [];
    for (let col = 0; col < TRADITIONAL_BOARD_SIZE; col += 1) {
      if (row === 2 && col === 2) {
        rowValues.push(0);
      } else if (col === 2 && row > 2) {
        rowValues.push(columns[col][row - 1]);
      } else {
        rowValues.push(columns[col][row]);
      }
    }
    grid.push(rowValues);
  }

  return {
    numbers: flattenTicketNumbers(grid),
    grid
  };
}

export function generateCandy60Ticket(): Ticket {
  const columns = CANDY_COLUMN_RANGES.map(([start, end]) => pickUniqueInRange(start, end, CANDY_ROWS));
  const grid: number[][] = [];
  const numbers: number[] = [];

  for (let row = 0; row < CANDY_ROWS; row += 1) {
    const rowValues: number[] = [];
    for (let col = 0; col < CANDY_COLUMNS; col += 1) {
      const number = columns[col][row];
      rowValues.push(number);
      numbers.push(number);
    }
    grid.push(rowValues);
  }

  return {
    numbers,
    grid
  };
}

export function flattenTicketNumbers(grid: number[][]): number[] {
  const values: number[] = [];
  for (const row of grid) {
    if (!Array.isArray(row)) {
      continue;
    }
    for (const number of row) {
      if (Number.isFinite(number) && number > 0) {
        values.push(number);
      }
    }
  }
  return values;
}

export function getTicketNumbers(ticket: Ticket): number[] {
  if (Array.isArray(ticket?.numbers) && ticket.numbers.length > 0) {
    return ticket.numbers.filter((value) => Number.isFinite(value) && value > 0);
  }

  return flattenTicketNumbers(ticket?.grid ?? []);
}

export function ticketContainsNumber(ticket: Ticket, number: number): boolean {
  return getTicketNumbers(ticket).includes(number);
}

function isMarked(ticket: Ticket, marks: Set<number>, row: number, col: number): boolean {
  const cell = ticket.grid[row]?.[col];
  if (cell === undefined) {
    return false;
  }
  if (cell === 0) {
    return true;
  }
  return marks.has(cell);
}

export function findFirstCompleteLinePatternIndex(ticket: Ticket, marks: Set<number>): number {
  const rows = ticket.grid.length;
  const cols = ticket.grid[0]?.length ?? 0;
  for (let row = 0; row < rows; row += 1) {
    const complete = Array.from({ length: cols }, (_, col) => isMarked(ticket, marks, row, col)).every(Boolean);
    if (complete) {
      return row;
    }
  }

  for (let col = 0; col < cols; col += 1) {
    const complete = Array.from({ length: rows }, (_, row) => isMarked(ticket, marks, row, col)).every(Boolean);
    if (complete) {
      return rows + col;
    }
  }

  const diagonalLength = Math.min(rows, cols);
  const leftDiagonal = Array.from({ length: diagonalLength }, (_, i) => isMarked(ticket, marks, i, i)).every(Boolean);
  if (leftDiagonal) {
    return rows + cols;
  }

  const rightDiagonal = Array.from({ length: diagonalLength }, (_, i) => isMarked(ticket, marks, i, cols - 1 - i)).every(Boolean);
  if (rightDiagonal) {
    return rows + cols + 1;
  }

  return -1;
}

export function hasAnyCompleteLine(ticket: Ticket, marks: Set<number>): boolean {
  return findFirstCompleteLinePatternIndex(ticket, marks) >= 0;
}

export function countNearMissLinePattern(ticket: Ticket, marks: Set<number>): number {
  let nearMissCount = 0;
  const rows = ticket.grid.length;
  const cols = ticket.grid[0]?.length ?? 0;

  const countMissingInPattern = (cells: Array<{ row: number; col: number }>): number => {
    let missing = 0;
    for (const cell of cells) {
      if (!isMarked(ticket, marks, cell.row, cell.col)) {
        missing += 1;
      }
    }
    return missing;
  };

  for (let row = 0; row < rows; row += 1) {
    const missing = countMissingInPattern(
      Array.from({ length: cols }, (_, col) => ({ row, col }))
    );
    if (missing === 1) {
      nearMissCount += 1;
    }
  }

  for (let col = 0; col < cols; col += 1) {
    const missing = countMissingInPattern(
      Array.from({ length: rows }, (_, row) => ({ row, col }))
    );
    if (missing === 1) {
      nearMissCount += 1;
    }
  }

  const diagonalLength = Math.min(rows, cols);
  const leftDiagonalMissing = countMissingInPattern(
    Array.from({ length: diagonalLength }, (_, i) => ({ row: i, col: i }))
  );
  if (leftDiagonalMissing === 1) {
    nearMissCount += 1;
  }

  const rightDiagonalMissing = countMissingInPattern(
    Array.from({ length: diagonalLength }, (_, i) => ({ row: i, col: cols - 1 - i }))
  );
  if (rightDiagonalMissing === 1) {
    nearMissCount += 1;
  }

  return nearMissCount;
}

export function hasFullBingo(ticket: Ticket, marks: Set<number>): boolean {
  for (let row = 0; row < ticket.grid.length; row += 1) {
    for (let col = 0; col < ticket.grid[row].length; col += 1) {
      if (!isMarked(ticket, marks, row, col)) {
        return false;
      }
    }
  }
  return true;
}
