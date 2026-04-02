/**
 * BIN-102: Seed CandyMania as a gameType in MongoDB.
 *
 * Usage:
 *   node scripts/seed-candy-mania.js
 *
 * Requires MONGO_URI env var (or uses the default from env.conf).
 * Idempotent: skips insert if a gameType with type "candy_mania" already exists.
 */

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../env.conf") });

const MONGO_URI = process.env.MONGO_URI || process.env.DB_CONNECTION_STRING;

if (!MONGO_URI) {
  console.error("MONGO_URI is not set. Set it in env.conf or as an environment variable.");
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const db = mongoose.connection.db;
  const collection = db.collection("gameType");

  // Check if CandyMania already exists.
  const existing = await collection.findOne({ type: "candy_mania" });
  if (existing) {
    console.log("CandyMania gameType already exists — skipping insert.");
    await mongoose.disconnect();
    return;
  }

  const doc = {
    name: "CandyMania",
    type: "candy_mania",
    pattern: true,
    photo: "candy-mania-thumb.png",
    row: "3",
    columns: "5",
    totalNoTickets: "1",
    userMaxTickets: "5",
    pickLuckyNumber: [],
    rangeMin: "1",
    rangeMax: "60",
    externalUrl: "/candy/?embed=true",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await collection.insertOne(doc);
  console.log("CandyMania gameType inserted:", result.insertedId);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
