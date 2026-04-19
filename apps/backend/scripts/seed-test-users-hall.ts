#!/usr/bin/env npx tsx
/**
 * BIN-643: Assign a default hall to test users that were created without one.
 *
 * Background: test accounts like `balltest@spillorama.no` were originally
 * created via the registration UI (or a since-removed seed) and have
 * `hall_id = NULL`. The platform's room-join flow requires a hall match
 * with the socket room's `hallId`, so these accounts cannot actually join
 * a hall-specific room like BINGO1 — they get "ROOM_NOT_FOUND" /
 * "HALL_MISMATCH" errors even when the DB + backend are otherwise healthy.
 *
 * This script is idempotent: only updates rows where `hall_id IS NULL`,
 * matching a whitelist of test-account emails. Production users with
 * explicit hall_id are untouched.
 *
 * Usage:
 *   npx tsx apps/backend/scripts/seed-test-users-hall.ts
 *   # or from backend dir:
 *   npm --prefix apps/backend run seed:test-users
 *
 * Requires APP_PG_CONNECTION_STRING in apps/backend/.env.
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Default hall slug for test accounts. Matches the `BINGO1` room that the
 * auto-round scheduler spins up at boot — so a test user can log in and
 * immediately join an active round without manual hall selection.
 */
const DEFAULT_TEST_HALL_SLUG = "notodden";

/**
 * Emails treated as test accounts. The `@spillorama.no` domain is reserved
 * for internal use (not a public signup domain), so any account on it is
 * safe to touch. `@example.com` is also RFC-reserved for test use.
 */
const TEST_EMAIL_PATTERNS = [
  "%@spillorama.no",
  "%@example.com",
  "%test%@%",
];

async function main(): Promise<void> {
  const connectionString =
    process.env.APP_PG_CONNECTION_STRING ??
    process.env.WALLET_PG_CONNECTION_STRING;
  if (!connectionString) {
    console.error(
      "Missing APP_PG_CONNECTION_STRING (or WALLET_PG_CONNECTION_STRING) in .env",
    );
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const hallRes = await client.query<{ id: string; slug: string; name: string }>(
      "SELECT id, slug, name FROM app_halls WHERE slug = $1 AND is_active = true",
      [DEFAULT_TEST_HALL_SLUG],
    );
    if (hallRes.rowCount === 0) {
      console.error(
        `Hall with slug "${DEFAULT_TEST_HALL_SLUG}" not found or inactive. ` +
          `Run seed-halls.ts first.`,
      );
      process.exit(1);
    }
    const hall = hallRes.rows[0];
    console.log(`[seed-test-users-hall] target hall: ${hall.name} (id=${hall.id})`);

    // Build a single query with all patterns OR'd together. Only touches
    // users with hall_id IS NULL — idempotent.
    const placeholders = TEST_EMAIL_PATTERNS.map((_, i) => `email ILIKE $${i + 2}`).join(
      " OR ",
    );
    const updateRes = await client.query(
      `UPDATE app_users
         SET hall_id = $1, updated_at = now()
       WHERE hall_id IS NULL
         AND (${placeholders})
       RETURNING id, email`,
      [hall.id, ...TEST_EMAIL_PATTERNS],
    );

    if (updateRes.rowCount === 0) {
      console.log(
        "[seed-test-users-hall] no test users needed a hall assignment — idempotent OK",
      );
    } else {
      console.log(
        `[seed-test-users-hall] assigned hall to ${updateRes.rowCount} test user(s):`,
      );
      for (const row of updateRes.rows) {
        console.log(`  ✓ ${row.email}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[seed-test-users-hall] failed:", error);
  process.exit(1);
});
