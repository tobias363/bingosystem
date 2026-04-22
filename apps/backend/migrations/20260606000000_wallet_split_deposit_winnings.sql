-- PR-W1: Wallet-split schema — deposit vs. winnings konti
--
-- Design: docs/architecture/WALLET_SPLIT_DESIGN_2026-04-22.md
--
-- Splitter wallet_accounts.balance i to logiske konti per spiller:
--   * deposit_balance  — brukerens innskudd (topup, refund)
--   * winnings_balance — gevinster fra spill (payout)
--
-- Purchase-flyt (implementeres i PR-W2): trekk fra winnings først, så deposit.
-- Loss-limit (implementeres i PR-W5): teller kun deposit-trekk.
--
-- PM-beslutninger (låst 2026-04-22):
--   1. Retroaktiv splitt: alle eksisterende saldoer → deposit_balance, winnings=0.
--   2. Topup → alltid deposit_balance.
--   3. Admin-credit til winnings er IKKE TILLATT (regulatorisk forbud).
--   4. Withdrawal → winnings først, så deposit.
--
-- Schema-strategi:
--   * `balance` konverteres til GENERATED ALWAYS AS (deposit + winnings) STORED
--     for bakoverkompatibilitet. Eksisterende SELECT/sum-queries uendret.
--   * Systemkontoer (__system_house__, __system_external_cash__) holder all
--     saldo i deposit_balance; winnings_balance = 0 (enforced via CHECK).
--   * wallet_entries.account_side markerer hvilken "side" av split-kontoen en
--     entry gjelder — 'deposit' eller 'winnings'. Eksisterende entries
--     backfilles til 'deposit' (alle historiske er per definisjon deposit).
--
-- Bakoverkompatibilitet:
--   * `balance`-kolonnen forblir lesbar og returnerer deposit+winnings.
--   * Eksisterende PostgresWalletAdapter.getBalance() fortsetter å fungere.
--   * WalletAdapter-interface utvidelse (deposit/winnings getters) er additive.
--
-- Forward-only (BIN-661): ingen Down-seksjon. Rollback via ny migration hvis
-- nødvendig (vil måtte lagre sum tilbake i deposit_balance først, så droppe
-- GENERATED og ADD TEXT-kolonne).
--
-- Up migration

-- Steg 1: Legg til nye balance-kolonner med default 0.
ALTER TABLE wallet_accounts
  ADD COLUMN IF NOT EXISTS deposit_balance  NUMERIC(20, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS winnings_balance NUMERIC(20, 6) NOT NULL DEFAULT 0;

-- Steg 2: Retroaktiv backfill — alle eksisterende saldoer = deposit (PM-beslutning 4).
-- Både ikke-system-kontoer og system-kontoer får balance → deposit_balance.
-- Dette er idempotent (WHERE deposit_balance = 0 sikrer ingen dobbel-kopi hvis
-- migrasjonen ved uhell kjøres etter manuell testing).
UPDATE wallet_accounts
  SET deposit_balance = balance
  WHERE deposit_balance = 0 AND balance > 0;

-- Steg 3: Invariant — system-kontoer skal ALDRI ha winnings (de er motpart for
-- kjøp/uttak + payout-kilde, ikke målkonti).
ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_system_no_winnings
  CHECK (is_system = false OR winnings_balance = 0);

-- Steg 4: Invariant — hver split-saldo må være ikke-negativ for ikke-system-kontoer.
-- (System-kontoer kan ha negativ deposit_balance siden de er motpart-side i double-entry.)
ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_nonneg_deposit_nonsystem
  CHECK (is_system = true OR deposit_balance >= 0);

ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_nonneg_winnings_nonsystem
  CHECK (is_system = true OR winnings_balance >= 0);

-- Steg 5: Erstatt `balance`-kolonnen med GENERATED ALWAYS AS (deposit+winnings) STORED.
-- Dette bevarer ALL eksisterende lese-logikk — `SELECT balance FROM wallet_accounts`
-- returnerer fortsatt korrekt totalsum, ingen kode-endring nødvendig før split aktiveres.
-- GENERATED STORED er viktig: indexer og queries trenger ikke re-beregne ved hver SELECT.
ALTER TABLE wallet_accounts DROP COLUMN balance;
ALTER TABLE wallet_accounts
  ADD COLUMN balance NUMERIC(20, 6)
  GENERATED ALWAYS AS (deposit_balance + winnings_balance) STORED;

-- Steg 6: Legg til account_side på wallet_entries for audit-sporing av hvilken
-- "side" av split-kontoen en entry gjelder. Default 'deposit' for bakoverkompat
-- (alle historiske entries er per definisjon deposit — før split fantes ingen winnings).
ALTER TABLE wallet_entries
  ADD COLUMN IF NOT EXISTS account_side TEXT NOT NULL DEFAULT 'deposit'
  CHECK (account_side IN ('deposit', 'winnings'));

-- Steg 7: Index for spørringer som filtrerer audit-log per account_side
-- (f.eks. "alle winnings-krediteringer for denne spilleren").
CREATE INDEX IF NOT EXISTS idx_wallet_entries_account_side
  ON wallet_entries (account_id, account_side, created_at DESC);

-- Steg 8: Kommentarer for hvem-som-leser-schemaet.
COMMENT ON COLUMN wallet_accounts.deposit_balance IS
  'PR-W1 wallet-split: brukerens innskudd (topup, refund). Loss-limit teller kun trekk fra denne.';
COMMENT ON COLUMN wallet_accounts.winnings_balance IS
  'PR-W1 wallet-split: gevinster fra spill (payout). Trekkes først ved kjøp (winnings-first-policy). Admin-credit IKKE TILLATT (regulatorisk forbud).';
COMMENT ON COLUMN wallet_accounts.balance IS
  'PR-W1 wallet-split: generert sum av deposit_balance + winnings_balance. Bakoverkompat for eksisterende code paths.';
COMMENT ON COLUMN wallet_entries.account_side IS
  'PR-W1 wallet-split: hvilken side av split-kontoen denne entry gjelder. Historiske entries backfilled til deposit.';
