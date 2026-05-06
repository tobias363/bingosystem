-- Up migration
--
-- PR #513 review §1.1 (KRITISK pilot-blokker, 2026-04-25):
-- Bytt `app_wallet_reservations.amount_cents` fra BIGINT (heltall) til
-- NUMERIC(20,6) for å matche resten av wallet-skjemaet
-- (`wallet_accounts.deposit_balance`, `wallet_accounts.winnings_balance`,
--  `wallet_transactions.amount`, `wallet_entries.amount` — alle NUMERIC(20,6)).
--
-- Bug-detaljer:
--   `roomEvents.ts:reservePreRoundDelta` beregner `deltaKr = deltaWeighted * entryFee`
--   hvor `entryFee` kan være desimal (f.eks. 12.50 kr per brett). Med BIGINT-kolonne
--   trunkerte Postgres `amount_cents` til heltall ved INSERT — så et 12.50 kr brett
--   ble lagret som 12 kr og spilleren fikk 0.50 kr "gratis" per brett.
--
-- Nominalformat:
--   Selv om kolonnen heter `amount_cents` har den faktisk alltid lagret hele kroner
--   (ikke ører) — `reserve()` får inn `deltaKr` som tall i kroner og lagrer som-er.
--   Navnet `_cents` er en arv fra første skisse; vi rør ikke navnet for å holde
--   migrasjonen minimal og ikke tvinge endringer i alle queries. Presisjonen
--   matcher nå `wallet_accounts.balance` (NUMERIC(20,6)).
--
-- Idempotent + rekkefølge-defensiv (Tobias 2026-05-06, MED-2):
--   Tidligere kjørte denne migrasjonen ALTER på en tabell som først ble
--   skapt i `20260724100000_wallet_reservations.sql`. På prod fungerte det
--   fordi tabellen allerede var skapt fra en tidligere kjøring, men på
--   fersk DB feilet `npm run migrate` med "relation does not exist" siden
--   node-pg-migrate kjører i timestamp-rekkefølge (april < juli).
--
--   Fix: vi skaper tabellen idempotent her ØVERST med post-ALTER-skjemaet
--   (NUMERIC(20,6) fra start), og lar ALTER bli no-op på fersk DB. På
--   prod-DB er CREATE TABLE IF NOT EXISTS no-op, og ALTER konverterer
--   eksisterende BIGINT-kolonne til NUMERIC. Begge tilfellene gir samme
--   sluttilstand. 20260724-migrasjonen sin egen `CREATE TABLE IF NOT EXISTS`
--   blir også no-op etter dette på fersk DB; dens indekser (alle med
--   IF NOT EXISTS) opprettes uavhengig.
--
--   Mønster: «Idempotente migrasjoner — alltid CREATE TABLE IF NOT EXISTS
--   før ALTER, slik at fersk-DB-flyt ikke avhenger av timestamp-rekkefølge.»
--   Se ADR-012.
--
--   ALTER COLUMN ... TYPE med samme target-type er no-op i PG.
--   CHECK-constraint dropping/recreating er via ALTER TABLE ... DROP/ADD
--   CONSTRAINT IF EXISTS/IF NOT EXISTS. Hele migrasjonen er trygg å
--   re-kjøre.
--
-- Test-strategi:
--   - PostgresWalletAdapter.reservation.test.ts dekker fractional-NOK (12.50 × 1)
--     og bekrefter at lagret beløp er nøyaktig 12.5 (ikke 12).

-- Defensiv CREATE — på fersk DB skapes tabellen direkte med post-ALTER-
-- skjemaet (NUMERIC(20,6)). På prod-DB er dette no-op fordi tabellen ble
-- skapt allerede via en tidligere kjøring av 20260724100000_wallet_reservations.sql.
-- Skjemaet her må holdes synkronisert med 20260724-migrasjonen (som er
-- den autoritative kilden for nye kolonner / indekser), bortsett fra at
-- amount_cents er NUMERIC(20,6) her.
CREATE TABLE IF NOT EXISTS app_wallet_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id TEXT NOT NULL,
  amount_cents NUMERIC(20, 6) NOT NULL CHECK (amount_cents > 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'committed', 'expired')),
  room_code TEXT NOT NULL,
  game_session_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ NULL,
  committed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);

-- Endre datatype. NUMERIC har implicit cast fra BIGINT, så ingen data-tap
-- ved oppgradering av eksisterende rader. På fersk DB (etter CREATE over)
-- er kolonnen allerede NUMERIC(20,6), så dette blir no-op.
ALTER TABLE app_wallet_reservations
  ALTER COLUMN amount_cents TYPE NUMERIC(20, 6) USING amount_cents::numeric(20, 6);

-- CHECK-constraint må re-formuleres for NUMERIC-semantikk. BIGINT > 0 og
-- NUMERIC > 0 har samme effektive betydning, men constraint-navnet kan ha
-- ulike former i forskjellige PG-versjoner — vi dropper IF EXISTS både for
-- den auto-genererte BIGINT-versjonen (prod) OG vår egen navngitte versjon
-- (rerun-trygt) før vi legger til den endelige navngitte constraint-en.
-- PG støtter ikke `ADD CONSTRAINT IF NOT EXISTS`, så DROP+ADD-mønsteret er
-- standard for idempotens.
ALTER TABLE app_wallet_reservations
  DROP CONSTRAINT IF EXISTS app_wallet_reservations_amount_cents_check;

ALTER TABLE app_wallet_reservations
  DROP CONSTRAINT IF EXISTS app_wallet_reservations_amount_positive;

ALTER TABLE app_wallet_reservations
  ADD CONSTRAINT app_wallet_reservations_amount_positive
  CHECK (amount_cents > 0);

COMMENT ON COLUMN app_wallet_reservations.amount_cents IS
  'PR #513 §1.1: NUMERIC(20,6) for å matche wallet-balance-presisjon. '
  'Lagrer hele kroner (ikke ører) til tross for legacy-navn. Fractional-NOK '
  '(eks. 12.50 kr/brett) støttes nå uten trunkering.';
