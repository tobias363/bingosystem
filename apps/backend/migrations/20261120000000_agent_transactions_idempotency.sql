-- BIN-PILOT-K1: Atomicity-fix for agent cash-ops (Code Review #1 P0-1).
--
-- Problem (rotsak):
--   AgentTransactionService.processCashOp utfører tre ledger-stegs i tre
--   separate PG-transaksjoner:
--     (1) wallet.credit/debit  — atomisk + idempotent via idempotencyKey
--     (2) applyShiftCashDelta  — atomisk men IKKE idempotent (UPDATE + delta)
--     (3) txs.insert           — atomisk men bruker fersk txId per kall
--
--   Hvis network-flap inntreffer mellom (1) og (2), retry vil:
--     - Step 1: Idempotent → returnerer samme wallet-tx (ingen dobbel-debit på wallet)
--     - Step 2: NOT IDEMPOTENT → DOBBEL-INKREMENTERER shift.daily_balance
--     - Step 3: Ny txId → DUPLIKAT-rad i app_agent_transactions
--
--   Konsekvens: shift.daily_balance feil + daglig-oppgjør avviker. Money-loss-risk.
--
-- Fix (denne migration + service-refaktor):
--   Legger til `client_request_id`-kolonne + UNIQUE-constraint på
--   `(agent_user_id, player_user_id, client_request_id)`. Dette er en
--   retry-safe idempotency-bærer som Service-laget bruker via INSERT ... ON
--   CONFLICT DO NOTHING. Service-laget wrapper steg 2 (applyShiftCashDelta)
--   + steg 3 (INSERT) i én DB-transaksjon. Ved retry: INSERT slår mot
--   conflict → COMMIT er allerede utført fra forrige fullførte kall, og
--   service-laget fanger ON CONFLICT-tilbakemelding og returnerer
--   eksisterende rad uten å mutate cash-delta på nytt.
--
-- WHERE-klausul på unique-indeksen:
--   `client_request_id IS NOT NULL` — gamle rader uten client_request_id
--   (pre-migration) blir ikke deduplisert. Backwards-compat. Nye cash-ops
--   alltid har client_request_id (kreves av PR #522 hotfix-validering i
--   `AgentTransactionService.processCashOp`).
--
-- Up migration

ALTER TABLE app_agent_transactions
  ADD COLUMN IF NOT EXISTS client_request_id TEXT NULL;

COMMENT ON COLUMN app_agent_transactions.client_request_id IS
  'BIN-PILOT-K1: client-supplied retry-key for idempotent cash-ops. UNIQUE per (agent_user_id, player_user_id, client_request_id) når non-NULL. Settes alltid for cash-in/cash-out fra PR #522.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_agent_transactions_idempotency
  ON app_agent_transactions (agent_user_id, player_user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
