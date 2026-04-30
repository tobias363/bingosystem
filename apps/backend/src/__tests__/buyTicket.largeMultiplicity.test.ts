/**
 * REGRESSION 2026-04-30 Bug B — Large ticket multiplicity (3 brett per kjøp).
 *
 * Tobias rapporterte 2026-04-30 at Demo Hall buy-popup viser
 * "Large Yellow · 30 kr · 3 brett" men når brukeren kjøper får de bare 1 bong
 * (ikke 3). Total-pris er korrekt (30 kr).
 *
 * Forventet oppførsel (legacy paritet):
 *   - Small Yellow / White / etc.: priceMultiplier=1, ticketCount=1 → 1 bong per kjøp à 10 kr
 *   - Large Yellow / White: priceMultiplier=3, ticketCount=3 → **3 brett** per kjøp à 30 kr totalt
 *
 * Dvs. kjøp av Large Yellow med qty=1 skal generere 3 fysiske brett til
 * spilleren, alle med color="Large Yellow"/type="large", og total kostnad
 * skal være `entryFee × priceMultiplier = 10 × 3 = 30 kr`.
 *
 * Coverage:
 *   1) BingoEngine.startGame med armedPlayerSelections: [{type:"large",
 *      name:"Large Yellow", qty:1}] → genererer 3 tickets
 *   2) Wallet debit total = entryFee × priceMultiplier = 30 kr
 *   3) Alle 3 tickets har color="Large Yellow", type="large"
 *   4) armedPlayerTicketCounts = 3 (vekt-basert) reflekterer total brett
 *   5) Kombinasjon Large Yellow (3) + Small Yellow (1 brett) = 4 brett totalt
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine } from "../game/BingoEngine.js";
import { InMemoryWalletAdapter } from "../game/BingoEngine.test.js";
import { DEFAULT_NORSK_BINGO_CONFIG } from "../game/variantConfig.js";
import type {
  BingoSystemAdapter,
  CreateTicketInput,
} from "../adapters/BingoSystemAdapter.js";
import type { Ticket } from "../game/types.js";

class StubAdapter implements BingoSystemAdapter {
  async createTicket(input: CreateTicketInput): Promise<Ticket> {
    return {
      grid: [
        [1, 16, 31, 46, 61],
        [2, 17, 32, 47, 62],
        [3, 18, 0, 48, 63],
        [4, 19, 33, 49, 64],
        [5, 20, 34, 50, 65],
      ],
      // Engine sender color/type fra ticketTypes-config (variantConfig). Adapter
      // forventes å videreformidle disse til den returnerte ticketen.
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
    };
  }
}

test("Bug B 2026-04-30 — Large Yellow med qty=1 genererer 3 brett (multiplicity)", async () => {
  const wallet = new InMemoryWalletAdapter();
  const engine = new BingoEngine(new StubAdapter(), wallet, {
    minDrawIntervalMs: 0,
    minPlayersToStart: 1,
  });
  const { roomCode, playerId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "Alice",
    walletId: "w-alice",
    gameSlug: "bingo",
  });

  // Wallet auto-creates med 1000 kr default i ensureAccount.
  await wallet.ensureAccount("w-alice");
  const aliceWalletBefore = await wallet.getBalance("w-alice");

  await engine.startGame({
    roomCode,
    actorPlayerId: playerId!,
    entryFee: 10,
    ticketsPerPlayer: 30,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
    // Large Yellow qty=1 → 3 brett per ticketCount=3 i variantConfig
    armedPlayerIds: [playerId!],
    armedPlayerTicketCounts: { [playerId!]: 3 }, // vekt = qty × ticketCount = 1 × 3
    armedPlayerSelections: {
      [playerId!]: [{ type: "large", name: "Large Yellow", qty: 1 }],
    },
  });

  // KEY ASSERTION 1: Engine genererte 3 tickets
  const snapshot = engine.getRoomSnapshot(roomCode);
  const aliceTickets = snapshot.currentGame?.tickets[playerId!] ?? [];
  assert.equal(
    aliceTickets.length,
    3,
    `Large Yellow qty=1 må generere 3 brett (ticketCount=3). Faktisk: ${aliceTickets.length}`,
  );

  // KEY ASSERTION 2: Alle 3 har color="Large Yellow", type="large"
  for (const ticket of aliceTickets) {
    assert.equal(
      ticket.color,
      "Large Yellow",
      `Hver ticket skal ha color="Large Yellow". Faktisk: ${ticket.color}`,
    );
    assert.equal(
      ticket.type,
      "large",
      `Hver ticket skal ha type="large". Faktisk: ${ticket.type}`,
    );
  }

  // KEY ASSERTION 3: Wallet debited entryFee × priceMultiplier = 30 kr (ikke 10)
  const aliceWalletAfter = await wallet.getBalance("w-alice");
  const debited = aliceWalletBefore - aliceWalletAfter;
  assert.equal(
    debited,
    30,
    `Wallet skal debiteres entryFee(10) × priceMultiplier(3) = 30 kr. Faktisk: ${debited} kr`,
  );
});

test("Bug B 2026-04-30 — Mixed: 1 Small Yellow + 1 Large White = 4 brett (1+3)", async () => {
  const wallet = new InMemoryWalletAdapter();
  const engine = new BingoEngine(new StubAdapter(), wallet, {
    minDrawIntervalMs: 0,
    minPlayersToStart: 1,
  });
  const { roomCode, playerId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "Bob",
    walletId: "w-bob",
    gameSlug: "bingo",
  });

  await wallet.ensureAccount("w-bob");
  const bobWalletBefore = await wallet.getBalance("w-bob");

  await engine.startGame({
    roomCode,
    actorPlayerId: playerId!,
    entryFee: 10,
    ticketsPerPlayer: 30,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
    armedPlayerIds: [playerId!],
    armedPlayerTicketCounts: { [playerId!]: 4 }, // 1 Small + 3 Large = 4 brett
    armedPlayerSelections: {
      [playerId!]: [
        { type: "small", name: "Small Yellow", qty: 1 },
        { type: "large", name: "Large White", qty: 1 },
      ],
    },
  });

  const snapshot = engine.getRoomSnapshot(roomCode);
  const bobTickets = snapshot.currentGame?.tickets[playerId!] ?? [];
  assert.equal(
    bobTickets.length,
    4,
    `1 Small + 1 Large skal gi 4 brett (1 + 3). Faktisk: ${bobTickets.length}`,
  );

  const smallCount = bobTickets.filter((t) => t.color === "Small Yellow").length;
  const largeCount = bobTickets.filter((t) => t.color === "Large White").length;
  assert.equal(smallCount, 1, "skal være 1 Small Yellow");
  assert.equal(largeCount, 3, "skal være 3 Large White");

  // Wallet debit: 1×10 + 3×10 = 40 kr (Small priceMult=1, Large priceMult=3)
  const bobWalletAfter = await wallet.getBalance("w-bob");
  const debited = bobWalletBefore - bobWalletAfter;
  assert.equal(
    debited,
    40,
    `Wallet skal debiteres 1×10 + 3×10 = 40 kr. Faktisk: ${debited} kr`,
  );
});

test("Bug B 2026-04-30 — KRITISK: ticketsPerPlayer=1 (lav default) klipper Large Yellow til 1 brett — bug-røtter", async () => {
  // Tobias' rapport: Demo Hall buy-popup viser '3 brett' for Large Yellow,
  // men kun 1 bong genereres etter kjøp. Dette skjer hvis hall-config
  // setter `maxTicketsPerPlayer: 1` (eller runtimeBingoSettings.autoRoundTicketsPerPlayer
  // fra env defaultes lavt). Da klipper engine playerTicketCount via:
  //   `Math.min(armedCount=3, ticketsPerPlayer=1) = 1`
  // → kun 1 ticket opprettes selv om wallet ble debitert for 30 kr.
  //
  // Forventet oppførsel: hvis spilleren KJØPTE Large Yellow (3 brett),
  // skal de FÅ 3 brett. ticketsPerPlayer-grensen burde gjelde antall
  // SELECTION-units (hvor 1 Large = 1 unit), ikke vekt-basert ticket count.
  const wallet = new InMemoryWalletAdapter();
  const engine = new BingoEngine(new StubAdapter(), wallet, {
    minDrawIntervalMs: 0,
    minPlayersToStart: 1,
  });
  const { roomCode, playerId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "Dave",
    walletId: "w-dave",
    gameSlug: "bingo",
  });

  await wallet.ensureAccount("w-dave");

  await engine.startGame({
    roomCode,
    actorPlayerId: playerId!,
    entryFee: 10,
    ticketsPerPlayer: 1, // KRITISK: lav grense klipper Large Yellow til 1 brett
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
    armedPlayerIds: [playerId!],
    armedPlayerTicketCounts: { [playerId!]: 3 }, // 1 Large Yellow × 3 brett
    armedPlayerSelections: {
      [playerId!]: [{ type: "large", name: "Large Yellow", qty: 1 }],
    },
  });

  const snapshot = engine.getRoomSnapshot(roomCode);
  const daveTickets = snapshot.currentGame?.tickets[playerId!] ?? [];
  // Hvis denne assertionen feiler med "Faktisk: 1", har vi BEKREFTET bug-en.
  // Engine SKAL respektere armedPlayerSelections (og deres ticketCount-multiplikasjon)
  // selv når ticketsPerPlayer er lav — eller alternativt: ticketsPerPlayer bør
  // referere til SELECTION-units, ikke vekt-basert brett-count.
  assert.equal(
    daveTickets.length,
    3,
    `Bug B: ticketsPerPlayer=1 klipper Large Yellow til 1 brett selv om spilleren betalte for 3. ` +
      `Faktisk: ${daveTickets.length} brett. Forventet: 3. ` +
      `Fix: BingoEngine.startGame skal IKKE clamp armed-counts via ticketsPerPlayer ` +
      `for selection-baserte buys, eller ticketsPerPlayer skal anvendes på SELECTION-units (qty), ikke brett.`,
  );
});

test("Bug B 2026-04-30 — Large Yellow qty=2 genererer 6 brett (2 bundles × 3 each)", async () => {
  const wallet = new InMemoryWalletAdapter();
  const engine = new BingoEngine(new StubAdapter(), wallet, {
    minDrawIntervalMs: 0,
    minPlayersToStart: 1,
  });
  const { roomCode, playerId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "Carol",
    walletId: "w-carol",
    gameSlug: "bingo",
  });

  await wallet.ensureAccount("w-carol");
  const carolWalletBefore = await wallet.getBalance("w-carol");

  await engine.startGame({
    roomCode,
    actorPlayerId: playerId!,
    entryFee: 10,
    ticketsPerPlayer: 30,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
    armedPlayerIds: [playerId!],
    armedPlayerTicketCounts: { [playerId!]: 6 }, // 2 × 3 = 6 brett
    armedPlayerSelections: {
      [playerId!]: [{ type: "large", name: "Large Yellow", qty: 2 }],
    },
  });

  const snapshot = engine.getRoomSnapshot(roomCode);
  const carolTickets = snapshot.currentGame?.tickets[playerId!] ?? [];
  assert.equal(
    carolTickets.length,
    6,
    `Large Yellow qty=2 skal gi 6 brett (2 × 3). Faktisk: ${carolTickets.length}`,
  );

  for (const ticket of carolTickets) {
    assert.equal(ticket.color, "Large Yellow");
    assert.equal(ticket.type, "large");
  }

  const carolWalletAfter = await wallet.getBalance("w-carol");
  const debited = carolWalletBefore - carolWalletAfter;
  assert.equal(
    debited,
    60,
    `2 × Large Yellow → 2 × 30 kr = 60 kr. Faktisk: ${debited} kr`,
  );
});
