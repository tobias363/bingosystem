import { createHmac } from "node:crypto";
import type { Pool as PgPool } from "pg";
import type {
  GameResultWebhookPayload,
  GameResultDetails,
  ComplianceCallbackPayload,
  ComplianceEventType
} from "./types.js";
import { logger as rootLogger } from "../util/logger.js";

const logger = rootLogger.child({ module: "webhook" });

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface WebhookServiceOptions {
  /** URL to POST game-result webhooks to. */
  gameResultWebhookUrl: string;
  /** URL to POST compliance events to (can be same as game result URL). */
  complianceWebhookUrl?: string;
  /** HMAC-SHA256 shared secret for signing payloads. */
  webhookSecret: string;
  /** HTTP timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Max retry attempts on failure. Default 5. */
  maxRetries?: number;
  /** BIN-166: PostgreSQL pool for webhook event persistence. When provided,
   *  events are stored in `webhook_events` table with status tracking. */
  pool?: PgPool;
  /** DB schema for webhook_events table. Default: "public". */
  schema?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WebhookService {
  private readonly gameResultUrl: string;
  private readonly complianceUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  /** Delivery log for admin inspection. */
  private readonly deliveryLog: WebhookDeliveryRecord[] = [];
  private static readonly MAX_LOG_SIZE = 500;

  /** BIN-166: PostgreSQL persistence (optional). */
  private readonly pool: PgPool | null;
  private readonly dbSchema: string;
  private dbInitPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: WebhookServiceOptions) {
    this.gameResultUrl = options.gameResultWebhookUrl;
    this.complianceUrl = options.complianceWebhookUrl ?? options.gameResultWebhookUrl;
    this.secret = options.webhookSecret;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 5;
    this.pool = options.pool ?? null;
    this.dbSchema = options.schema ?? "public";
  }

  // -----------------------------------------------------------------------
  // Game result webhook (BIN-34)
  // -----------------------------------------------------------------------

  /**
   * Send a game result webhook to the provider.
   * Retries with exponential backoff on failure.
   */
  async sendGameResult(payload: Omit<GameResultWebhookPayload, "signature">): Promise<WebhookDeliveryRecord> {
    const body = JSON.stringify(payload);
    const signature = this.sign(body);
    const signedPayload: GameResultWebhookPayload = { ...payload, signature };

    return this.deliverWithRetry(this.gameResultUrl, signedPayload, `game-result:${payload.gameId}`);
  }

  /**
   * Build a GameResultWebhookPayload from game-end data.
   */
  buildGameResultPayload(params: {
    gameId: string;
    sessionId: string;
    playerId: string;
    entryFee: number;
    totalPayout: number;
    currency: string;
    ticketsPlayed: number;
    numbersDrawn: number;
    patterns: string[];
  }): Omit<GameResultWebhookPayload, "signature"> {
    const result: GameResultDetails = {
      entryFee: params.entryFee,
      totalPayout: params.totalPayout,
      netResult: params.totalPayout - params.entryFee,
      currency: params.currency,
      ticketsPlayed: params.ticketsPlayed,
      numbersDrawn: params.numbersDrawn,
      patterns: params.patterns
    };

    return {
      event: "game.completed",
      gameId: params.gameId,
      sessionId: params.sessionId,
      playerId: params.playerId,
      timestamp: new Date().toISOString(),
      result
    };
  }

  // -----------------------------------------------------------------------
  // Compliance callbacks (BIN-35)
  // -----------------------------------------------------------------------

  /**
   * Send a compliance event to the provider.
   */
  async sendComplianceEvent(payload: ComplianceCallbackPayload): Promise<WebhookDeliveryRecord> {
    const body = JSON.stringify(payload);
    const signature = this.sign(body);
    const signedPayload = { ...payload, signature };

    return this.deliverWithRetry(this.complianceUrl, signedPayload, `compliance:${payload.event}:${payload.playerId}`);
  }

  /**
   * Build a compliance event payload.
   */
  buildCompliancePayload(
    event: ComplianceEventType,
    playerId: string,
    details: Record<string, unknown>
  ): ComplianceCallbackPayload {
    return {
      event,
      playerId,
      timestamp: new Date().toISOString(),
      details
    };
  }

  // -----------------------------------------------------------------------
  // Admin / inspection
  // -----------------------------------------------------------------------

  getDeliveryLog(): WebhookDeliveryRecord[] {
    return this.deliveryLog.map((r) => ({ ...r }));
  }

  getRecentDeliveries(limit: number = 20): WebhookDeliveryRecord[] {
    return this.deliveryLog.slice(-limit).reverse().map((r) => ({ ...r }));
  }

  // -----------------------------------------------------------------------
  // Internal: delivery with retry
  // -----------------------------------------------------------------------

  private async deliverWithRetry(
    url: string,
    payload: object,
    tag: string
  ): Promise<WebhookDeliveryRecord> {
    let lastError: string | undefined;

    // BIN-166: Persist webhook event to DB (if pool available)
    let dbEventId: string | null = null;
    if (this.pool) {
      dbEventId = await this.insertDbEvent(url, payload, tag);
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 16_000);
        await this.sleep(delayMs);
      }

      try {
        const body = JSON.stringify(payload);
        const signature = this.sign(body);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature
          },
          body,
          signal: controller.signal
        });

        clearTimeout(timeout);

        const record: WebhookDeliveryRecord = {
          tag,
          url,
          attempt: attempt + 1,
          status: response.status,
          success: response.ok,
          timestamp: new Date().toISOString()
        };

        this.addToLog(record);

        if (response.ok) {
          // BIN-166: Mark as delivered in DB
          if (this.pool && dbEventId) {
            await this.updateDbEventStatus(dbEventId, "delivered", attempt + 1);
          }
          return record;
        }

        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    // All retries exhausted.
    const failRecord: WebhookDeliveryRecord = {
      tag,
      url,
      attempt: this.maxRetries + 1,
      status: 0,
      success: false,
      error: lastError,
      timestamp: new Date().toISOString()
    };
    this.addToLog(failRecord);
    logger.error({ tag, attempts: this.maxRetries + 1, error: lastError }, "Webhook delivery failed after all retries");

    // BIN-166: Mark as dead_letter in DB
    if (this.pool && dbEventId) {
      await this.updateDbEventStatus(dbEventId, "dead_letter", this.maxRetries + 1, lastError);
    }

    return failRecord;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private sign(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("hex");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private addToLog(record: WebhookDeliveryRecord): void {
    this.deliveryLog.push(record);
    if (this.deliveryLog.length > WebhookService.MAX_LOG_SIZE) {
      this.deliveryLog.splice(0, this.deliveryLog.length - WebhookService.MAX_LOG_SIZE);
    }
  }

  // -----------------------------------------------------------------------
  // BIN-166: Database persistence for webhook events
  // -----------------------------------------------------------------------

  private webhookTable(): string {
    return `"${this.dbSchema}"."webhook_events"`;
  }

  /** Initialize the webhook_events table if it doesn't exist. */
  async ensureDbInitialized(): Promise<void> {
    if (!this.pool) return;
    if (!this.dbInitPromise) {
      this.dbInitPromise = this.initWebhookSchema();
    }
    await this.dbInitPromise;
  }

  private async initWebhookSchema(): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.webhookTable()} (
          id BIGSERIAL PRIMARY KEY,
          tag TEXT NOT NULL,
          url TEXT NOT NULL,
          payload JSONB NOT NULL,
          signature TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT ${this.maxRetries + 1},
          last_attempt_at TIMESTAMPTZ,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_webhook_events_status
        ON ${this.webhookTable()} (status)
      `);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async insertDbEvent(url: string, payload: object, tag: string): Promise<string | null> {
    try {
      await this.ensureDbInitialized();
      const body = JSON.stringify(payload);
      const signature = this.sign(body);
      const { rows } = await this.pool!.query<{ id: string }>(
        `INSERT INTO ${this.webhookTable()} (tag, url, payload, signature, status, max_attempts)
         VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING id::text`,
        [tag, url, body, signature, this.maxRetries + 1]
      );
      return rows[0]?.id ?? null;
    } catch (err) {
      logger.error({ err, tag }, "Failed to persist webhook event to DB");
      return null;
    }
  }

  private async updateDbEventStatus(
    eventId: string,
    status: "delivered" | "dead_letter",
    attempts: number,
    lastError?: string
  ): Promise<void> {
    try {
      await this.pool!.query(
        `UPDATE ${this.webhookTable()}
         SET status = $2, attempts = $3, last_attempt_at = now(), last_error = $4
         WHERE id = $1`,
        [eventId, status, attempts, lastError ?? null]
      );
    } catch (err) {
      logger.error({ err, eventId, status }, "Failed to update webhook event status in DB");
    }
  }

  /** Start background retry job for pending webhook events (every 60s). */
  startRetryJob(): void {
    if (!this.pool || this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      this.retryPendingEvents().catch((err) => {
        logger.error({ err }, "Webhook retry job failed");
      });
    }, 60_000);
    if (this.retryTimer.unref) this.retryTimer.unref();
    logger.info("Webhook retry job started (60s interval)");
  }

  stopRetryJob(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** Retry pending events that have been waiting > 30s. */
  private async retryPendingEvents(): Promise<void> {
    if (!this.pool) return;
    await this.ensureDbInitialized();

    const { rows } = await this.pool.query<{
      id: string; tag: string; url: string; payload: string; attempts: number; max_attempts: number;
    }>(
      `SELECT id::text, tag, url, payload::text, attempts, max_attempts
       FROM ${this.webhookTable()}
       WHERE status = 'pending'
         AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '30 seconds')
         AND attempts < max_attempts
       ORDER BY created_at ASC
       LIMIT 10`
    );

    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload);
        const body = JSON.stringify(payload);
        const signature = this.sign(body);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        const response = await fetch(row.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature },
          body,
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.ok) {
          await this.updateDbEventStatus(row.id, "delivered", row.attempts + 1);
          logger.info({ eventId: row.id, tag: row.tag }, "Webhook retry delivered");
        } else {
          const nextAttempts = row.attempts + 1;
          if (nextAttempts >= row.max_attempts) {
            await this.updateDbEventStatus(row.id, "dead_letter", nextAttempts, `HTTP ${response.status}`);
            logger.warn({ eventId: row.id, tag: row.tag }, "Webhook moved to dead letter after max retries");
          } else {
            await this.pool.query(
              `UPDATE ${this.webhookTable()} SET attempts = $2, last_attempt_at = now(), last_error = $3 WHERE id = $1`,
              [row.id, nextAttempts, `HTTP ${response.status}`]
            );
          }
        }
      } catch (err) {
        const nextAttempts = row.attempts + 1;
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (nextAttempts >= row.max_attempts) {
          await this.updateDbEventStatus(row.id, "dead_letter", nextAttempts, errorMsg);
        } else {
          await this.pool.query(
            `UPDATE ${this.webhookTable()} SET attempts = $2, last_attempt_at = now(), last_error = $3 WHERE id = $1`,
            [row.id, nextAttempts, errorMsg]
          );
        }
      }
    }
  }

  /** List webhook events by status (for admin endpoint). */
  async listWebhookEvents(status?: string, limit = 50): Promise<WebhookDbEvent[]> {
    if (!this.pool) return [];
    await this.ensureDbInitialized();
    const where = status ? "WHERE status = $1" : "";
    const params: unknown[] = status ? [status, limit] : [limit];
    const { rows } = await this.pool.query<{
      id: string; tag: string; url: string; status: string; attempts: number;
      last_error: string | null; created_at: Date | string;
    }>(
      `SELECT id::text, tag, url, status, attempts, last_error, created_at
       FROM ${this.webhookTable()} ${where}
       ORDER BY created_at DESC LIMIT $${status ? 2 : 1}`,
      params
    );
    return rows.map((r) => ({
      id: r.id,
      tag: r.tag,
      url: r.url,
      status: r.status,
      attempts: r.attempts,
      lastError: r.last_error ?? undefined,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
    }));
  }

  /** Manually retry a specific dead-letter event. */
  async retryEvent(eventId: string): Promise<boolean> {
    if (!this.pool) return false;
    await this.ensureDbInitialized();
    const { rows } = await this.pool.query<{ url: string; payload: string }>(
      `SELECT url, payload::text FROM ${this.webhookTable()} WHERE id = $1 AND status = 'dead_letter'`,
      [eventId]
    );
    if (rows.length === 0) return false;

    // Reset to pending for next retry cycle
    await this.pool.query(
      `UPDATE ${this.webhookTable()} SET status = 'pending', attempts = 0, last_error = NULL WHERE id = $1`,
      [eventId]
    );
    return true;
  }
}

/** BIN-166: DB event record for admin API. */
export interface WebhookDbEvent {
  id: string;
  tag: string;
  url: string;
  status: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookDeliveryRecord {
  tag: string;
  url: string;
  attempt: number;
  status: number;
  success: boolean;
  error?: string;
  timestamp: string;
}
