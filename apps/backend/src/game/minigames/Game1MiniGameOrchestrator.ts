/**
 * BIN-690 Spor 3 M1: Game1MiniGameOrchestrator.
 *
 * Koordinerer mini-game-lifecycle etter Fullt Hus i Spill 1 scheduled-games.
 *
 * Ansvar:
 *   1) `maybeTriggerFor(context)` — kalles fra Game1DrawEngineService etter
 *      Fullt Hus detektert. Sjekker:
 *        - `config.spill1.miniGames` inneholder minst én aktiv type.
 *        - Finn neste type i rotasjonen (FIFO per scheduled_game).
 *        - INSERT app_game1_mini_game_results (status=triggered).
 *        - Send socket-event `mini_game:trigger` til vinner.
 *        - Fire-and-forget: feil logges men krasher IKKE draw-transaksjonen
 *          som trigget den (den er allerede committed på dette punktet).
 *
 *   2) `handleChoice(resultId, userId, choiceJson)` — kalles av socket-
 *      handler når klient svarer. Sjekker:
 *        - resultId finnes og tilhører userId.
 *        - completed_at er NULL (idempotent — dobbel-submit blir rejectet).
 *        - Dispatch til riktig MiniGame-implementasjon.
 *        - Utfør wallet-credit (hvis payoutCents > 0).
 *        - UPDATE result + payout_cents + completed_at i én transaksjon.
 *        - Send socket-event `mini_game:result` til vinner.
 *
 *   3) `listPending()` / `markAbandoned()` — M2+ kan legge til cleanup-jobb
 *      for ufullførte mini-games etter X minutter. I M1 kun stubber.
 *
 * Designvalg:
 *   - Mini-games-registry er en `Map<MiniGameType, MiniGame>` injisert via
 *     konstruktør. Tom-map = ingen mini-games registrert (M2 legger til
 *     `wheel`, M3 `chest`, osv. uten å endre orchestrator).
 *   - Dispatch via MiniGameType-discriminator — type-safe.
 *   - Fire-and-forget på trigger-siden: orchestrator skal IKKE kaste når
 *     Game1DrawEngineService kaller `maybeTriggerFor()`. Feil logges som
 *     warn + audit-event "game1_minigame.trigger_failed".
 *   - handleChoice er SERVER-autoritativ: resultat beregnes server-side,
 *     klient kan ikke bestemme payout.
 *
 * Socket-events (M1):
 *   Server → klient: `mini_game:trigger { type, resultId, payload, timeoutSeconds? }`
 *   Klient → server: `mini_game:choice { resultId, choice }`
 *   Server → klient: `mini_game:result { resultId, type, payoutCents, resultJson }`
 *
 * Denne filen eksporterer service-klassen. Socket-handlers + admin-broadcaster
 * lander i `src/sockets/miniGameEvents.ts` (M1) / utvides i M2-M5.
 */

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { DomainError } from "../BingoEngine.js";
import { IdempotencyKeys } from "../idempotency.js";
import type { MiniGame, MiniGameTriggerContext, MiniGameType } from "./types.js";
import { MINI_GAME_TYPES } from "./types.js";
import type { AuditLogService } from "../../compliance/AuditLogService.js";
import type { WalletAdapter } from "../../adapters/WalletAdapter.js";
import { logger as rootLogger } from "../../util/logger.js";

const log = rootLogger.child({ module: "game1-mini-game-orchestrator" });

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Input til `maybeTriggerFor()`. Kalles fra Game1DrawEngineService etter
 * Fullt Hus detektert, post-commit (så mini-game-feil ikke ruller draw tilbake).
 */
