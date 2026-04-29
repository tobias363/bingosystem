-- =============================================================================
-- Schema-archaeology inspection — 2026-04-29
-- =============================================================================
-- READ-ONLY diagnostic dump. Run this against PROD before generating the fix
-- script. NO mutations, NO ALTER, NO INSERT, NO DELETE.
--
-- Wrapped in a transaction with explicit ROLLBACK at the bottom so that even
-- if a future maintainer accidentally edits in a write, the script still
-- guarantees no permanent change.
--
-- USAGE
--   psql "$PROD_PG_URL" -v ON_ERROR_STOP=1 \
--     -f docs/operations/schema-archaeology-inspect.sql \
--     | tee /tmp/schema-inspect-$(date +%s).log
--
-- The output is consumed by Tobias' technical lead to:
--   1. Confirm the divergence between pgmigrations and apps/backend/migrations/
--   2. Identify which migrations are "schema-live but unregistered"
--   3. Hand off to schema-archaeology-fix.sql for INSERT INTO pgmigrations
--
-- DEPENDENCIES: read-only access to public.pgmigrations and information_schema.
-- =============================================================================

\echo '── Schema-archaeology inspection — 2026-04-29 ──'
\echo ''

BEGIN;
-- Defense-in-depth: even if someone edits this file later, the explicit
-- ROLLBACK at the end and the SET TRANSACTION READ ONLY here prevent writes.
SET TRANSACTION READ ONLY;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 1 — Total counts
-- ─────────────────────────────────────────────────────────────────────────────

\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Section 1: Total counts'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  (SELECT count(*) FROM pgmigrations)                               AS pgmigrations_count,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public')                                 AS public_tables_count,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'app\_%' ESCAPE '\') AS app_prefixed_tables;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 2 — All registered migrations, in apply-order
-- ─────────────────────────────────────────────────────────────────────────────

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Section 2: pgmigrations rows in apply-order (run_on, id)'
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'This is what node-pg-migrate sees as "already run" — sorted by run_on, id'
\echo 'matches the runner''s own ORDER BY clause.'
\echo ''

SELECT
  id,
  name,
  run_on
