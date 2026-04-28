/**
 * BIN-583 B3.2: Postgres access layer for app_agent_transactions.
 *
 * Append-only by design — no update/delete APIs exposed. Corrections
 * are made via counter-transactions (new rows with related_tx_id
 * pointing to the original). Mirrors wallet_transactions semantics.
 */

import type { Pool, PoolClient } from "pg";

export type ActionType =
  | "CASH_IN"
  | "CASH_OUT"
  | "TICKET_SALE"
  | "TICKET_REGISTER"
  | "TICKET_CANCEL"
  | "PRODUCT_SALE"
  | "MACHINE_CREATE"
  | "MACHINE_TOPUP"
  | "MACHINE_CLOSE"
  | "MACHINE_VOID"
  | "FEE"
  | "OTHER";

export type PaymentMethod = "CASH" | "CARD" | "WALLET";
export type WalletDirection = "CREDIT" | "DEBIT";

export interface AgentTransaction {
  id: string;
  shiftId: string;
  agentUserId: string;
  playerUserId: string;
  hallId: string;
  actionType: ActionType;
  walletDirection: WalletDirection;
  paymentMethod: PaymentMethod;
  amount: number;
  previousBalance: number;
  afterBalance: number;
  walletTxId: string | null;
  ticketUniqueId: string | null;
  externalReference: string | null;
  notes: string | null;
  otherData: Record<string, unknown>;
  relatedTxId: string | null;
  /**
   * BIN-PILOT-K1 (Code Review #1 P0-1): client-supplied retry-key som
   * matcher partial unique-index på `(agent_user_id, player_user_id,
   * client_request_id)`. Brukes av service-laget for å detektere retry
   * og hoppe over shift-cash-delta-replay.
   */
  clientRequestId: string | null;
  createdAt: string;
}

export interface InsertAgentTransactionInput {
  id: string;
  shiftId: string;
  agentUserId: string;
  playerUserId: string;
  hallId: string;
  actionType: ActionType;
  walletDirection: WalletDirection;
  paymentMethod: PaymentMethod;
  amount: number;
  previousBalance: number;
  afterBalance: number;
  walletTxId?: string | null;
  ticketUniqueId?: string | null;
  externalReference?: string | null;
  notes?: string | null;
  otherData?: Record<string, unknown>;
  relatedTxId?: string | null;
  /**
   * BIN-PILOT-K1: client-supplied retry-key som gjør INSERT idempotent
   * via partial unique-index `idx_app_agent_transactions_idempotency`.
   * Bruk `insertIdempotent()` for retry-safe INSERT som returnerer
   * eksisterende rad ved konflikt.
   */
  clientRequestId?: string | null;
}

/**
 * BIN-PILOT-K1: resultat fra `insertIdempotent`. `created=true` betyr at
 * raden ble opprettet i dette kallet (service-lag MÅ deretter applye
 * shift-cash-delta atomisk i samme transaksjon). `created=false` betyr at
 * en eksisterende rad ble funnet via client_request_id-konflikt — caller
 * skal IKKE applye delta på nytt.
 */
export interface InsertIdempotentResult {
  created: boolean;
  row: AgentTransaction;
}

export interface ListFilter {
  shiftId?: string;
  agentUserId?: string;
  playerUserId?: string;
  hallId?: string;
  actionType?: ActionType;
  limit?: number;
  offset?: number;
  since?: string;
}

export interface ShiftAggregate {
  cashIn: number;
  cashOut: number;
  cardIn: number;
  cardOut: number;
  walletIn: number;
  walletOut: number;
  ticketSaleCount: number;
  ticketCancelCount: number;
}