export interface MaybeTriggerInput {
  /** ID på scheduled-game som vant Fullt Hus. */
  readonly scheduledGameId: string;
  /** Bruker-ID til Fullt Hus-vinneren. */
  readonly winnerUserId: string;
  /** Wallet-ID til vinneren. */
  readonly winnerWalletId: string;
  /** Hall-ID vinneren spilte fra. */
  readonly hallId: string;
  /** Draw-sekvens da Fullt Hus ble vunnet. */
  readonly drawSequenceAtWin: number;
  /**
   * `game_config_json` fra scheduled-game. Inneholder typisk
   * `{spill1: {miniGames: ["wheel", "chest", ...]}}`. Hvis tom → skip.
   */
  readonly gameConfigJson: unknown;
}

export interface MaybeTriggerResult {
  readonly triggered: boolean;
  readonly resultId: string | null;
  readonly miniGameType: MiniGameType | null;
  readonly reason?: string;
}

export interface HandleChoiceInput {
  readonly resultId: string;
  readonly userId: string;
  readonly choiceJson: Readonly<Record<string, unknown>>;
}

export interface HandleChoiceResult {
  readonly resultId: string;
  readonly miniGameType: MiniGameType;
  readonly payoutCents: number;
  readonly resultJson: Readonly<Record<string, unknown>>;
}

/** Port for å sende mini-game-events til klient (fire-and-forget socket-wrapper). */
export interface MiniGameBroadcaster {
  /** Send `mini_game:trigger` til vinneren. */
  onTrigger(event: MiniGameTriggerBroadcast): void;
  /** Send `mini_game:result` til vinneren. */
  onResult(event: MiniGameResultBroadcast): void;
}

export interface MiniGameTriggerBroadcast {
  readonly scheduledGameId: string;
  readonly winnerUserId: string;
  readonly resultId: string;
  readonly miniGameType: MiniGameType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly timeoutSeconds?: number;
}

export interface MiniGameResultBroadcast {
  readonly scheduledGameId: string;
  readonly winnerUserId: string;
  readonly resultId: string;
  readonly miniGameType: MiniGameType;
  readonly payoutCents: number;
  readonly resultJson: Readonly<Record<string, unknown>>;
}

/** No-op broadcaster — default i tester + når io ikke er wired opp enda. */
export const NoopMiniGameBroadcaster: MiniGameBroadcaster = {
  onTrigger: () => undefined,
  onResult: () => undefined,
};

export interface Game1MiniGameOrchestratorOptions {
  readonly pool: Pool;
  readonly schema?: string;
  readonly auditLog: AuditLogService;
  readonly walletAdapter: WalletAdapter;
  /**
   * Map av konkrete mini-game-implementasjoner. M1 leveres med tom map;
   * M2-M5 registrerer hver sin implementasjon via `registerMiniGame()`.
   */
  readonly miniGames?: ReadonlyMap<MiniGameType, MiniGame>;
  /** Fire-and-forget socket-broadcast. Default no-op. */
  readonly broadcaster?: MiniGameBroadcaster;
}

// ── Internal row shape ───────────────────────────────────────────────────────

