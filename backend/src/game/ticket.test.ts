import assert from "node:assert/strict";
import test from "node:test";
import { generateCandy60Ticket, makeShuffledBallBag, ticketContainsNumber } from "./ticket.js";

test("generateCandy60Ticket returns 15 unique numbers within the Theme1 column ranges", () => {
  const ticket = generateCandy60Ticket();
  const numbers = ticket.numbers ?? [];

  assert.equal(numbers.length, 15);
  assert.equal(new Set(numbers).size, 15);
  assert.equal(ticket.grid.length, 3);
  assert.equal(ticket.grid[0]?.length, 5);

  const ranges = [
    [1, 12],
    [13, 24],
    [25, 36],
    [37, 48],
    [49, 60]
  ] as const;

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const value = ticket.grid[row][col];
      const [min, max] = ranges[col];
      assert.ok(value >= min && value <= max, `grid[${row}][${col}] expected ${min}-${max}, got ${value}`);
      assert.ok(ticketContainsNumber(ticket, value));
    }
  }
});

test("makeShuffledBallBag respects a 60-ball cap", () => {
  const drawBag = makeShuffledBallBag(60);
  assert.equal(drawBag.length, 60);
  assert.equal(new Set(drawBag).size, 60);
  assert.equal(Math.min(...drawBag), 1);
  assert.equal(Math.max(...drawBag), 60);
});