export interface AgentTransactionStore {
  insert(input: InsertAgentTransactionInput, client?: PoolClient): Promise<AgentTransaction>;
  /**
   * BIN-PILOT-K1: idempotent INSERT — bruker `ON CONFLICT
   * (agent_user_id, player_user_id, client_request_id) DO NOTHING`.
   *
   * - `created=true`: ny rad. Caller MÅ applye shift-cash-delta i samme tx.
   * - `created=false`: eksisterende rad ble funnet (retry-detect). Caller
   *    skal IKKE applye delta — det skjedde i forrige fullførte kall.
   *
   * Krever at `input.clientRequestId` er satt — kaster `Error` hvis null.
   * Optional `client` lar caller binde dette til samme transaksjon som
   * `agentStore.applyShiftCashDelta(... , client)`.
   */
  insertIdempotent(
    input: InsertAgentTransactionInput,
    client?: PoolClient,
  ): Promise<InsertIdempotentResult>;
  /**
   * BIN-PILOT-K1: oppslag på partial unique-index. Returnerer eksisterende
   * rad hvis (agent, player, clientRequestId) finnes.
   */
  findByClientRequestId(
    agentUserId: string,
    playerUserId: string,
    clientRequestId: string,
  ): Promise<AgentTransaction | null>;
  getById(id: string): Promise<AgentTransaction | null>;
  list(filter: ListFilter): Promise<AgentTransaction[]>;
  findSaleByTicketUniqueId(ticketUniqueId: string): Promise<AgentTransaction | null>;
  findCancelForTx(relatedTxId: string): Promise<AgentTransaction | null>;

  /**
   * BIN-583 B3.3: aggregér transaksjoner per shift for settlement-rapport.
   * Counter-rader (TICKET_CANCEL med related_tx_id) trekkes fra de
   * tilsvarende sale-radene slik at netto-totalsummene matcher faktisk
   * cash-flow.
   */
  aggregateByShift(shiftId: string): Promise<ShiftAggregate>;
}

// ── Postgres implementation ─────────────────────────────────────────────────

interface Row {
  id: string;
  shift_id: string;
  agent_user_id: string;
  player_user_id: string;
  hall_id: string;
  action_type: ActionType;
  wallet_direction: WalletDirection;
  payment_method: PaymentMethod;
  amount: string | number;
  previous_balance: string | number;
  after_balance: string | number;
  wallet_tx_id: string | null;
  ticket_unique_id: string | null;
  external_reference: string | null;
  notes: string | null;
  other_data: unknown;
  related_tx_id: string | null;
  client_request_id: string | null;
  created_at: Date | string;
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export interface PostgresAgentTransactionStoreOptions {
  pool: Pool;
  schema?: string;
}

export class PostgresAgentTransactionStore implements AgentTransactionStore {
  private readonly pool: Pool;
  private readonly tableName: string;

  constructor(options: PostgresAgentTransactionStoreOptions) {
    this.pool = options.pool;
    const schema = (options.schema ?? "public").replace(/[^a-zA-Z0-9_]/g, "");
    this.tableName = `"${schema}"."app_agent_transactions"`;
  }

  async insert(input: InsertAgentTransactionInput, client?: PoolClient): Promise<AgentTransaction> {
    const exec = client ?? this.pool;
    const { rows } = await exec.query<Row>(
      `INSERT INTO ${this.tableName}
        (id, shift_id, agent_user_id, player_user_id, hall_id, action_type,
         wallet_direction, payment_method, amount, previous_balance, after_balance,
         wallet_tx_id, ticket_unique_id, external_reference, notes, other_data, related_tx_id,
         client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18)
       RETURNING *`,
      [
        input.id,
        input.shiftId,
        input.agentUserId,
        input.playerUserId,
        input.hallId,
        input.actionType,
        input.walletDirection,
        input.paymentMethod,
        input.amount,
        input.previousBalance,
        input.afterBalance,
        input.walletTxId ?? null,
        input.ticketUniqueId ?? null,
        input.externalReference ?? null,
        input.notes ?? null,
        JSON.stringify(input.otherData ?? {}),
        input.relatedTxId ?? null,
        input.clientRequestId ?? null,
      ]
    );
    return this.map(rows[0]!);
  }