interface MiniGameResultRow {
  id: string;
  scheduled_game_id: string;
  mini_game_type: string;
  winner_user_id: string;
  config_snapshot_json: Record<string, unknown>;
  choice_json: Record<string, unknown> | null;
  result_json: Record<string, unknown> | null;
  payout_cents: number;
  triggered_at: Date;
  completed_at: Date | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse `gameConfigJson` for å finne aktive mini-game-typer.
 *
 * Forventet shape:
 *   `{ spill1: { miniGames: ["wheel", "chest", ...] } }`
 *
 * Returnerer tom liste hvis config mangler eller er malformed — mini-game
 * trigges ikke i slike tilfeller (fail-closed, ikke fail-loud).
 */
export function extractActiveMiniGameTypes(
  gameConfigJson: unknown,
): MiniGameType[] {
  if (!gameConfigJson || typeof gameConfigJson !== "object") return [];
  const spill1 = (gameConfigJson as { spill1?: unknown }).spill1;
  if (!spill1 || typeof spill1 !== "object") return [];
  const miniGames = (spill1 as { miniGames?: unknown }).miniGames;
  if (!Array.isArray(miniGames)) return [];
  const out: MiniGameType[] = [];
  for (const v of miniGames) {
    if (typeof v === "string" && (MINI_GAME_TYPES as readonly string[]).includes(v)) {
      out.push(v as MiniGameType);
    }
  }
  return out;
}

/**
 * Round-robin valg av neste mini-game-type. Implementerer canonical-spec-
 * regelen `wheel → chest → colordraft → oddsen → wheel …` (se
 * docs/engineering/game1-canonical-spec.md §miniGameRotation).
 *
 *   - Caller passer inn typen som ble brukt sist (eller null hvis ingen).
 *   - Vi roterer i den rekkefølgen `activeTypes` ligger i (admin har valgt
 *     en delmengde i `gameConfigJson.spill1.miniGames`).
 *
 * Edge-case: typen som ble brukt sist er ikke lenger aktiv (admin endret
 * config midt i spillet). Da faller vi tilbake til den aktive typen som
 * ligger "nærmest" forrige posisjon i den kanoniske rekkefølgen
 * `MINI_GAME_TYPES` — vi går framover derfra og plukker den første
 * aktive typen vi finner. Slik bevarer vi rotasjons-progresjonen i
 * stedet for å starte forfra.
 *
 * `activeTypes.length` MÅ være > 0 (caller ansvar — funksjonen kaster
 * ellers).
 */
export function pickNextMiniGameType(
  lastType: MiniGameType | null,
  activeTypes: readonly MiniGameType[],
): MiniGameType {
  if (activeTypes.length === 0) {
    throw new DomainError(
      "MINIGAME_NO_ACTIVE_TYPES",
      "pickNextMiniGameType krever minst én aktiv type.",
    );
  }
  if (lastType === null) {
    return activeTypes[0]!;
  }
  const activeIdx = activeTypes.indexOf(lastType);
  if (activeIdx >= 0) {
    return activeTypes[(activeIdx + 1) % activeTypes.length]!;
  }
  // Sist brukte type er ikke lenger aktiv — finn nærmeste aktive type
  // ved å gå framover fra forrige kanoniske posisjon.
  const canonicalIdx = MINI_GAME_TYPES.indexOf(lastType);
  for (let step = 1; step <= MINI_GAME_TYPES.length; step += 1) {
    const candidate =
      MINI_GAME_TYPES[(canonicalIdx + step) % MINI_GAME_TYPES.length]!;
    if (activeTypes.includes(candidate)) {
      return candidate;
    }
  }
  // Uoppnåelig: activeTypes.length > 0 garanterer at vi finner en match.
  return activeTypes[0]!;
}

/** Svak validering av schema-navn (SQL-injection-defens). */
function assertSchemaName(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new DomainError("INVALID_CONFIG", "Ugyldig schema-navn.");
  }
  return schema;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class Game1MiniGameOrchestrator {
  private readonly pool: Pool;
  private readonly schema: string;
  private readonly auditLog: AuditLogService;
  private readonly walletAdapter: WalletAdapter;
  private readonly miniGames: Map<MiniGameType, MiniGame>;
  private broadcaster: MiniGameBroadcaster;

  constructor(options: Game1MiniGameOrchestratorOptions) {
    this.pool = options.pool;
    this.schema = assertSchemaName(options.schema ?? "public");
    this.auditLog = options.auditLog;
    this.walletAdapter = options.walletAdapter;
    this.miniGames = new Map(options.miniGames ?? []);
    this.broadcaster = options.broadcaster ?? NoopMiniGameBroadcaster;
  }

  /**
   * Late-binding for socket-broadcaster (io må finnes først).
   */
  setBroadcaster(broadcaster: MiniGameBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /**
   * Registrer en konkret mini-game-implementasjon. Kalles fra M2-M5.
   * Kaster DomainError ved duplikat-registrering.
   */
  registerMiniGame(miniGame: MiniGame): void {
    if (this.miniGames.has(miniGame.type)) {
      throw new DomainError(
        "MINIGAME_ALREADY_REGISTERED",
        `Mini-game '${miniGame.type}' er allerede registrert.`,
      );
    }
    this.miniGames.set(miniGame.type, miniGame);
  }

  /** Test-hook: liste registrerte typer. */
  getRegisteredTypes(): MiniGameType[] {
    return Array.from(this.miniGames.keys());
  }

  private resultsTable(): string {
    return `"${this.schema}"."app_game1_mini_game_results"`;
  }

  private configTable(): string {
    return `"${this.schema}"."app_mini_games_config"`;
  }

  private scheduledGamesTable(): string {
    return `"${this.schema}"."app_game1_scheduled_games"`;
  }

  /**
   * Trigg mini-game hvis admin har konfigurert det. Fire-and-forget:
   * kastes IKKE selv ved feil. Kalles fra Game1DrawEngineService post-commit.
   *
   * Returnerer MaybeTriggerResult for testbarhet + logging i caller.
   */
  async maybeTriggerFor(input: MaybeTriggerInput): Promise<MaybeTriggerResult> {
    const activeTypes = extractActiveMiniGameTypes(input.gameConfigJson);
    if (activeTypes.length === 0) {
      return { triggered: false, resultId: null, miniGameType: null, reason: "NO_MINI_GAMES_CONFIGURED" };
    }

    // Round-robin per scheduled-game: les sist brukte type fra
    // app_game1_scheduled_games.last_minigame_type, plukk neste i rotasjonen,
    // og skriv ny verdi tilbake atomisk (SELECT FOR UPDATE i transaksjon).
    // Hvis lookup feiler (f.eks. raden mangler i tester) faller vi tilbake
    // til activeTypes[0] og logger advarsel.
    const nextType = await this.advanceRotation(
      input.scheduledGameId,
      activeTypes,
    );

    const implementation = this.miniGames.get(nextType);
    if (!implementation) {
      log.warn(
        { scheduledGameId: input.scheduledGameId, miniGameType: nextType },
        "Mini-game-type konfigurert men ingen implementasjon registrert — skipper",
      );
      this.fireAudit({
        actorId: null,
        action: "game1_minigame.trigger_skipped",
        resourceId: input.scheduledGameId,
        details: {
          reason: "IMPLEMENTATION_NOT_REGISTERED",
          miniGameType: nextType,
          configuredTypes: activeTypes,
        },
      });
      return {
        triggered: false,
        resultId: null,
        miniGameType: nextType,
        reason: "IMPLEMENTATION_NOT_REGISTERED",
      };
    }

    const resultId = `mgr-${randomUUID()}`;

    try {
      // Hent admin-config for denne typen. M1: fall tilbake til tom-object
      // hvis admin ikke har konfigurert (implementasjon må ha sane defaults).
      const configSnapshot = await this.fetchConfigSnapshot(nextType);

      const context: MiniGameTriggerContext = {
        resultId,
        scheduledGameId: input.scheduledGameId,
        winnerUserId: input.winnerUserId,
        winnerWalletId: input.winnerWalletId,
        hallId: input.hallId,
        drawSequenceAtWin: input.drawSequenceAtWin,
        configSnapshot,
      };

      // Kall implementasjonen for å generere trigger-payload.
      const triggerPayload = implementation.trigger(context);

      // INSERT rad med status=triggered (completed_at=NULL).
      await this.pool.query(
        `INSERT INTO ${this.resultsTable()}
           (id, scheduled_game_id, mini_game_type, winner_user_id,
            config_snapshot_json, triggered_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, now())
         ON CONFLICT (scheduled_game_id, winner_user_id) DO NOTHING`,
        [
          resultId,
          input.scheduledGameId,
          nextType,
          input.winnerUserId,
          JSON.stringify(configSnapshot),
        ],
      );

      // Fire-and-forget socket-broadcast.
      try {
        this.broadcaster.onTrigger({
          scheduledGameId: input.scheduledGameId,
          winnerUserId: input.winnerUserId,
          resultId,
          miniGameType: nextType,
          payload: triggerPayload.payload,
          timeoutSeconds: triggerPayload.timeoutSeconds,
        });
      } catch (err) {
        log.warn(
          { err, resultId, scheduledGameId: input.scheduledGameId },
          "MiniGameBroadcaster.onTrigger kastet — ignorert",
        );
      }

      this.fireAudit({
        actorId: null,
        action: "game1_minigame.triggered",
        resourceId: input.scheduledGameId,
        details: {
          resultId,
          miniGameType: nextType,
          winnerUserId: input.winnerUserId,
          drawSequenceAtWin: input.drawSequenceAtWin,
        },
      });

      return {
        triggered: true,
        resultId,
        miniGameType: nextType,
      };
    } catch (err) {
      // Fail-closed mot caller: ingen kast. Draw-transaksjonen er allerede
      // committed så payout + bingo-resultat er intakt.
      log.error(
        { err, scheduledGameId: input.scheduledGameId, winnerUserId: input.winnerUserId },
        "maybeTriggerFor feilet — draw-transaksjon er intakt, mini-game skippes",
      );
      this.fireAudit({
        actorId: null,
        action: "game1_minigame.trigger_failed",
        resourceId: input.scheduledGameId,
        details: {
          reason: err instanceof Error ? err.message : String(err),
          miniGameType: nextType,
        },
      });
      return {
        triggered: false,
        resultId: null,
        miniGameType: nextType,
        reason: "TRIGGER_FAILED",
      };
    }
  }

  /**
   * Spiller gjør sitt valg. Server-autoritativt: beregner resultat,
   * utbetaler payout, persisterer i DB, broadcaster resultat.
   *
   * Kaster DomainError ved:
   *   - resultId finnes ikke
   *   - userId != winner_user_id
   *   - completed_at ikke er NULL (allerede spilt)
   *   - mini-game-type-implementasjon ikke registrert
   *
   * Sub-DomainError fra konkrete implementasjoner (INVALID_CHOICE osv.)
   * bobler opp uendret.
   */
  async handleChoice(input: HandleChoiceInput): Promise<HandleChoiceResult> {
    // Hent + verifiser raden. Gjør dette i transaksjon slik at selv ved
    // parallelle kall blir kun én operert på (FOR UPDATE-lås).
    return this.runInTransaction(async (client) => {
      const row = await this.lockResultRow(client, input.resultId);
      if (!row) {
        throw new DomainError("MINIGAME_NOT_FOUND", "Mini-game finnes ikke.");
      }
      if (row.winner_user_id !== input.userId) {
        throw new DomainError(
          "MINIGAME_NOT_OWNER",
          "Denne mini-gamen tilhører en annen spiller.",
        );
      }
      if (row.completed_at !== null) {
        throw new DomainError(
          "MINIGAME_ALREADY_COMPLETED",
          "Mini-game er allerede spilt.",
        );
      }

      const miniGameType = row.mini_game_type as MiniGameType;
      const implementation = this.miniGames.get(miniGameType);
      if (!implementation) {
        throw new DomainError(
          "MINIGAME_NO_IMPLEMENTATION",
          `Mini-game-type '${miniGameType}' er ikke registrert.`,
        );
      }

      // Hent nødvendige context-felt fra scheduled_game (hall + draw-seq).
      const ctxRow = await this.loadContextForResult(client, row);

      const context: MiniGameTriggerContext = {
        resultId: row.id,
        scheduledGameId: row.scheduled_game_id,
        winnerUserId: row.winner_user_id,
        winnerWalletId: ctxRow.winnerWalletId,
        hallId: ctxRow.hallId,
        drawSequenceAtWin: ctxRow.drawSequenceAtWin,
        configSnapshot: row.config_snapshot_json,
      };

      // Kall konkret implementasjon. Kan kaste DomainError (INVALID_CHOICE).
      const result = await implementation.handleChoice({
        resultId: row.id,
        context,
        choiceJson: input.choiceJson,
      });

      // Utbetal payout hvis > 0. Idempotency-key forhindrer dobbel-betaling
      // selv hvis completedAt-UPDATE rulles tilbake og vi retry-er.
      if (result.payoutCents > 0) {
        await this.creditPayout(context, miniGameType, result.payoutCents);
      }

      // UPDATE: sett choice + result + payout + completed_at.
      await client.query(
        `UPDATE ${this.resultsTable()}
            SET choice_json   = $2::jsonb,
                result_json   = $3::jsonb,
                payout_cents  = $4,
                completed_at  = now()
          WHERE id = $1`,
        [
          row.id,
          JSON.stringify(input.choiceJson),
          JSON.stringify(result.resultJson),
          result.payoutCents,
        ],
      );

      // Broadcast POST-commit effectively: siden vi er i transaksjon her,
      // må broadcast gjøres etter commit. Bruk "return then" pattern.
      return {
        resultId: row.id,
        miniGameType,
        payoutCents: result.payoutCents,
        resultJson: result.resultJson,
      };
    }).then((res) => {
      // POST-commit broadcast.
      try {
        this.broadcaster.onResult({
          scheduledGameId: this.lastScheduledGameId ?? "",
          winnerUserId: input.userId,
          resultId: res.resultId,
          miniGameType: res.miniGameType,
          payoutCents: res.payoutCents,
          resultJson: res.resultJson,
        });
      } catch (err) {
        log.warn(
          { err, resultId: res.resultId },
          "MiniGameBroadcaster.onResult kastet — ignorert",
        );
      }
      this.fireAudit({
        actorId: input.userId,
        action: "game1_minigame.completed",
        resourceId: res.resultId,
        details: {
          miniGameType: res.miniGameType,
          payoutCents: res.payoutCents,
        },
      });
      return res;
    });
  }

  /** Liste ufullførte mini-games (admin-helper + cleanup i M2+). */
  async listPending(
    scheduledGameId?: string,
  ): Promise<Array<{ id: string; scheduledGameId: string; winnerUserId: string; miniGameType: MiniGameType; triggeredAt: Date }>> {
    const params: unknown[] = [];
    let where = "completed_at IS NULL";
    if (scheduledGameId) {
      params.push(scheduledGameId);
      where += ` AND scheduled_game_id = $${params.length}`;
    }
    const { rows } = await this.pool.query<MiniGameResultRow>(
      `SELECT id, scheduled_game_id, mini_game_type, winner_user_id, triggered_at
         FROM ${this.resultsTable()}
        WHERE ${where}
        ORDER BY triggered_at ASC`,
      params,
    );
    return rows.map((r) => ({
      id: r.id,
      scheduledGameId: r.scheduled_game_id,
      winnerUserId: r.winner_user_id,
      miniGameType: r.mini_game_type as MiniGameType,
      triggeredAt: r.triggered_at,
    }));
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private lastScheduledGameId: string | null = null;

  /**
   * Atomisk: les sist brukte mini-game-type fra scheduled-game-raden,
   * regn ut neste type i round-robin-rotasjonen, og skriv den tilbake.
   *
   * Bruker SELECT FOR UPDATE i transaksjon for å unngå race ved samtidige
   * Fullt Hus-vinnere (multi-winner edge-case). Ved DB-feil eller manglende
   * scheduled-game-rad faller vi tilbake til activeTypes[0] og logger
   * advarsel — vi vil ikke at en defekt rotasjons-tabell skal blokkere
   * mini-game-trigging helt.
   */
  private async advanceRotation(
    scheduledGameId: string,
    activeTypes: readonly MiniGameType[],
  ): Promise<MiniGameType> {
    const fallback = activeTypes[0]!;
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (err) {
      log.warn(
        { err, scheduledGameId },
        "advanceRotation: pool.connect feilet — bruker fallback (activeTypes[0])",
      );
      return fallback;
    }

    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ last_minigame_type: string | null }>(
        `SELECT last_minigame_type
           FROM ${this.scheduledGamesTable()}
          WHERE id = $1
          FOR UPDATE`,
        [scheduledGameId],
      );

      const lastRaw = rows.length > 0 ? rows[0]!.last_minigame_type : null;
      const lastType =
        lastRaw && (MINI_GAME_TYPES as readonly string[]).includes(lastRaw)
          ? (lastRaw as MiniGameType)
          : null;

      const nextType = pickNextMiniGameType(lastType, activeTypes);

      // UPDATE selv om raden ikke finnes — rowCount=0 er greit, vi har
      // uansett valgt fallback. Hvis raden finnes lagrer vi ny rotasjons-state.
      await client.query(
        `UPDATE ${this.scheduledGamesTable()}
            SET last_minigame_type = $2,
                updated_at = now()
          WHERE id = $1`,
        [scheduledGameId, nextType],
      );

      await client.query("COMMIT");
      return nextType;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignorer rollback-feil
      }
      log.warn(
        { err, scheduledGameId },
        "advanceRotation feilet — bruker fallback (activeTypes[0])",
      );
      return fallback;
    } finally {
      client.release();
    }
  }