FROM pgmigrations
ORDER BY run_on, id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 3 — All registered migrations sorted alphabetically (filename order)
-- ─────────────────────────────────────────────────────────────────────────────

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Section 3: pgmigrations rows sorted by name (alphabetical = filename order)'
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Compare against apps/backend/migrations/*.sql (also alphabetical).'
\echo 'A gap = a missing migration name from pgmigrations.'
\echo 'A name not in the file list = a registered migration that has been deleted from disk (RED FLAG).'
\echo ''

SELECT
  name
FROM pgmigrations
ORDER BY name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 4 — Schema-live status of suspected-orphan migrations
-- ─────────────────────────────────────────────────────────────────────────────
-- Each row says: this migration would create THIS object — does it already
-- exist in prod? If YES + the migration is not in pgmigrations, the schema
-- is "live but unregistered" → safe to INSERT INTO pgmigrations.

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Section 4: Schema-live probe per migration'
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'For each migration in apps/backend/migrations/, this query reports'
\echo '  - object_kind: TABLE / COLUMN / DATA-ONLY'
\echo '  - object_name: what the migration tries to create'
\echo '  - schema_live: does the object exist in prod RIGHT NOW?'
\echo '  - registered_in_pgmigrations: is the migration in pgmigrations?'
\echo ''
\echo 'Decision matrix:'
\echo '  schema_live=YES + registered=NO → INSERT INTO pgmigrations (safe)'
\echo '  schema_live=NO  + registered=NO → migration must run (let render deploy do it)'
\echo '  schema_live=YES + registered=YES → already in lock-step (no action)'
\echo '  schema_live=NO  + registered=YES → DRIFT — schema reverted? (investigate)'
\echo ''

WITH migrations(name, object_kind, object_qualifier) AS (
  -- This list MUST match docs/operations/SCHEMA_ARCHAEOLOGY_2026-04-29.md
  -- "Inventory" table column "Object detected".
  -- Format: (basename-without-extension, TABLE|COLUMN|DATA, table_name OR table.column)
  VALUES
    ('20260413000001_initial_schema',                      'TABLE',  'wallet_accounts'),
    ('20260413000002_max_tickets_30_all_games',            'DATA',   ''),
    ('20260415000001_game_variant_config',                 'COLUMN', 'hall_game_schedules.variant_config'),
    ('20260416000001_multi_hall_linked_draws',             'TABLE',  'app_hall_groups'),
    ('20260417000001_ticket_draw_session_binding',         'COLUMN', 'game_sessions.draw_session_id'),
    ('20260417000002_static_tickets',                      'TABLE',  'app_static_tickets'),
    ('20260417000003_agent_ticket_ranges',                 'TABLE',  'app_agent_ticket_ranges'),
    ('20260417000004_idempotency_records',                 'TABLE',  'app_idempotency_records'),
    ('20260417000005_regulatory_ledger',                   'TABLE',  'app_regulatory_ledger'),
    ('20260417000006_daily_regulatory_reports',            'TABLE',  'app_daily_regulatory_reports'),
    ('20260417000007_user_hall_binding',                   'COLUMN', 'app_users.hall_id'),
    ('20260417000008_draw_session_tickets',                'TABLE',  'app_draw_session_tickets'),
    ('20260417120000_deactivate_game4_temabingo',          'DATA',   ''),
    ('20260418090000_add_hall_client_variant',             'COLUMN', 'app_halls.client_variant'),
    ('20260418130000_chat_messages',                       'TABLE',  'app_chat_messages'),
    ('20260418140000_halls_tv_url',                        'COLUMN', 'app_halls.tv_url'),
    ('20260418150000_hall_display_tokens',                 'TABLE',  'app_hall_display_tokens'),
    ('20260418160000_app_audit_log',                       'TABLE',  'app_audit_log'),
    ('20260418160000_deposit_withdraw_queue',              'TABLE',  'app_deposit_requests'),
    ('20260418170000_user_hall_scope',                     'COLUMN', 'app_users.hall_scope'),
    ('20260418180000_auth_tokens',                         'TABLE',  'app_password_reset_tokens'),
    ('20260418190000_player_lifecycle',                    'TABLE',  'app_player_hall_status'),
    ('20260418200000_aml_red_flags',                       'TABLE',  'app_aml_rules'),
    ('20260418210000_security_admin',                      'TABLE',  'app_withdraw_email_allowlist'),
    ('20260418220000_agent_role_and_profile',              'COLUMN', 'app_users.language'),
    ('20260418220100_agent_halls',                         'TABLE',  'app_agent_halls'),
    ('20260418220200_agent_shifts',                        'TABLE',  'app_agent_shifts'),
    ('20260418220300_audit_log_agent_actor_type',          'DATA',   ''),
    ('20260418230000_physical_tickets',                    'TABLE',  'app_physical_ticket_batches'),
    ('20260418240000_agent_transactions',                  'TABLE',  'app_agent_transactions'),
    ('20260418240000_vouchers',                            'TABLE',  'app_vouchers'),
    ('20260418250000_agent_settlements',                   'TABLE',  'app_agent_settlements'),
    ('20260418250100_shift_settled_at',                    'COLUMN', 'app_agent_shifts.settled_at'),
    ('20260418250200_hall_cash_balance',                   'COLUMN', 'app_halls.cash_balance'),
    ('20260418250300_hall_cash_transactions',              'TABLE',  'app_hall_cash_transactions'),
    ('20260419000000_game_management',                     'TABLE',  'app_game_management'),
    ('20260420000000_products',                            'TABLE',  'app_product_categories'),
    ('20260420000050_agent_tx_product_sale',               'DATA',   ''),
    ('20260420000100_physical_ticket_transfers',           'TABLE',  'app_physical_ticket_transfers'),
    ('20260420100000_machine_tickets',                     'TABLE',  'app_machine_tickets'),
    ('20260420100100_agent_tx_machine_actions',            'DATA',   ''),
    ('20260421000000_hall_manual_adjustments',             'TABLE',  'app_hall_manual_adjustments'),
    ('20260421000100_set_bingo_client_engine_web',         'DATA',   ''),
    ('20260421120000_sub_game_parent_link',                'COLUMN', 'hall_game_schedules.parent_schedule_id'),
    ('20260421130000_purge_legacy_bingo1_no_gameslug',     'DATA',   ''),
    ('20260421140000_payment_request_destination_type',    'COLUMN', 'app_withdraw_requests.destination_type'),
    ('20260422000000_daily_schedules',                     'TABLE',  'app_daily_schedules'),
    ('20260423000000_patterns',                            'TABLE',  'app_patterns'),
    ('20260423000100_halls_tv_token',                      'COLUMN', 'app_halls.tv_token'),
    ('20260424000000_add_game_slug_to_game_sessions',      'COLUMN', 'game_sessions.game_slug'),
    ('20260424000000_hall_groups',                         'TABLE',  'app_hall_groups'),
    ('20260424153706_agent_shift_logout_flags',            'COLUMN', 'app_agent_shifts.distributed_winnings'),
    ('20260425000000_close_day_log',                       'TABLE',  'app_close_day_log'),
    ('20260425000000_game_types',                          'TABLE',  'app_game_types'),
    ('20260425000000_wallet_reservations_numeric',         'DATA',   ''),
    ('20260425000100_sub_games',                           'TABLE',  'app_sub_games'),
    ('20260425000200_saved_games',                         'TABLE',  'app_saved_games'),
    ('20260425000300_schedules',                           'TABLE',  'app_schedules'),
    ('20260425000400_leaderboard_tiers',                   'TABLE',  'app_leaderboard_tiers'),
    ('20260425000500_system_settings_maintenance',         'TABLE',  'app_system_settings'),
    ('20260425000600_mini_games_config',                   'TABLE',  'app_mini_games_config'),
    ('20260425125008_screen_saver_settings',               'TABLE',  'app_screen_saver_images'),
    ('20260426000200_cms',                                 'TABLE',  'app_cms_content'),
    ('20260426120000_chat_moderation',                     'COLUMN', 'app_chat_messages.deleted_at'),
    ('20260427000000_physical_ticket_cashouts',            'TABLE',  'app_physical_ticket_cashouts'),
    ('20260427000000_wallet_outbox',                       'TABLE',  'wallet_outbox'),
    ('20260427000100_physical_ticket_win_data',            'COLUMN', 'app_physical_tickets.numbers_json'),
    ('20260428000000_game1_scheduled_games',               'TABLE',  'app_game1_scheduled_games'),
    ('20260428000100_game1_hall_ready_status',             'TABLE',  'app_game1_hall_ready_status'),
    ('20260428000200_game1_master_audit',                  'TABLE',  'app_game1_master_audit'),
    ('20260428080000_compliance_ledger_idempotency',       'COLUMN', 'app_rg_compliance_ledger.idempotency_key'),
    ('20260429000000_loyalty',                             'TABLE',  'app_loyalty_tiers'),
    ('20260429000100_drop_hall_client_variant',            'DATA',   ''),
    ('20260429074303_compliance_outbox',                   'TABLE',  'app_compliance_outbox'),
    ('20260430000000_app_game1_ticket_purchases',          'TABLE',  'app_game1_ticket_purchases'),
    ('20260430000100_physical_tickets_scheduled_game_fk',  'DATA',   ''),
    ('20260501000000_app_game1_ticket_assignments',        'TABLE',  'app_game1_ticket_assignments'),
    ('20260501000100_app_game1_draws',                     'TABLE',  'app_game1_draws'),
    ('20260501000200_app_game1_game_state',                'TABLE',  'app_game1_game_state'),
    ('20260501000300_app_game1_phase_winners',             'TABLE',  'app_game1_phase_winners'),
    ('20260503000000_game1_hall_scan_data',                'COLUMN', 'app_game1_hall_ready_status.start_ticket_id'),
    ('20260601000000_app_game1_scheduled_games_room_code', 'COLUMN', 'app_game1_scheduled_games.room_code'),
    ('20260605000000_app_game1_scheduled_games_game_config','COLUMN','app_game1_scheduled_games.game_config_json'),
    ('20260606000000_app_game1_mini_game_results',         'TABLE',  'app_game1_mini_game_results'),
    ('20260606000000_static_tickets_pt1_extensions',       'COLUMN', 'app_static_tickets.sold_by_user_id'),
    ('20260606000000_wallet_split_deposit_winnings',       'COLUMN', 'wallet_accounts.deposit_balance'),
    ('20260607000000_agent_ticket_ranges_pt2_extensions',  'COLUMN', 'app_agent_ticket_ranges.current_top_serial'),
    ('20260608000000_physical_ticket_pending_payouts',     'TABLE',  'app_physical_ticket_pending_payouts'),
    ('20260609000000_game1_oddsen_state',                  'TABLE',  'app_game1_oddsen_state'),
    ('20260610000000_agent_ticket_ranges_pt5_extensions',  'COLUMN', 'app_agent_ticket_ranges.handed_off_to_range_id'),
    ('20260611000000_game1_accumulating_pots',             'TABLE',  'app_game1_pot_events'),
    ('20260700000000_cms_content_versions',                'TABLE',  'app_cms_content_versions'),
    ('20260701000000_hall_number',                         'COLUMN', 'app_halls.hall_number'),
    ('20260705000000_agent_permissions',                   'TABLE',  'app_agent_permissions'),
    ('20260706000000_app_notifications_and_devices',       'TABLE',  'app_user_devices'),
    ('20260723000000_voucher_redemptions',                 'TABLE',  'app_voucher_redemptions'),
    ('20260724000000_game1_mini_game_mystery',             'DATA',   ''),
    ('20260724001000_app_unique_ids',                      'TABLE',  'app_unique_ids'),
    ('20260724100000_wallet_reservations',                 'TABLE',  'app_wallet_reservations'),
    ('20260725000000_settlement_machine_breakdown',        'COLUMN', 'app_agent_settlements.machine_breakdown'),
    ('20260726000000_game1_auto_pause_on_phase',           'COLUMN', 'app_game1_game_state.paused_at_phase'),
    ('20260726000000_settlement_breakdown_k1b_fields',     'DATA',   ''),
    ('20260726100000_ticket_ranges_per_game',              'TABLE',  'app_ticket_ranges_per_game'),
    ('20260727000000_game1_master_transfer_requests',      'TABLE',  'app_game1_master_transfer_requests'),
    ('20260727000001_game1_master_audit_add_transfer_actions', 'DATA', ''),
    ('20260810000000_withdraw_requests_bank_export',       'COLUMN', 'app_withdraw_requests.bank_account_number'),
    ('20260810000100_xml_export_batches',                  'TABLE',  'app_xml_export_batches'),
    ('20260811000000_halls_tv_voice_selection',            'COLUMN', 'app_halls.tv_voice_selection'),
    ('20260820000000_user_profile_settings',               'TABLE',  'app_user_profile_settings'),
    ('20260821000000_game1_jackpot_state',                 'TABLE',  'app_game1_jackpot_state'),
    ('20260825000000_close_day_log_3case',                 'COLUMN', 'app_close_day_log.start_time'),
    ('20260825000000_player_profile_images',               'COLUMN', 'app_users.profile_image_url'),
    ('20260826000000_wallet_reconciliation_alerts',        'TABLE',  'wallet_reconciliation_alerts'),
    ('20260901000000_close_day_recurring_patterns',        'TABLE',  'app_close_day_recurring_patterns'),
    ('20260901000000_game1_jackpot_awards',                'TABLE',  'app_game1_jackpot_awards'),
    ('20260902000000_app_user_pins',                       'TABLE',  'app_user_pins'),
    ('20260902000000_payment_methods',                     'COLUMN', 'swedbank_payment_intents.payment_method'),
    ('20260902000000_swedbank_intent_last_reminded_at',    'COLUMN', 'swedbank_payment_intents.last_reminded_at'),
    ('20260902000000_wallet_entries_hash_chain',           'COLUMN', 'wallet_entries.entry_hash'),
    ('20260910000000_user_2fa_and_session_metadata',       'TABLE',  'app_user_2fa'),
    ('20260926000000_wallet_currency_readiness',           'COLUMN', 'wallet_accounts.currency'),
    ('20260928000000_password_changed_at',                 'COLUMN', 'app_users.password_changed_at'),
    ('20261001000000_ticket_ranges_11_color_palette',      'DATA',   ''),
    ('20261103000000_default_kiosk_products',              'DATA',   ''),
    ('20261110000000_app_halls_is_test_hall',              'COLUMN', 'app_halls.is_test_hall'),
    ('20261115000000_app_ops_alerts',                      'TABLE',  'app_ops_alerts'),
    ('20261120000000_agent_transactions_idempotency',      'COLUMN', 'app_agent_transactions.client_request_id')
)
SELECT
  m.name,
  m.object_kind,
  m.object_qualifier,
  CASE
    WHEN m.object_kind = 'TABLE' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_name = m.object_qualifier
      ) THEN 'YES' ELSE 'NO' END
    WHEN m.object_kind = 'COLUMN' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = split_part(m.object_qualifier, '.', 1)
          AND c.column_name = split_part(m.object_qualifier, '.', 2)
      ) THEN 'YES' ELSE 'NO' END
    WHEN m.object_kind = 'DATA' THEN '(data-only)'
    ELSE '(unknown)'
  END                                                                AS schema_live,
  CASE WHEN EXISTS (
    SELECT 1 FROM pgmigrations p WHERE p.name = m.name
  ) THEN 'YES' ELSE 'NO' END                                         AS registered_in_pgmigrations
FROM migrations m
ORDER BY m.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 5 — Decision summary (the actionable list)
-- ─────────────────────────────────────────────────────────────────────────────

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Section 5: Decision summary'
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Counts by (schema_live, registered) combination — confirms the magnitude'
\echo 'of the divergence and identifies how many rows the fix script needs to add.'
\echo ''

WITH migrations(name, object_kind, object_qualifier) AS (
  -- ⚠️ Keep in lock-step with Section 4 — same VALUES list.
  VALUES
    ('20260413000001_initial_schema',                      'TABLE',  'wallet_accounts'),
    ('20260413000002_max_tickets_30_all_games',            'DATA',   ''),
    ('20260415000001_game_variant_config',                 'COLUMN', 'hall_game_schedules.variant_config'),
    ('20260416000001_multi_hall_linked_draws',             'TABLE',  'app_hall_groups'),
    ('20260417000001_ticket_draw_session_binding',         'COLUMN', 'game_sessions.draw_session_id'),
    ('20260417000002_static_tickets',                      'TABLE',  'app_static_tickets'),
    ('20260417000003_agent_ticket_ranges',                 'TABLE',  'app_agent_ticket_ranges'),
    ('20260417000004_idempotency_records',                 'TABLE',  'app_idempotency_records'),
    ('20260417000005_regulatory_ledger',                   'TABLE',  'app_regulatory_ledger'),
    ('20260417000006_daily_regulatory_reports',            'TABLE',  'app_daily_regulatory_reports'),
    ('20260417000007_user_hall_binding',                   'COLUMN', 'app_users.hall_id'),
    ('20260417000008_draw_session_tickets',                'TABLE',  'app_draw_session_tickets'),
    ('20260417120000_deactivate_game4_temabingo',          'DATA',   ''),
    ('20260418090000_add_hall_client_variant',             'COLUMN', 'app_halls.client_variant'),
    ('20260418130000_chat_messages',                       'TABLE',  'app_chat_messages'),
    ('20260418140000_halls_tv_url',                        'COLUMN', 'app_halls.tv_url'),
    ('20260418150000_hall_display_tokens',                 'TABLE',  'app_hall_display_tokens'),
    ('20260418160000_app_audit_log',                       'TABLE',  'app_audit_log'),
    ('20260418160000_deposit_withdraw_queue',              'TABLE',  'app_deposit_requests'),
    ('20260418170000_user_hall_scope',                     'COLUMN', 'app_users.hall_scope'),
    ('20260418180000_auth_tokens',                         'TABLE',  'app_password_reset_tokens'),
    ('20260418190000_player_lifecycle',                    'TABLE',  'app_player_hall_status'),
    ('20260418200000_aml_red_flags',                       'TABLE',  'app_aml_rules'),
    ('20260418210000_security_admin',                      'TABLE',  'app_withdraw_email_allowlist'),
    ('20260418220000_agent_role_and_profile',              'COLUMN', 'app_users.language'),
    ('20260418220100_agent_halls',                         'TABLE',  'app_agent_halls'),
    ('20260418220200_agent_shifts',                        'TABLE',  'app_agent_shifts'),
    ('20260418220300_audit_log_agent_actor_type',          'DATA',   ''),
    ('20260418230000_physical_tickets',                    'TABLE',  'app_physical_ticket_batches'),
    ('20260418240000_agent_transactions',                  'TABLE',  'app_agent_transactions'),
    ('20260418240000_vouchers',                            'TABLE',  'app_vouchers'),
    ('20260418250000_agent_settlements',                   'TABLE',  'app_agent_settlements'),
    ('20260418250100_shift_settled_at',                    'COLUMN', 'app_agent_shifts.settled_at'),
    ('20260418250200_hall_cash_balance',                   'COLUMN', 'app_halls.cash_balance'),
    ('20260418250300_hall_cash_transactions',              'TABLE',  'app_hall_cash_transactions'),
    ('20260419000000_game_management',                     'TABLE',  'app_game_management'),
    ('20260420000000_products',                            'TABLE',  'app_product_categories'),
    ('20260420000050_agent_tx_product_sale',               'DATA',   ''),
    ('20260420000100_physical_ticket_transfers',           'TABLE',  'app_physical_ticket_transfers'),
    ('20260420100000_machine_tickets',                     'TABLE',  'app_machine_tickets'),
    ('20260420100100_agent_tx_machine_actions',            'DATA',   ''),
    ('20260421000000_hall_manual_adjustments',             'TABLE',  'app_hall_manual_adjustments'),
    ('20260421000100_set_bingo_client_engine_web',         'DATA',   ''),
    ('20260421120000_sub_game_parent_link',                'COLUMN', 'hall_game_schedules.parent_schedule_id'),
    ('20260421130000_purge_legacy_bingo1_no_gameslug',     'DATA',   ''),
    ('20260421140000_payment_request_destination_type',    'COLUMN', 'app_withdraw_requests.destination_type'),
    ('20260422000000_daily_schedules',                     'TABLE',  'app_daily_schedules'),
    ('20260423000000_patterns',                            'TABLE',  'app_patterns'),
    ('20260423000100_halls_tv_token',                      'COLUMN', 'app_halls.tv_token'),
    ('20260424000000_add_game_slug_to_game_sessions',      'COLUMN', 'game_sessions.game_slug'),
    ('20260424000000_hall_groups',                         'TABLE',  'app_hall_groups'),
    ('20260424153706_agent_shift_logout_flags',            'COLUMN', 'app_agent_shifts.distributed_winnings'),
    ('20260425000000_close_day_log',                       'TABLE',  'app_close_day_log'),
    ('20260425000000_game_types',                          'TABLE',  'app_game_types'),
    ('20260425000000_wallet_reservations_numeric',         'DATA',   ''),
    ('20260425000100_sub_games',                           'TABLE',  'app_sub_games'),
    ('20260425000200_saved_games',                         'TABLE',  'app_saved_games'),
    ('20260425000300_schedules',                           'TABLE',  'app_schedules'),
    ('20260425000400_leaderboard_tiers',                   'TABLE',  'app_leaderboard_tiers'),
    ('20260425000500_system_settings_maintenance',         'TABLE',  'app_system_settings'),
    ('20260425000600_mini_games_config',                   'TABLE',  'app_mini_games_config'),
    ('20260425125008_screen_saver_settings',               'TABLE',  'app_screen_saver_images'),
    ('20260426000200_cms',                                 'TABLE',  'app_cms_content'),
    ('20260426120000_chat_moderation',                     'COLUMN', 'app_chat_messages.deleted_at'),
    ('20260427000000_physical_ticket_cashouts',            'TABLE',  'app_physical_ticket_cashouts'),
    ('20260427000000_wallet_outbox',                       'TABLE',  'wallet_outbox'),
    ('20260427000100_physical_ticket_win_data',            'COLUMN', 'app_physical_tickets.numbers_json'),
    ('20260428000000_game1_scheduled_games',               'TABLE',  'app_game1_scheduled_games'),
    ('20260428000100_game1_hall_ready_status',             'TABLE',  'app_game1_hall_ready_status'),
    ('20260428000200_game1_master_audit',                  'TABLE',  'app_game1_master_audit'),
    ('20260428080000_compliance_ledger_idempotency',       'COLUMN', 'app_rg_compliance_ledger.idempotency_key'),
    ('20260429000000_loyalty',                             'TABLE',  'app_loyalty_tiers'),
    ('20260429000100_drop_hall_client_variant',            'DATA',   ''),
    ('20260429074303_compliance_outbox',                   'TABLE',  'app_compliance_outbox'),
    ('20260430000000_app_game1_ticket_purchases',          'TABLE',  'app_game1_ticket_purchases'),
    ('20260430000100_physical_tickets_scheduled_game_fk',  'DATA',   ''),
    ('20260501000000_app_game1_ticket_assignments',        'TABLE',  'app_game1_ticket_assignments'),
    ('20260501000100_app_game1_draws',                     'TABLE',  'app_game1_draws'),
    ('20260501000200_app_game1_game_state',                'TABLE',  'app_game1_game_state'),
    ('20260501000300_app_game1_phase_winners',             'TABLE',  'app_game1_phase_winners'),
    ('20260503000000_game1_hall_scan_data',                'COLUMN', 'app_game1_hall_ready_status.start_ticket_id'),
    ('20260601000000_app_game1_scheduled_games_room_code', 'COLUMN', 'app_game1_scheduled_games.room_code'),
    ('20260605000000_app_game1_scheduled_games_game_config','COLUMN','app_game1_scheduled_games.game_config_json'),
    ('20260606000000_app_game1_mini_game_results',         'TABLE',  'app_game1_mini_game_results'),
    ('20260606000000_static_tickets_pt1_extensions',       'COLUMN', 'app_static_tickets.sold_by_user_id'),
    ('20260606000000_wallet_split_deposit_winnings',       'COLUMN', 'wallet_accounts.deposit_balance'),
    ('20260607000000_agent_ticket_ranges_pt2_extensions',  'COLUMN', 'app_agent_ticket_ranges.current_top_serial'),
    ('20260608000000_physical_ticket_pending_payouts',     'TABLE',  'app_physical_ticket_pending_payouts'),
    ('20260609000000_game1_oddsen_state',                  'TABLE',  'app_game1_oddsen_state'),
    ('20260610000000_agent_ticket_ranges_pt5_extensions',  'COLUMN', 'app_agent_ticket_ranges.handed_off_to_range_id'),
    ('20260611000000_game1_accumulating_pots',             'TABLE',  'app_game1_pot_events'),
    ('20260700000000_cms_content_versions',                'TABLE',  'app_cms_content_versions'),
    ('20260701000000_hall_number',                         'COLUMN', 'app_halls.hall_number'),
    ('20260705000000_agent_permissions',                   'TABLE',  'app_agent_permissions'),
    ('20260706000000_app_notifications_and_devices',       'TABLE',  'app_user_devices'),
    ('20260723000000_voucher_redemptions',                 'TABLE',  'app_voucher_redemptions'),
    ('20260724000000_game1_mini_game_mystery',             'DATA',   ''),
    ('20260724001000_app_unique_ids',                      'TABLE',  'app_unique_ids'),
    ('20260724100000_wallet_reservations',                 'TABLE',  'app_wallet_reservations'),
    ('20260725000000_settlement_machine_breakdown',        'COLUMN', 'app_agent_settlements.machine_breakdown'),
    ('20260726000000_game1_auto_pause_on_phase',           'COLUMN', 'app_game1_game_state.paused_at_phase'),
    ('20260726000000_settlement_breakdown_k1b_fields',     'DATA',   ''),
    ('20260726100000_ticket_ranges_per_game',              'TABLE',  'app_ticket_ranges_per_game'),
    ('20260727000000_game1_master_transfer_requests',      'TABLE',  'app_game1_master_transfer_requests'),
    ('20260727000001_game1_master_audit_add_transfer_actions', 'DATA', ''),
    ('20260810000000_withdraw_requests_bank_export',       'COLUMN', 'app_withdraw_requests.bank_account_number'),
    ('20260810000100_xml_export_batches',                  'TABLE',  'app_xml_export_batches'),
    ('20260811000000_halls_tv_voice_selection',            'COLUMN', 'app_halls.tv_voice_selection'),
    ('20260820000000_user_profile_settings',               'TABLE',  'app_user_profile_settings'),
    ('20260821000000_game1_jackpot_state',                 'TABLE',  'app_game1_jackpot_state'),
    ('20260825000000_close_day_log_3case',                 'COLUMN', 'app_close_day_log.start_time'),
    ('20260825000000_player_profile_images',               'COLUMN', 'app_users.profile_image_url'),
    ('20260826000000_wallet_reconciliation_alerts',        'TABLE',  'wallet_reconciliation_alerts'),
    ('20260901000000_close_day_recurring_patterns',        'TABLE',  'app_close_day_recurring_patterns'),
    ('20260901000000_game1_jackpot_awards',                'TABLE',  'app_game1_jackpot_awards'),
    ('20260902000000_app_user_pins',                       'TABLE',  'app_user_pins'),
    ('20260902000000_payment_methods',                     'COLUMN', 'swedbank_payment_intents.payment_method'),
    ('20260902000000_swedbank_intent_last_reminded_at',    'COLUMN', 'swedbank_payment_intents.last_reminded_at'),
    ('20260902000000_wallet_entries_hash_chain',           'COLUMN', 'wallet_entries.entry_hash'),
    ('20260910000000_user_2fa_and_session_metadata',       'TABLE',  'app_user_2fa'),
    ('20260926000000_wallet_currency_readiness',           'COLUMN', 'wallet_accounts.currency'),
    ('20260928000000_password_changed_at',                 'COLUMN', 'app_users.password_changed_at'),
    ('20261001000000_ticket_ranges_11_color_palette',      'DATA',   ''),
    ('20261103000000_default_kiosk_products',              'DATA',   ''),
    ('20261110000000_app_halls_is_test_hall',              'COLUMN', 'app_halls.is_test_hall'),
    ('20261115000000_app_ops_alerts',                      'TABLE',  'app_ops_alerts'),
    ('20261120000000_agent_transactions_idempotency',      'COLUMN', 'app_agent_transactions.client_request_id')
), classified AS (
  SELECT
    m.name,
    m.object_kind,
    CASE
      WHEN m.object_kind = 'DATA' THEN '(data-only)'
      WHEN m.object_kind = 'TABLE' AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_name = m.object_qualifier
      ) THEN 'YES'
      WHEN m.object_kind = 'COLUMN' AND EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = split_part(m.object_qualifier, '.', 1)
          AND c.column_name = split_part(m.object_qualifier, '.', 2)
      ) THEN 'YES'
      ELSE 'NO'
    END AS schema_live,
    CASE WHEN EXISTS (
      SELECT 1 FROM pgmigrations p WHERE p.name = m.name
    ) THEN 'YES' ELSE 'NO' END AS registered
  FROM migrations m
)
SELECT
  schema_live,
  registered,
  count(*) AS migrations,
  array_agg(name ORDER BY name) AS migration_names
FROM classified
GROUP BY schema_live, registered
ORDER BY schema_live, registered;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 6 — INSERT-INTO-pgmigrations preview (what the fix script would do)
-- ─────────────────────────────────────────────────────────────────────────────

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Section 6: Preview of safe INSERT INTO pgmigrations rows'
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'These are the migration names where:'
\echo '  - the schema effect is already live in prod (schema_live=YES)'
\echo '  - the migration is NOT yet in pgmigrations (registered=NO)'
\echo 'These are SAFE to register: no schema is mutated, only the run-log catches up.'
\echo ''
\echo 'For DATA-only migrations (DATA-only do not produce schema effects to probe),'
\echo 'manual judgement is required — they are listed separately below.'
\echo ''

WITH migrations(name, object_kind, object_qualifier) AS (
  -- ⚠️ Keep in lock-step with Section 4 — same VALUES list.
  VALUES
    ('20260413000001_initial_schema',                      'TABLE',  'wallet_accounts'),
    ('20260413000002_max_tickets_30_all_games',            'DATA',   ''),
    ('20260415000001_game_variant_config',                 'COLUMN', 'hall_game_schedules.variant_config'),
    ('20260416000001_multi_hall_linked_draws',             'TABLE',  'app_hall_groups'),
    ('20260417000001_ticket_draw_session_binding',         'COLUMN', 'game_sessions.draw_session_id'),
    ('20260417000002_static_tickets',                      'TABLE',  'app_static_tickets'),
    ('20260417000003_agent_ticket_ranges',                 'TABLE',  'app_agent_ticket_ranges'),
    ('20260417000004_idempotency_records',                 'TABLE',  'app_idempotency_records'),
    ('20260417000005_regulatory_ledger',                   'TABLE',  'app_regulatory_ledger'),
    ('20260417000006_daily_regulatory_reports',            'TABLE',  'app_daily_regulatory_reports'),
    ('20260417000007_user_hall_binding',                   'COLUMN', 'app_users.hall_id'),
    ('20260417000008_draw_session_tickets',                'TABLE',  'app_draw_session_tickets'),
    ('20260417120000_deactivate_game4_temabingo',          'DATA',   ''),
    ('20260418090000_add_hall_client_variant',             'COLUMN', 'app_halls.client_variant'),
    ('20260418130000_chat_messages',                       'TABLE',  'app_chat_messages'),
    ('20260418140000_halls_tv_url',                        'COLUMN', 'app_halls.tv_url'),
    ('20260418150000_hall_display_tokens',                 'TABLE',  'app_hall_display_tokens'),
    ('20260418160000_app_audit_log',                       'TABLE',  'app_audit_log'),
    ('20260418160000_deposit_withdraw_queue',              'TABLE',  'app_deposit_requests'),
    ('20260418170000_user_hall_scope',                     'COLUMN', 'app_users.hall_scope'),
    ('20260418180000_auth_tokens',                         'TABLE',  'app_password_reset_tokens'),
    ('20260418190000_player_lifecycle',                    'TABLE',  'app_player_hall_status'),
    ('20260418200000_aml_red_flags',                       'TABLE',  'app_aml_rules'),
    ('20260418210000_security_admin',                      'TABLE',  'app_withdraw_email_allowlist'),
    ('20260418220000_agent_role_and_profile',              'COLUMN', 'app_users.language'),
    ('20260418220100_agent_halls',                         'TABLE',  'app_agent_halls'),
    ('20260418220200_agent_shifts',                        'TABLE',  'app_agent_shifts'),
    ('20260418220300_audit_log_agent_actor_type',          'DATA',   ''),
    ('20260418230000_physical_tickets',                    'TABLE',  'app_physical_ticket_batches'),
    ('20260418240000_agent_transactions',                  'TABLE',  'app_agent_transactions'),
    ('20260418240000_vouchers',                            'TABLE',  'app_vouchers'),
    ('20260418250000_agent_settlements',                   'TABLE',  'app_agent_settlements'),
    ('20260418250100_shift_settled_at',                    'COLUMN', 'app_agent_shifts.settled_at'),
    ('20260418250200_hall_cash_balance',                   'COLUMN', 'app_halls.cash_balance'),
    ('20260418250300_hall_cash_transactions',              'TABLE',  'app_hall_cash_transactions'),
    ('20260419000000_game_management',                     'TABLE',  'app_game_management'),
    ('20260420000000_products',                            'TABLE',  'app_product_categories'),
    ('20260420000050_agent_tx_product_sale',               'DATA',   ''),
    ('20260420000100_physical_ticket_transfers',           'TABLE',  'app_physical_ticket_transfers'),
    ('20260420100000_machine_tickets',                     'TABLE',  'app_machine_tickets'),
    ('20260420100100_agent_tx_machine_actions',            'DATA',   ''),
    ('20260421000000_hall_manual_adjustments',             'TABLE',  'app_hall_manual_adjustments'),
    ('20260421000100_set_bingo_client_engine_web',         'DATA',   ''),
    ('20260421120000_sub_game_parent_link',                'COLUMN', 'hall_game_schedules.parent_schedule_id'),
    ('20260421130000_purge_legacy_bingo1_no_gameslug',     'DATA',   ''),
    ('20260421140000_payment_request_destination_type',    'COLUMN', 'app_withdraw_requests.destination_type'),
    ('20260422000000_daily_schedules',                     'TABLE',  'app_daily_schedules'),
    ('20260423000000_patterns',                            'TABLE',  'app_patterns'),
    ('20260423000100_halls_tv_token',                      'COLUMN', 'app_halls.tv_token'),
    ('20260424000000_add_game_slug_to_game_sessions',      'COLUMN', 'game_sessions.game_slug'),
    ('20260424000000_hall_groups',                         'TABLE',  'app_hall_groups'),
    ('20260424153706_agent_shift_logout_flags',            'COLUMN', 'app_agent_shifts.distributed_winnings'),
    ('20260425000000_close_day_log',                       'TABLE',  'app_close_day_log'),
    ('20260425000000_game_types',                          'TABLE',  'app_game_types'),
    ('20260425000000_wallet_reservations_numeric',         'DATA',   ''),
    ('20260425000100_sub_games',                           'TABLE',  'app_sub_games'),
    ('20260425000200_saved_games',                         'TABLE',  'app_saved_games'),
    ('20260425000300_schedules',                           'TABLE',  'app_schedules'),
    ('20260425000400_leaderboard_tiers',                   'TABLE',  'app_leaderboard_tiers'),
    ('20260425000500_system_settings_maintenance',         'TABLE',  'app_system_settings'),
    ('20260425000600_mini_games_config',                   'TABLE',  'app_mini_games_config'),
    ('20260425125008_screen_saver_settings',               'TABLE',  'app_screen_saver_images'),
    ('20260426000200_cms',                                 'TABLE',  'app_cms_content'),
    ('20260426120000_chat_moderation',                     'COLUMN', 'app_chat_messages.deleted_at'),
    ('20260427000000_physical_ticket_cashouts',            'TABLE',  'app_physical_ticket_cashouts'),
    ('20260427000000_wallet_outbox',                       'TABLE',  'wallet_outbox'),
    ('20260427000100_physical_ticket_win_data',            'COLUMN', 'app_physical_tickets.numbers_json'),
    ('20260428000000_game1_scheduled_games',               'TABLE',  'app_game1_scheduled_games'),
    ('20260428000100_game1_hall_ready_status',             'TABLE',  'app_game1_hall_ready_status'),
    ('20260428000200_game1_master_audit',                  'TABLE',  'app_game1_master_audit'),
    ('20260428080000_compliance_ledger_idempotency',       'COLUMN', 'app_rg_compliance_ledger.idempotency_key'),
    ('20260429000000_loyalty',                             'TABLE',  'app_loyalty_tiers'),
    ('20260429000100_drop_hall_client_variant',            'DATA',   ''),
    ('20260429074303_compliance_outbox',                   'TABLE',  'app_compliance_outbox'),
    ('20260430000000_app_game1_ticket_purchases',          'TABLE',  'app_game1_ticket_purchases'),
    ('20260430000100_physical_tickets_scheduled_game_fk',  'DATA',   ''),
    ('20260501000000_app_game1_ticket_assignments',        'TABLE',  'app_game1_ticket_assignments'),
    ('20260501000100_app_game1_draws',                     'TABLE',  'app_game1_draws'),
    ('20260501000200_app_game1_game_state',                'TABLE',  'app_game1_game_state'),
    ('20260501000300_app_game1_phase_winners',             'TABLE',  'app_game1_phase_winners'),
    ('20260503000000_game1_hall_scan_data',                'COLUMN', 'app_game1_hall_ready_status.start_ticket_id'),
    ('20260601000000_app_game1_scheduled_games_room_code', 'COLUMN', 'app_game1_scheduled_games.room_code'),
    ('20260605000000_app_game1_scheduled_games_game_config','COLUMN','app_game1_scheduled_games.game_config_json'),
    ('20260606000000_app_game1_mini_game_results',         'TABLE',  'app_game1_mini_game_results'),
    ('20260606000000_static_tickets_pt1_extensions',       'COLUMN', 'app_static_tickets.sold_by_user_id'),
    ('20260606000000_wallet_split_deposit_winnings',       'COLUMN', 'wallet_accounts.deposit_balance'),
    ('20260607000000_agent_ticket_ranges_pt2_extensions',  'COLUMN', 'app_agent_ticket_ranges.current_top_serial'),
    ('20260608000000_physical_ticket_pending_payouts',     'TABLE',  'app_physical_ticket_pending_payouts'),
    ('20260609000000_game1_oddsen_state',                  'TABLE',  'app_game1_oddsen_state'),
    ('20260610000000_agent_ticket_ranges_pt5_extensions',  'COLUMN', 'app_agent_ticket_ranges.handed_off_to_range_id'),
    ('20260611000000_game1_accumulating_pots',             'TABLE',  'app_game1_pot_events'),
    ('20260700000000_cms_content_versions',                'TABLE',  'app_cms_content_versions'),
    ('20260701000000_hall_number',                         'COLUMN', 'app_halls.hall_number'),
    ('20260705000000_agent_permissions',                   'TABLE',  'app_agent_permissions'),
    ('20260706000000_app_notifications_and_devices',       'TABLE',  'app_user_devices'),
    ('20260723000000_voucher_redemptions',                 'TABLE',  'app_voucher_redemptions'),
    ('20260724000000_game1_mini_game_mystery',             'DATA',   ''),
    ('20260724001000_app_unique_ids',                      'TABLE',  'app_unique_ids'),
    ('20260724100000_wallet_reservations',                 'TABLE',  'app_wallet_reservations'),
    ('20260725000000_settlement_machine_breakdown',        'COLUMN', 'app_agent_settlements.machine_breakdown'),
    ('20260726000000_game1_auto_pause_on_phase',           'COLUMN', 'app_game1_game_state.paused_at_phase'),
    ('20260726000000_settlement_breakdown_k1b_fields',     'DATA',   ''),
    ('20260726100000_ticket_ranges_per_game',              'TABLE',  'app_ticket_ranges_per_game'),
    ('20260727000000_game1_master_transfer_requests',      'TABLE',  'app_game1_master_transfer_requests'),
    ('20260727000001_game1_master_audit_add_transfer_actions', 'DATA', ''),
    ('20260810000000_withdraw_requests_bank_export',       'COLUMN', 'app_withdraw_requests.bank_account_number'),
    ('20260810000100_xml_export_batches',                  'TABLE',  'app_xml_export_batches'),
    ('20260811000000_halls_tv_voice_selection',            'COLUMN', 'app_halls.tv_voice_selection'),
    ('20260820000000_user_profile_settings',               'TABLE',  'app_user_profile_settings'),
    ('20260821000000_game1_jackpot_state',                 'TABLE',  'app_game1_jackpot_state'),
    ('20260825000000_close_day_log_3case',                 'COLUMN', 'app_close_day_log.start_time'),
    ('20260825000000_player_profile_images',               'COLUMN', 'app_users.profile_image_url'),
    ('20260826000000_wallet_reconciliation_alerts',        'TABLE',  'wallet_reconciliation_alerts'),
    ('20260901000000_close_day_recurring_patterns',        'TABLE',  'app_close_day_recurring_patterns'),
    ('20260901000000_game1_jackpot_awards',                'TABLE',  'app_game1_jackpot_awards'),
    ('20260902000000_app_user_pins',                       'TABLE',  'app_user_pins'),
    ('20260902000000_payment_methods',                     'COLUMN', 'swedbank_payment_intents.payment_method'),
    ('20260902000000_swedbank_intent_last_reminded_at',    'COLUMN', 'swedbank_payment_intents.last_reminded_at'),
    ('20260902000000_wallet_entries_hash_chain',           'COLUMN', 'wallet_entries.entry_hash'),
    ('20260910000000_user_2fa_and_session_metadata',       'TABLE',  'app_user_2fa'),
    ('20260926000000_wallet_currency_readiness',           'COLUMN', 'wallet_accounts.currency'),
    ('20260928000000_password_changed_at',                 'COLUMN', 'app_users.password_changed_at'),
    ('20261001000000_ticket_ranges_11_color_palette',      'DATA',   ''),
    ('20261103000000_default_kiosk_products',              'DATA',   ''),
    ('20261110000000_app_halls_is_test_hall',              'COLUMN', 'app_halls.is_test_hall'),
    ('20261115000000_app_ops_alerts',                      'TABLE',  'app_ops_alerts'),
    ('20261120000000_agent_transactions_idempotency',      'COLUMN', 'app_agent_transactions.client_request_id')
)
SELECT
  m.name AS register_this,
  m.object_kind,
  m.object_qualifier
FROM migrations m
WHERE
  -- not already registered
  NOT EXISTS (SELECT 1 FROM pgmigrations p WHERE p.name = m.name)
  AND (
    -- TABLE: target table exists
    (m.object_kind = 'TABLE' AND EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = m.object_qualifier
    ))
    -- COLUMN: target column exists on target table
    OR (m.object_kind = 'COLUMN' AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = split_part(m.object_qualifier, '.', 1)
        AND c.column_name = split_part(m.object_qualifier, '.', 2)
    ))
  )
ORDER BY m.name;

\echo ''
\echo 'DATA-ONLY migrations not in pgmigrations (manual judgement required —'
\echo 'these have no schema fingerprint, so we cannot probe whether the data'
\echo 'change is already applied. Inspect the .sql file and verify the data'
\echo 'state directly before deciding to register).'
\echo ''

WITH migrations(name, object_kind) AS (
  VALUES
    ('20260413000002_max_tickets_30_all_games', 'DATA'),
    ('20260417120000_deactivate_game4_temabingo', 'DATA'),
    ('20260418220300_audit_log_agent_actor_type', 'DATA'),
    ('20260420000050_agent_tx_product_sale', 'DATA'),
    ('20260420100100_agent_tx_machine_actions', 'DATA'),
    ('20260421000100_set_bingo_client_engine_web', 'DATA'),
    ('20260421130000_purge_legacy_bingo1_no_gameslug', 'DATA'),
    ('20260425000000_wallet_reservations_numeric', 'DATA'),
    ('20260429000100_drop_hall_client_variant', 'DATA'),
    ('20260430000100_physical_tickets_scheduled_game_fk', 'DATA'),
    ('20260724000000_game1_mini_game_mystery', 'DATA'),
    ('20260726000000_settlement_breakdown_k1b_fields', 'DATA'),
    ('20260727000001_game1_master_audit_add_transfer_actions', 'DATA'),
    ('20261001000000_ticket_ranges_11_color_palette', 'DATA'),
    ('20261103000000_default_kiosk_products', 'DATA')
)
SELECT m.name
FROM migrations m
WHERE NOT EXISTS (SELECT 1 FROM pgmigrations p WHERE p.name = m.name)
ORDER BY m.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 7 — Confirm orphan tables from DATABASE_AUDIT_2026-04-28.md (DB-P2-1)
-- ─────────────────────────────────────────────────────────────────────────────

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Section 7: Orphan tables from BIN-515 multi-hall design (DB-P2-1)'
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'These tables were created by 20260416000001_multi_hall_linked_draws and'
\echo '20260417000008_draw_session_tickets. They exist on prod (per audit)'
\echo 'but have no live producer code. Confirming their presence here also'
\echo 'confirms that 20260416000001 + 20260417000008 are "schema-live but'
\echo 'unregistered" — the original failure cause.'
\echo ''

SELECT
  table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_name = ot.table_name
  ) THEN 'EXISTS' ELSE 'MISSING' END AS state
FROM (VALUES
  ('app_hall_groups'),
  ('app_draw_sessions'),
  ('app_draw_session_halls'),
  ('app_draw_session_events'),
  ('app_draw_session_tickets')
) AS ot(table_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- Section 8 — Sanity: are there registered migrations whose file is missing?
-- ─────────────────────────────────────────────────────────────────────────────
-- This catches the dangerous reverse case: pgmigrations has a name that
-- doesn't exist on disk anymore — would mean someone deleted a migration
-- file. node-pg-migrate would not fail on this directly, but it's a red flag.

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Section 8: pgmigrations names that look like timestamp_* but might be'
\echo '         missing from disk — manual cross-check vs.'
\echo '         apps/backend/migrations/<name>.sql is required.'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT
  name,
  run_on
FROM pgmigrations
WHERE name ~ '^[0-9]{14}_'
ORDER BY name;

-- ─────────────────────────────────────────────────────────────────────────────
-- End of inspection
-- ─────────────────────────────────────────────────────────────────────────────

\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo 'Inspection complete. ROLLBACK below ensures NOTHING was changed.'
\echo '═══════════════════════════════════════════════════════════════════════════'

ROLLBACK;
