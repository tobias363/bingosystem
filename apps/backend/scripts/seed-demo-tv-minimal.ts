#!/usr/bin/env npx tsx
/**
 * Minimal seed for TV-skjerm-testing: oppretter kun hall med tv_token og
 * printer TV-URL til konsollet. Ingen hall_groups, ingen scheduled game,
 * ingen admin/player — kun det som trengs for å åpne TV-siden og verifisere
 * at rendering fungerer.
 *
 * Brukes som fallback når full `seed-demo-tv-and-bonus.ts` feiler pga.
 * schema-drift i andre tabeller (f.eks. app_hall_groups).
 *
 * Usage:
 *   npx tsx apps/backend/scripts/seed-demo-tv-minimal.ts
 *   # eller:
 *   npm --prefix apps/backend run seed:demo-tv-minimal
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const HALL_SLUG = "demo-hall";
const HALL_NAME = "Demo Hall (lokal testing)";

async function main(): Promise<void> {
  const connectionString =
    process.env.APP_PG_CONNECTION_STRING ??
    process.env.WALLET_PG_CONNECTION_STRING;
  if (!connectionString) {
    console.error(
      "Mangler APP_PG_CONNECTION_STRING (eller WALLET_PG_CONNECTION_STRING) i .env",
    );
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Upsert hall (atomisk, ingen transaksjon — én query er tilstrekkelig).
    const existing = await client.query<{ id: string; tv_token: string }>(
      "SELECT id, tv_token FROM app_halls WHERE slug = $1",
      [HALL_SLUG],
    );

    let hallId: string;
    let tvToken: string;

    if (existing.rows[0]) {
      // Finn eksisterende, sørg for aktiv + tv_token satt.
      const res = await client.query<{ id: string; tv_token: string }>(
        `UPDATE app_halls
           SET is_active = true,
               tv_token = COALESCE(tv_token, gen_random_uuid()::text),
               updated_at = now()
         WHERE id = $1
         RETURNING id, tv_token`,
        [existing.rows[0].id],
      );
      hallId = res.rows[0].id;
      tvToken = res.rows[0].tv_token;
      console.log(`  ✓ Oppdaterte eksisterende hall: ${HALL_SLUG} (id=${hallId})`);
    } else {
      const id = randomUUID();
      const res = await client.query<{ id: string; tv_token: string }>(
        `INSERT INTO app_halls
           (id, slug, name, region, address, is_active, tv_token)
         VALUES
           ($1, $2, $3, 'NO', 'Storgata 1, 0000 Demo', true, gen_random_uuid()::text)
         RETURNING id, tv_token`,
        [id, HALL_SLUG, HALL_NAME],
      );
      hallId = res.rows[0].id;
      tvToken = res.rows[0].tv_token;
      console.log(`  ✓ Opprettet ny hall: ${HALL_SLUG} (id=${hallId})`);
    }

    const baseUrl =
      process.env.PUBLIC_BASE_URL ?? "https://spillorama-system.onrender.com";

    console.log("");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("  DEMO TV-TEST (minimal)");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log(`  Hall:       ${HALL_SLUG}`);
    console.log(`  Hall ID:    ${hallId}`);
    console.log(`  TV-token:   ${tvToken}`);
    console.log("");
    console.log(`  TV-URL:      ${baseUrl}/admin/#/tv/${hallId}/${tvToken}`);
    console.log(`  Winners-URL: ${baseUrl}/admin/#/tv/${hallId}/${tvToken}/winners`);
    console.log(`  API-sjekk:   ${baseUrl}/api/tv/${hallId}/${tvToken}/state`);
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("");
    console.log("Merk: denne seed lager IKKE scheduled game eller mini-games.");
    console.log("Kun TV-skjerm-rendering kan verifiseres uten mer setup.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[seed-demo-tv-minimal] feilet:", error);
  process.exit(1);
});