  /**
   * BIN-PILOT-K1: idempotent INSERT med ON CONFLICT DO NOTHING.
   * Returnerer `{ created: true, row }` ved nytt INSERT, eller
   * `{ created: false, row }` ved konflikt (eksisterende rad).
   */
  async insertIdempotent(
    input: InsertAgentTransactionInput,
    client?: PoolClient,
  ): Promise<InsertIdempotentResult> {
    if (!input.clientRequestId) {
      throw new Error(
        "[BIN-PILOT-K1] insertIdempotent krever clientRequestId — bruk insert() for non-idempotent inserts."
      );
    }
    const exec = client ?? this.pool;
    const { rows } = await exec.query<Row>(
      `INSERT INTO ${this.tableName}
        (id, shift_id, agent_user_id, player_user_id, hall_id, action_type,
         wallet_direction, payment_method, amount, previous_balance, after_balance,
         wallet_tx_id, ticket_unique_id, external_reference, notes, other_data, related_tx_id,
         client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18)
       ON CONFLICT (agent_user_id, player_user_id, client_request_id)
         WHERE client_request_id IS NOT NULL
         DO NOTHING
       RETURNING *`,
      [
        input.id,
        input.shiftId,
        input.agentUserId,
        input.playerUserId,
        input.hallId,
        input.actionType,
        input.walletDirection,
        input.paymentMethod,
        input.amount,
        input.previousBalance,
        input.afterBalance,
        input.walletTxId ?? null,
        input.ticketUniqueId ?? null,
        input.externalReference ?? null,
        input.notes ?? null,
        JSON.stringify(input.otherData ?? {}),
        input.relatedTxId ?? null,
        input.clientRequestId,
      ]
    );
    if (rows[0]) {
      return { created: true, row: this.map(rows[0]) };
    }
    // ON CONFLICT triggered — fetch existing via samme exec så vi ser raden
    // uavhengig av COMMIT-status fra parallelle/originale transaksjoner.
    const { rows: existingRows } = await exec.query<Row>(
      `SELECT * FROM ${this.tableName}
       WHERE agent_user_id = $1 AND player_user_id = $2 AND client_request_id = $3
       LIMIT 1`,
      [input.agentUserId, input.playerUserId, input.clientRequestId]
    );
    if (!existingRows[0]) {
      throw new Error(
        "[BIN-PILOT-K1] insertIdempotent: ON CONFLICT triggered but row not found — race condition?"
      );
    }
    return { created: false, row: this.map(existingRows[0]) };
  }

  async findByClientRequestId(
    agentUserId: string,
    playerUserId: string,
    clientRequestId: string,
  ): Promise<AgentTransaction | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM ${this.tableName}
       WHERE agent_user_id = $1 AND player_user_id = $2 AND client_request_id = $3
       LIMIT 1`,
      [agentUserId, playerUserId, clientRequestId]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async getById(id: string): Promise<AgentTransaction | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async list(filter: ListFilter): Promise<AgentTransaction[]> {
    const limit = Math.max(1, Math.min(500, Math.floor(filter.limit ?? 100)));
    const offset = Math.max(0, Math.floor(filter.offset ?? 0));
    const where: string[] = [];
    const params: unknown[] = [];
    function addWhere(col: string, value: unknown): void {
      params.push(value);
      where.push(`${col} = $${params.length}`);
    }
    if (filter.shiftId) addWhere("shift_id", filter.shiftId);
    if (filter.agentUserId) addWhere("agent_user_id", filter.agentUserId);
    if (filter.playerUserId) addWhere("player_user_id", filter.playerUserId);
    if (filter.hallId) addWhere("hall_id", filter.hallId);
    if (filter.actionType) addWhere("action_type", filter.actionType);
    if (filter.since) {
      params.push(filter.since);
      where.push(`created_at >= $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM ${this.tableName}
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    return rows.map((r) => this.map(r));
  }

