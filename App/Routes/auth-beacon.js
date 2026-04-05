/**
 * Auth Beacon — lets CandyWeb iframe discover the logged-in player
 * WITHOUT requiring the Socket.IO _playerToken flow.
 *
 * How it works:
 *   1. Unity player logs in via Socket.IO (on any server — old or Render).
 *   2. Login stores `otherData.authToken` + `socketId` in MongoDB.
 *   3. CandyWeb iframe calls GET /api/integration/auth-beacon?playerId=<id>
 *   4. If the player has a non-empty socketId (= logged in somewhere),
 *      we generate a fresh JWT for wallet-bridge use and return it.
 *
 * This bypasses the _playerToken monkey-patch issue where Unity WASM
 * creates Socket.IO connections that the page-level patch can't intercept.
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();
const Player = mongoose.model("player");

router.get("/", async (req, res) => {
  try {
    const { playerId } = req.query;

    if (!playerId) {
      // No playerId supplied — try to find ANY active player (dev/single-user mode)
      const active = await Player.findOne(
        { socketId: { $nin: [null, ""] } },
        { _id: 1, username: 1, name: 1, socketId: 1, totalAmount: 1 }
      ).sort({ updatedAt: -1 }).lean();

      if (!active) {
        return res.json({
          authenticated: false,
          reason: "no-active-player"
        });
      }

      const token = jwt.sign({ id: active._id.toString() }, process.env.JWT_SECRET, { expiresIn: "1d" });
      return res.json({
        authenticated: true,
        playerId: active._id.toString(),
        username: active.username,
        balance: active.totalAmount || 0,
        token
      });
    }

    // Specific playerId supplied
    const player = await Player.findById(playerId, {
      _id: 1, username: 1, name: 1, socketId: 1, totalAmount: 1
    }).lean();

    if (!player) {
      return res.json({
        authenticated: false,
        reason: "player-not-found"
      });
    }

    if (!player.socketId) {
      return res.json({
        authenticated: false,
        reason: "player-not-connected",
        playerId: player._id.toString()
      });
    }

    const token = jwt.sign({ id: player._id.toString() }, process.env.JWT_SECRET, { expiresIn: "1d" });
    return res.json({
      authenticated: true,
      playerId: player._id.toString(),
      username: player.username,
      balance: player.totalAmount || 0,
      token
    });
  } catch (err) {
    console.error("auth-beacon error:", err);
    return res.status(500).json({ authenticated: false, reason: "internal-error" });
  }
});

module.exports = router;