  private async fetchConfigSnapshot(
    miniGameType: MiniGameType,
  ): Promise<Readonly<Record<string, unknown>>> {
    // M1: mapper framework-type → BIN-679-type-nøkkel. "wheel"/"chest" er
    // direkte match; "colordraft"/"oddsen" kan eksistere i BIN-679 eller
    // legges til når M4/M5 lander. Fall tilbake til tom-object.
    try {
      const { rows } = await this.pool.query<{ config_json: Record<string, unknown> | null }>(
        `SELECT config_json FROM ${this.configTable()} WHERE game_type = $1 AND active = true LIMIT 1`,
        [miniGameType],
      );
      if (rows.length === 0 || !rows[0]!.config_json) {
        return {};
      }
      return rows[0]!.config_json;
    } catch (err) {
      log.warn(
        { err, miniGameType },
        "fetchConfigSnapshot feilet — faller tilbake til tom config",
      );
      return {};
    }
  }

  private async lockResultRow(
    client: PoolClient,
    resultId: string,
  ): Promise<MiniGameResultRow | null> {
    const { rows } = await client.query<MiniGameResultRow>(
      `SELECT id, scheduled_game_id, mini_game_type, winner_user_id,
              config_snapshot_json, choice_json, result_json, payout_cents,
              triggered_at, completed_at
         FROM ${this.resultsTable()}
        WHERE id = $1
        FOR UPDATE`,
      [resultId],
    );
    if (rows.length === 0) return null;
    this.lastScheduledGameId = rows[0]!.scheduled_game_id;
    return rows[0]!;
  }