  async findSaleByTicketUniqueId(ticketUniqueId: string): Promise<AgentTransaction | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM ${this.tableName}
       WHERE ticket_unique_id = $1 AND action_type = 'TICKET_SALE'
       LIMIT 1`,
      [ticketUniqueId]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findCancelForTx(relatedTxId: string): Promise<AgentTransaction | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM ${this.tableName}
       WHERE related_tx_id = $1 AND action_type = 'TICKET_CANCEL'
       LIMIT 1`,
      [relatedTxId]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async aggregateByShift(shiftId: string): Promise<ShiftAggregate> {
    const all = await this.list({ shiftId, limit: 500 });
    return aggregateRows(all);
  }

  private map(row: Row): AgentTransaction {
    return {
      id: row.id,
      shiftId: row.shift_id,
      agentUserId: row.agent_user_id,
      playerUserId: row.player_user_id,
      hallId: row.hall_id,
      actionType: row.action_type,
      walletDirection: row.wallet_direction,
      paymentMethod: row.payment_method,
      amount: asNumber(row.amount),
      previousBalance: asNumber(row.previous_balance),
      afterBalance: asNumber(row.after_balance),
      walletTxId: row.wallet_tx_id,
      ticketUniqueId: row.ticket_unique_id,
      externalReference: row.external_reference,
      notes: row.notes,
      otherData: asJsonObject(row.other_data),
      relatedTxId: row.related_tx_id,
      clientRequestId: row.client_request_id,
      createdAt: asIso(row.created_at)
    };
  }
}

// ── In-memory implementation (tests) ────────────────────────────────────────

export class InMemoryAgentTransactionStore implements AgentTransactionStore {
  private readonly rows: AgentTransaction[] = [];

  async insert(input: InsertAgentTransactionInput): Promise<AgentTransaction> {
    // Enforce partial unique-index: one SALE per ticketUniqueId.
    if (input.actionType === "TICKET_SALE" && input.ticketUniqueId) {
      const existing = this.rows.find(
        (r) => r.actionType === "TICKET_SALE" && r.ticketUniqueId === input.ticketUniqueId
      );
      if (existing) {
        // Mirror Postgres unique-violation code 23505 behaviour.
        throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      }
    }
    // BIN-PILOT-K1: enforce partial unique-index på client_request_id når satt.
    if (input.clientRequestId) {
      const dup = this.rows.find(
        (r) =>
          r.agentUserId === input.agentUserId
          && r.playerUserId === input.playerUserId
          && r.clientRequestId === input.clientRequestId
      );
      if (dup) {
        throw Object.assign(
          new Error("duplicate key value violates unique constraint"),
          { code: "23505" }
        );
      }
    }
    const row: AgentTransaction = {
      id: input.id,
      shiftId: input.shiftId,
      agentUserId: input.agentUserId,
      playerUserId: input.playerUserId,
      hallId: input.hallId,
      actionType: input.actionType,
      walletDirection: input.walletDirection,
      paymentMethod: input.paymentMethod,
      amount: input.amount,
      previousBalance: input.previousBalance,
      afterBalance: input.afterBalance,
      walletTxId: input.walletTxId ?? null,
      ticketUniqueId: input.ticketUniqueId ?? null,
      externalReference: input.externalReference ?? null,
      notes: input.notes ?? null,
      otherData: input.otherData ?? {},
      relatedTxId: input.relatedTxId ?? null,
      clientRequestId: input.clientRequestId ?? null,
      createdAt: new Date().toISOString()
    };
    this.rows.push(row);
    return { ...row };
  }

