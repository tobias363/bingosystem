/**
 * §6.1 — perpetual room:update-payload-stripping (Wave 3b, 2026-05-06).
 *
 * `room:update` for Spill 2/3 (perpetual rooms, ETT globalt rom, opp til
 * 1500 spillere) sender en strippet payload pr. socket istedenfor full
 * broadcast. Dette tester:
 *
 *   1. `isPerpetualGameSlug` — slug-detection for rocket/monsterbingo + alias.
 *   2. `stripPerpetualPayloadForRecipient` — gjør recipient-specific filtering:
 *        - players[] kun mottakeren (eller [] for observer)
 *        - currentGame.tickets kun mottakerens
 *        - currentGame.marks kun mottakerens
 *        - preRoundTickets/luckyNumbers/playerStakes/playerPendingStakes
 *          plukket til mottakeren
 *        - playerCount ALLTID populated fra source (det er det klient leser)
 *   3. Source-payload-en muteres IKKE — viktig fordi vi strippe per-socket
 *      og må holde sources stabile mellom emits.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { RoomUpdatePayload } from "./roomHelpers.js";
import {
  isPerpetualGameSlug,
  stripPerpetualPayloadForRecipient,
} from "./roomHelpers.js";

// ── Slug-detection ──────────────────────────────────────────────────────────

test("isPerpetualGameSlug returnerer true for Spill 2 slugs", () => {
  assert.equal(isPerpetualGameSlug("rocket"), true);
  assert.equal(isPerpetualGameSlug("game_2"), true);
  assert.equal(isPerpetualGameSlug("tallspill"), true);
});

test("isPerpetualGameSlug returnerer true for Spill 3 slugs", () => {
  assert.equal(isPerpetualGameSlug("monsterbingo"), true);
  assert.equal(isPerpetualGameSlug("mønsterbingo"), true);
  assert.equal(isPerpetualGameSlug("game_3"), true);
});

test("isPerpetualGameSlug er case-insensitiv", () => {
  assert.equal(isPerpetualGameSlug("Rocket"), true);
  assert.equal(isPerpetualGameSlug("ROCKET"), true);
  assert.equal(isPerpetualGameSlug("MonsterBingo"), true);
});

test("isPerpetualGameSlug håndterer whitespace", () => {
  assert.equal(isPerpetualGameSlug("  rocket  "), true);
});

test("isPerpetualGameSlug returnerer false for ikke-perpetual slugs", () => {
  assert.equal(isPerpetualGameSlug("bingo"), false);
  assert.equal(isPerpetualGameSlug("spillorama"), false);
  assert.equal(isPerpetualGameSlug("themebingo"), false);
});

test("isPerpetualGameSlug returnerer false for null/undefined/tom", () => {
  assert.equal(isPerpetualGameSlug(null), false);
  assert.equal(isPerpetualGameSlug(undefined), false);
  assert.equal(isPerpetualGameSlug(""), false);
});

// ── Payload-stripping ───────────────────────────────────────────────────────

function buildFullPayload(playerCount: number): RoomUpdatePayload {
  // Bygg en "ekte" payload med 3 spillere — A, B, C — og per-spiller-state
  // i alle de tre store record-feltene. Vi skal verifisere at recipient-A
  // bare ser sin egen state.
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player${i + 1}`,
    walletId: `w${i + 1}`,
    balance: 100 + i,
    socketId: `sock${i + 1}`,
  }));

  return {
    code: "ROCKET",
    hallId: "hall-1",
    hostPlayerId: "p1",
    gameSlug: "rocket",
    createdAt: new Date("2026-05-06T10:00:00Z").toISOString(),
    players,
    currentGame: {
      id: "game-1",
      status: "RUNNING",
      entryFee: 10,
      ticketsPerPlayer: 1,
      prizePool: 1000,
      remainingPrizePool: 1000,
      payoutPercent: 80,
      maxPayoutBudget: 800,
      remainingPayoutBudget: 800,
      drawBag: [4, 5, 6],
      drawnNumbers: [1, 2, 3],
      remainingNumbers: 3,
      claims: [],
      tickets: Object.fromEntries(
        players.map((p) => [
          p.id,
          [{ grid: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }],
        ]),
      ),
      marks: Object.fromEntries(
        players.map((p, i) => [p.id, [[i + 1, i + 2]]]),
      ),
      startedAt: new Date("2026-05-06T10:01:00Z").toISOString(),
    },
    gameHistory: [],
    scheduler: {},
    preRoundTickets: Object.fromEntries(
      players.map((p) => [p.id, [{ grid: [[1]] }]]),
    ),
    armedPlayerIds: players.map((p) => p.id),
    luckyNumbers: Object.fromEntries(players.map((p, i) => [p.id, i + 1])),
    serverTimestamp: 1_700_000_000_000,
    playerStakes: Object.fromEntries(players.map((p) => [p.id, 10])),
    playerPendingStakes: Object.fromEntries(players.map((p) => [p.id, 5])),
  };
}

test("stripPerpetualPayloadForRecipient — playerCount alltid populated fra source", () => {
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, "p1");
  assert.equal(stripped.playerCount, 3);
});

test("stripPerpetualPayloadForRecipient — player-A ser KUN egen player-rad", () => {
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, "p1");
  assert.equal(stripped.players.length, 1);
  assert.equal(stripped.players[0].id, "p1");
});

test("stripPerpetualPayloadForRecipient — player-A ser KUN egne tickets/marks", () => {
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, "p1");
  assert.ok(stripped.currentGame, "currentGame skal fortsatt være satt");
  assert.deepEqual(Object.keys(stripped.currentGame.tickets), ["p1"]);
  assert.deepEqual(Object.keys(stripped.currentGame.marks), ["p1"]);
});

test("stripPerpetualPayloadForRecipient — player-A ser KUN egne preRoundTickets/luckyNumbers/playerStakes", () => {
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, "p2");
  assert.deepEqual(Object.keys(stripped.preRoundTickets), ["p2"]);
  assert.deepEqual(Object.keys(stripped.luckyNumbers), ["p2"]);
  assert.deepEqual(Object.keys(stripped.playerStakes), ["p2"]);
  if (stripped.playerPendingStakes) {
    assert.deepEqual(Object.keys(stripped.playerPendingStakes), ["p2"]);
  }
});

test("stripPerpetualPayloadForRecipient — recipientPlayerId=null gir tomme records (observer)", () => {
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, null);
  assert.equal(stripped.players.length, 0);
  assert.equal(stripped.playerCount, 3);
  assert.deepEqual(stripped.currentGame!.tickets, {});
  assert.deepEqual(stripped.currentGame!.marks, {});
  assert.deepEqual(stripped.preRoundTickets, {});
  assert.deepEqual(stripped.luckyNumbers, {});
  assert.deepEqual(stripped.playerStakes, {});
});

test("stripPerpetualPayloadForRecipient — ukjent recipientPlayerId gir tomme records", () => {
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, "p99-unknown");
  assert.equal(stripped.players.length, 0); // ukjent ID → ingen me
  assert.equal(stripped.playerCount, 3);
  assert.deepEqual(Object.keys(stripped.currentGame!.tickets), []);
});

test("stripPerpetualPayloadForRecipient — globale felter beholdes uendret", () => {
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, "p1");
  assert.deepEqual(stripped.currentGame!.drawnNumbers, [1, 2, 3]);
  assert.equal(stripped.currentGame!.prizePool, 1000);
  assert.equal(stripped.currentGame!.entryFee, 10);
  assert.equal(stripped.code, "ROCKET");
  assert.equal(stripped.hallId, "hall-1");
  assert.equal(stripped.serverTimestamp, 1_700_000_000_000);
});

test("stripPerpetualPayloadForRecipient — armedPlayerIds beholder kun mottakerens ID hvis armed", () => {
  // Klient bruker KUN `armedPlayerIds.includes(myPlayerId)` — så vi kan
  // redusere til kun mottakerens egen ID. Sparer N×ID-bytes pr. emit
  // (ID-er = ca 70% av strippet payload på 1500-spillere-skala).
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, "p1");
  // p1 er armed i full-payload buildFullPayload (alle players er armed)
  assert.deepEqual(stripped.armedPlayerIds, ["p1"]);
});

test("stripPerpetualPayloadForRecipient — armedPlayerIds er tom hvis recipient ikke er armed", () => {
  const payload = buildFullPayload(3);
  // Fjern p1 fra armed-listen → mottakeren er IKKE armed
  payload.armedPlayerIds = ["p2", "p3"];
  const stripped = stripPerpetualPayloadForRecipient(payload, "p1");
  assert.deepEqual(stripped.armedPlayerIds, []);
});

test("stripPerpetualPayloadForRecipient — armedPlayerIds er tom for observer (recipientId=null)", () => {
  const payload = buildFullPayload(3);
  const stripped = stripPerpetualPayloadForRecipient(payload, null);
  assert.deepEqual(stripped.armedPlayerIds, []);
});

test("stripPerpetualPayloadForRecipient — source-payload muteres IKKE", () => {
  const payload = buildFullPayload(3);
  const sourcePlayersBefore = [...payload.players];
  const sourceTicketsBefore = { ...payload.currentGame!.tickets };
  const sourceMarksBefore = { ...payload.currentGame!.marks };

  stripPerpetualPayloadForRecipient(payload, "p1");

  assert.deepEqual(payload.players, sourcePlayersBefore);
  assert.deepEqual(payload.currentGame!.tickets, sourceTicketsBefore);
  assert.deepEqual(payload.currentGame!.marks, sourceMarksBefore);
});

test("stripPerpetualPayloadForRecipient — payload uten currentGame håndteres OK", () => {
  const payload = buildFullPayload(3);
  payload.currentGame = undefined;
  const stripped = stripPerpetualPayloadForRecipient(payload, "p1");
  assert.equal(stripped.currentGame, undefined);
  assert.equal(stripped.players.length, 1); // me beholdes
});

// ── Payload-størrelse-validering (audit §6.1 prognose) ──────────────────────

test("stripPerpetualPayloadForRecipient — 1500-spillere gir < 5 KB pr. emit", () => {
  const payload = buildFullPayload(1500);
  const stripped = stripPerpetualPayloadForRecipient(payload, "p1");
  const wireBytes = JSON.stringify(stripped).length;
  // Audit §17 Patch E.1 prognose: ~5 KB/spiller. Etter armedPlayerIds-strip
  // (Wave 3b) ligger vi rundt 800 bytes — 6× under budsjettet. Hvis denne
  // assertion-en feiler skal vi se på hvilken global-felter som har vokst.
  assert.ok(
    wireBytes < 5_000,
    `wireBytes=${wireBytes} skal være < 5 KB (audit §6.1 prognose)`,
  );
});

test("stripPerpetualPayloadForRecipient — full payload 1500 spillere er > 100 KB (baseline)", () => {
  // Sanity-check: bekrefter at FULL payload-en er stor nok til at strip-en
  // gir reell besparelse. Hvis denne assertion-en feiler er testdata for
  // små og strippe-effekten kan ikke valideres meningsfullt.
  const payload = buildFullPayload(1500);
  const fullBytes = JSON.stringify(payload).length;
  assert.ok(
    fullBytes > 100_000,
    `fullBytes=${fullBytes} skal være > 100 KB (sanity-baseline)`,
  );
});