  /**
   * Hent winnerWalletId + hallId + drawSequenceAtWin fra relaterte tabeller.
   * M1 bruker assignments-tabellen for walletId + hall (buyer_user_id match).
   */
  private async loadContextForResult(
    client: PoolClient,
    row: MiniGameResultRow,
  ): Promise<{ winnerWalletId: string; hallId: string; drawSequenceAtWin: number }> {
    // 1) walletId fra app_users.
    const userRes = await client.query<{ wallet_id: string | null }>(
      `SELECT wallet_id FROM "${this.schema}"."app_users" WHERE id = $1 LIMIT 1`,
      [row.winner_user_id],
    );
    if (userRes.rows.length === 0 || !userRes.rows[0]!.wallet_id) {
      throw new DomainError(
        "MINIGAME_USER_NOT_FOUND",
        "Vinnerens wallet-ID ble ikke funnet.",
      );
    }
    const winnerWalletId = userRes.rows[0]!.wallet_id;

    // 2) hallId + drawSequenceAtWin fra phase-winners eller assignments.
    //    Først prøv phase-winners (nærmere metadata).
    const pwRes = await client.query<{ hall_id: string; draw_sequence_at_win: number }>(
      `SELECT hall_id, draw_sequence_at_win
         FROM "${this.schema}"."app_game1_phase_winners"
        WHERE scheduled_game_id = $1 AND winner_user_id = $2
        ORDER BY draw_sequence_at_win DESC
        LIMIT 1`,
      [row.scheduled_game_id, row.winner_user_id],
    );
    if (pwRes.rows.length > 0) {
      return {
        winnerWalletId,
        hallId: pwRes.rows[0]!.hall_id,
        drawSequenceAtWin: pwRes.rows[0]!.draw_sequence_at_win,
      };
    }

    // 3) Fallback: hent hall fra assignments; drawSequenceAtWin = 0 (ukjent).
    const aRes = await client.query<{ hall_id: string }>(
      `SELECT hall_id
         FROM "${this.schema}"."app_game1_ticket_assignments"
        WHERE scheduled_game_id = $1 AND buyer_user_id = $2
        LIMIT 1`,
      [row.scheduled_game_id, row.winner_user_id],
    );
    if (aRes.rows.length === 0) {
      throw new DomainError(
        "MINIGAME_ASSIGNMENT_MISSING",
        "Kunne ikke finne assignment for mini-game-kontekst.",
      );
    }
    return {
      winnerWalletId,
      hallId: aRes.rows[0]!.hall_id,
      drawSequenceAtWin: 0,
    };
  }