  /**
   * BIN-PILOT-K1: in-memory mirror av Postgres ON CONFLICT DO NOTHING.
   */
  async insertIdempotent(
    input: InsertAgentTransactionInput,
  ): Promise<InsertIdempotentResult> {
    if (!input.clientRequestId) {
      throw new Error(
        "[BIN-PILOT-K1] insertIdempotent krever clientRequestId — bruk insert() for non-idempotent inserts."
      );
    }
    const existing = this.rows.find(
      (r) =>
        r.agentUserId === input.agentUserId
        && r.playerUserId === input.playerUserId
        && r.clientRequestId === input.clientRequestId
    );
    if (existing) {
      return { created: false, row: { ...existing } };
    }
    const row = await this.insert(input);
    return { created: true, row };
  }

  async findByClientRequestId(
    agentUserId: string,
    playerUserId: string,
    clientRequestId: string,
  ): Promise<AgentTransaction | null> {
    const r = this.rows.find(
      (row) =>
        row.agentUserId === agentUserId
        && row.playerUserId === playerUserId
        && row.clientRequestId === clientRequestId
    );
    return r ? { ...r } : null;
  }

  async getById(id: string): Promise<AgentTransaction | null> {
    const r = this.rows.find((row) => row.id === id);
    return r ? { ...r } : null;
  }

  async list(filter: ListFilter): Promise<AgentTransaction[]> {
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    let filtered = this.rows;
    if (filter.shiftId) filtered = filtered.filter((r) => r.shiftId === filter.shiftId);
    if (filter.agentUserId) filtered = filtered.filter((r) => r.agentUserId === filter.agentUserId);
    if (filter.playerUserId) filtered = filtered.filter((r) => r.playerUserId === filter.playerUserId);
    if (filter.hallId) filtered = filtered.filter((r) => r.hallId === filter.hallId);
    if (filter.actionType) filtered = filtered.filter((r) => r.actionType === filter.actionType);
    if (filter.since) filtered = filtered.filter((r) => r.createdAt >= filter.since!);
    const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted.slice(offset, offset + limit).map((r) => ({ ...r }));
  }

  async findSaleByTicketUniqueId(ticketUniqueId: string): Promise<AgentTransaction | null> {
    const r = this.rows.find(
      (row) => row.actionType === "TICKET_SALE" && row.ticketUniqueId === ticketUniqueId
    );
    return r ? { ...r } : null;
  }

  async findCancelForTx(relatedTxId: string): Promise<AgentTransaction | null> {
    const r = this.rows.find(
      (row) => row.actionType === "TICKET_CANCEL" && row.relatedTxId === relatedTxId
    );
    return r ? { ...r } : null;
  }

  async aggregateByShift(shiftId: string): Promise<ShiftAggregate> {
    return aggregateRows(this.rows.filter((r) => r.shiftId === shiftId));
  }
}

// ── Aggregat-helper (delt mellom Postgres + InMemory) ──────────────────────

export function aggregateRows(rows: AgentTransaction[]): ShiftAggregate {
  const agg: ShiftAggregate = {
    cashIn: 0, cashOut: 0,
    cardIn: 0, cardOut: 0,
    walletIn: 0, walletOut: 0,
    ticketSaleCount: 0, ticketCancelCount: 0,
  };
  for (const r of rows) {
    const isCredit = r.walletDirection === "CREDIT";
    const isDebit = r.walletDirection === "DEBIT";
    if (r.paymentMethod === "CASH") {
      if (isCredit) agg.cashIn += r.amount;
      if (isDebit) agg.cashOut += r.amount;
    } else if (r.paymentMethod === "CARD") {
      if (isCredit) agg.cardIn += r.amount;
      if (isDebit) agg.cardOut += r.amount;
    } else if (r.paymentMethod === "WALLET") {
      if (isCredit) agg.walletIn += r.amount;
      if (isDebit) agg.walletOut += r.amount;
    }
    if (r.actionType === "TICKET_SALE") agg.ticketSaleCount++;
    if (r.actionType === "TICKET_CANCEL") agg.ticketCancelCount++;
  }
  return agg;
}
