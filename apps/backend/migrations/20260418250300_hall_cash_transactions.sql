-- BIN-583 B3.3: hall cash/safe-ledger.
--
-- Port av legacy hallCashTransaction — immutable audit trail over
-- hall-cash-flow:
--   - DAILY_BALANCE_TRANSFER: shift.daily_balance → app_halls.cash_balance
--     ved settlement
--   - DROP_SAFE_MOVE: cash_balance ↔ dropsafe_balance (manuell drop-safe-
--     overføring)
--   - SHIFT_DIFFERENCE: justering ved cash-count-diff > 0
--   - MANUAL_ADJUSTMENT: ad-hoc admin-justering med note
--
-- Append-only — ingen UPDATE/DELETE. Korrigeringer = ny rad med
-- motsatt direction.
--
-- Up

CREATE TABLE IF NOT EXISTS app_hall_cash_transactions (
  id                  TEXT PRIMARY KEY,
  hall_id             TEXT NOT NULL REFERENCES app_halls(id) ON DELETE RESTRICT,
  agent_user_id       TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
  shift_id            TEXT NULL REFERENCES app_agent_shifts(id) ON DELETE SET NULL,
  settlement_id       TEXT NULL REFERENCES app_agent_settlements(id) ON DELETE SET NULL,

  tx_type             TEXT NOT NULL CHECK (tx_type IN (
                        'DAILY_BALANCE_TRANSFER',
                        'DROP_SAFE_MOVE',
                        'SHIFT_DIFFERENCE',
                        'MANUAL_ADJUSTMENT'
                      )),
  direction           TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  amount              NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  previous_balance    NUMERIC(14, 2) NOT NULL,
  after_balance       NUMERIC(14, 2) NOT NULL,
  notes               TEXT NULL,
  other_data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_hall_cash_tx_hall_created
  ON app_hall_cash_transactions(hall_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_hall_cash_tx_settlement
  ON app_hall_cash_transactions(settlement_id)
  WHERE settlement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_hall_cash_tx_shift
  ON app_hall_cash_transactions(shift_id)
  WHERE shift_id IS NOT NULL;

COMMENT ON TABLE app_hall_cash_transactions IS
  'BIN-583 B3.3: immutable ledger for hall-cash-flow (daily-balance-transfer, drop-safe, settlement-diff).';
COMMENT ON COLUMN app_hall_cash_transactions.previous_balance IS
  'app_halls.cash_balance før denne tx-en. Snapshot for audit.';