  /**
   * Utbetal mini-game-premie. Bruker samme wallet.credit-pattern som
   * Game1PayoutService for konsistens (én felles wallet-adapter med
   * idempotency-key; regulatorisk ledger er ikke i scope her — følger
   * samme mønster som fase-payouts).
   *
   * `payoutCents` konverteres til kroner for wallet.credit (legacy API
   * forventer kroner). Idempotency-key er resultId-scoped.
   *
   * PR-M2 regulatorisk: mål-konto er `"winnings"` (ikke `"deposit"`) slik
   * at mini-game-premier teller som gevinst (ikke innskudd) i netto-
   * tap-beregning. Matcher BIN-690-spec + W1 wallet-split-regel om at
   * game-engine er eneste kilde til `to: "winnings"`-credits.
   */
  private async creditPayout(
    context: MiniGameTriggerContext,
    miniGameType: MiniGameType,
    payoutCents: number,
  ): Promise<void> {
    const amountKroner = payoutCents / 100;
    // PR-W2 wallet-split: mini-game-payout er gevinst fra spill → krediter
    // til winnings-siden. Samme regel som Game1PayoutService.payoutPhase.
    await this.walletAdapter.credit(
      context.winnerWalletId,
      amountKroner,
      `Mini-game ${miniGameType} premie`,
      {
        idempotencyKey: IdempotencyKeys.game1MiniGame({
          resultId: context.resultId,
        }),
        to: "winnings",
      },
    );
  }

  private async runInTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // noop — primary error bobler opp.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  private fireAudit(entry: {
    actorId: string | null;
    action: string;
    resourceId: string;
    details: Record<string, unknown>;
  }): void {
    // Fire-and-forget: logg men ikke kast.
    Promise.resolve()
      .then(() =>
        this.auditLog.record({
          actorId: entry.actorId,
          actorType: "SYSTEM",
          action: entry.action,
          resource: "game1_minigame",
          resourceId: entry.resourceId,
          details: entry.details,
        }),
      )
      .catch((err) =>
        log.warn({ err, action: entry.action }, "audit.record feilet — ignorert"),
      );
  }
}
