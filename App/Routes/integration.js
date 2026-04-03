/**
 * Wallet-bridge REST API for CandyWeb iframe integration.
 *
 * Endpoints:
 *   GET  /api/integration/wallet/balance   — Current player balance
 *   POST /api/integration/wallet/debit     — Deduct from player wallet
 *   POST /api/integration/wallet/credit    — Add to player wallet
 *
 * All endpoints require a valid JWT in the Authorization header (Bearer token).
 * Debit/credit support idempotency via the idempotencyKey field.
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();
const Player = mongoose.model("player");
const Transaction = mongoose.model("transactions");

// ---------------------------------------------------------------------------
// JWT middleware — extracts player from token
// ---------------------------------------------------------------------------
function requirePlayerToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Missing or invalid Authorization header." });
  }
  const token = header.slice(7).trim();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.playerId = payload.id;
    next();
  } catch {
    return res.status(403).json({ error: "TOKEN_INVALID", message: "JWT verification failed." });
  }
}

router.use(requirePlayerToken);

// ---------------------------------------------------------------------------
// GET /api/integration/wallet/balance
// ---------------------------------------------------------------------------
router.get("/balance", async (req, res) => {
  try {
    const player = await Player.findById(req.playerId).select("totalAmount");
    if (!player) {
      return res.status(404).json({ error: "PLAYER_NOT_FOUND" });
    }
    return res.json({ balance: player.totalAmount || 0, currency: "NOK" });
  } catch (err) {
    console.error("wallet/balance error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/integration/wallet/debit
// Body: { amount: number, gameId?: string, idempotencyKey: string }
// ---------------------------------------------------------------------------
router.post("/debit", async (req, res) => {
  try {
    const { amount, gameId, idempotencyKey } = req.body || {};
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "INVALID_AMOUNT" });
    }
    if (!idempotencyKey) {
      return res.status(400).json({ error: "MISSING_IDEMPOTENCY_KEY" });
    }

    // Idempotency check — return existing transaction if key was already used
    const existing = await Transaction.findOne({ idempotencyKey });
    if (existing) {
      return res.json({
        transactionId: existing._id,
        previousBalance: existing.previousBalance,
        afterBalance: existing.afterBalance,
        idempotent: true
      });
    }

    const player = await Player.findById(req.playerId);
    if (!player) {
      return res.status(404).json({ error: "PLAYER_NOT_FOUND" });
    }
    if ((player.totalAmount || 0) < amount) {
      return res.status(400).json({ error: "INSUFFICIENT_FUNDS", balance: player.totalAmount || 0 });
    }

    const previousBalance = player.totalAmount || 0;
    player.totalAmount = previousBalance - amount;
    await player.save();

    const tx = await Transaction.create({
      playerId: req.playerId,
      category: "debit",
      amtCategory: "candy_game_debit",
      defineSlug: "candy_mania",
      gameId: gameId || "",
      gameName: "CandyMania",
      differenceAmount: amount,
      previousBalance,
      afterBalance: player.totalAmount,
      status: "success",
      idempotencyKey,
      remark: "CandyMania iframe wallet bridge debit"
    });

    return res.json({
      transactionId: tx._id,
      previousBalance,
      afterBalance: player.totalAmount,
      idempotent: false
    });
  } catch (err) {
    console.error("wallet/debit error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/integration/wallet/credit
// Body: { amount: number, gameId?: string, idempotencyKey: string }
// ---------------------------------------------------------------------------
router.post("/credit", async (req, res) => {
  try {
    const { amount, gameId, idempotencyKey } = req.body || {};
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "INVALID_AMOUNT" });
    }
    if (!idempotencyKey) {
      return res.status(400).json({ error: "MISSING_IDEMPOTENCY_KEY" });
    }

    // Idempotency check
    const existing = await Transaction.findOne({ idempotencyKey });
    if (existing) {
      return res.json({
        transactionId: existing._id,
        previousBalance: existing.previousBalance,
        afterBalance: existing.afterBalance,
        idempotent: true
      });
    }

    const player = await Player.findById(req.playerId);
    if (!player) {
      return res.status(404).json({ error: "PLAYER_NOT_FOUND" });
    }

    const previousBalance = player.totalAmount || 0;
    player.totalAmount = previousBalance + amount;
    await player.save();

    const tx = await Transaction.create({
      playerId: req.playerId,
      category: "credit",
      amtCategory: "candy_game_credit",
      defineSlug: "candy_mania",
      gameId: gameId || "",
      gameName: "CandyMania",
      differenceAmount: amount,
      previousBalance,
      afterBalance: player.totalAmount,
      status: "success",
      idempotencyKey,
      remark: "CandyMania iframe wallet bridge credit"
    });

    return res.json({
      transactionId: tx._id,
      previousBalance,
      afterBalance: player.totalAmount,
      idempotent: false
    });
  } catch (err) {
    console.error("wallet/credit error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

module.exports = router;
