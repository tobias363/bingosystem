// GameManagement state — legacy/unity-backend/App/Views/GameManagement/* (9 267 lines across 10 files).
//
// Legacy backend-routes this replaces (see legacy/unity-backend/src/routes/backend.js):
//   GET  /gameManagement                              → type-picker + list
//   GET  /gameManagementDetailList/:id                → type-scoped list (DataTable ajax)
//   GET  /addGameManagement/:id                       → add-form GET (Game 1/2)
//   GET  /addGameManagement/:id  (game3 mode)         → add-form GET (Game 3 — game3Add.html)
//   POST /addGameManagement/:typeId/:type             → add POST
//   GET  /viewGameManagement/:typeId/:id              → view-only page
//   GET  /viewsubGamesManagement/:typeId/:id          → nested sub-games
//   GET  /viewGameTickets/:typeId/:id                 → ticket-view list
//   GET  /closeDayGameManagement/:typeId/:id/:type    → close-day page
//   POST /closeDayGameManagement/...                  → close POST         ← PLACEHOLDER (BIN-623)
//   POST /repeatGame/...                              → repeat-game POST
//
// BIN-622 lander GameManagement CRUD; denne modulen wrapper de faktiske
// endepunktene:
//   GET    /api/admin/game-management?gameTypeId=X
//   GET    /api/admin/game-management/:typeId/:id
//   POST   /api/admin/game-management
//   PATCH  /api/admin/game-management/:id
//   POST   /api/admin/game-management/:id/repeat
//   DELETE /api/admin/game-management/:id
//
// CloseDay er fortsatt placeholder (BIN-623). Ticket-listing per spill-runde
// er også en senere oppgave (viewGameTickets-erstatning).

import { apiRequest, ApiError } from "../../../api/client.js";
import type { GameType } from "../common/types.js";

/** Ticket-type i ny backend (kanonisert i shared-types). */
export type GameManagementTicketType = "Large" | "Small";

/** Status i ny backend (kanonisert i shared-types). */
export type GameManagementStatus = "active" | "running" | "closed" | "inactive";

/**
 * List-row shape for the main /gameManagement/:typeId/list table — matcher
 * backend `GameManagement` unntatt at `deletedAt` ikke eksponeres og at vi
 * beholder `_id`-alias til `id` for legacy-port-kompatibilitet. Nye felt
 * (parentId, config, totalEarning) er også eksponert.
 */
export interface GameManagementRow {
  /** Legacy-alias (same value as `id`). Beholdt inntil alle kaller bytter til `id`. */
  _id: string;
  id: string;
  gameTypeId: string;
  parentId: string | null;
  /** Parent game id-alias fra legacy — same som parentId. */
  childId?: string;
  name: string;
  ticketType: GameManagementTicketType | null;
  ticketPrice: number;
  startDate: string;
  endDate: string | null;
  status: GameManagementStatus;
  totalSold: number;
  totalEarning: number;
  config: Record<string, unknown>;
  repeatedFromId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Wire-shape direkte fra backend. */
interface BackendGameManagement {
  id: string;
  gameTypeId: string;
  parentId: string | null;
  name: string;
  ticketType: GameManagementTicketType | null;
  ticketPrice: number;
  startDate: string;
  endDate: string | null;
  status: GameManagementStatus;
  totalSold: number;
  totalEarning: number;
  config: Record<string, unknown>;
  repeatedFromId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendListResponse {
  games: BackendGameManagement[];
  count: number;
}

function adaptRow(r: BackendGameManagement): GameManagementRow {
  return {
    _id: r.id,
    id: r.id,
    gameTypeId: r.gameTypeId,
    parentId: r.parentId,
    childId: r.parentId ?? undefined,
    name: r.name,
    ticketType: r.ticketType,
    ticketPrice: r.ticketPrice,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    totalSold: r.totalSold,
    totalEarning: r.totalEarning,
    config: r.config ?? {},
    repeatedFromId: r.repeatedFromId,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Form-payload shape for create. `config` brukes til spill-spesifikke felter. */
export interface GameManagementFormPayload {
  gameTypeId: string;
  name: string;
  ticketType?: GameManagementTicketType | null;
  /** Ticket price i smallest currency unit (øre). */
  ticketPrice?: number;
  startDate: string;
  endDate?: string | null;
  status?: GameManagementStatus;
  parentId?: string | null;
  /**
   * Spill-spesifikk konfigurasjon. For Spill 1 legges alt i
   * `config.spill1 = { timing, ticketTypes, patternPrizes, jackpot, elvis, luckyNumber }`.
   */
  config?: Record<string, unknown>;
}

/** Repeat-game payload — legacy "Repeat"-modal rebinds startDate/endDate. */
export interface RepeatGamePayload {
  sourceGameId: string;
  startDate: string;
  endDate?: string | null;
  name?: string | null;
  /** Idempotency-nøkkel. Samme token → samme ny rad. */
  repeatToken?: string | null;
}

/** Close-day payload — confirms day-end cut-off for a running game. */
export interface CloseDayPayload {
  gameTypeId: string;
  gameId: string;
  closeDate: string;
}

/** Unified write-result contract. Success har backend-rad, failure har code+message. */
export type WriteResult<T = GameManagementRow> =
  | { ok: true; data: T }
  | { ok: false; reason: "BACKEND_MISSING"; issue: "BIN-623" }
  | { ok: false; reason: "API_ERROR"; code: string; message: string; status: number };

/**
 * Liste spill filtrert på gameTypeId. BIN-622 backend returnerer `{ games, count }`.
 */
export async function fetchGameManagementList(
  typeId: string
): Promise<GameManagementRow[]> {
  const query = typeId ? `?gameTypeId=${encodeURIComponent(typeId)}` : "";
  const raw = await apiRequest<BackendListResponse | BackendGameManagement[]>(
    `/api/admin/game-management${query}`,
    { auth: true }
  );
  if (Array.isArray(raw)) return raw.map(adaptRow);
  if (raw && Array.isArray(raw.games)) return raw.games.map(adaptRow);
  return [];
}

/**
 * Hent enkelt-spill. Backend forventer BÅDE typeId og id i URL-en.
 */
export async function fetchGameManagement(
  typeId: string,
  id: string
): Promise<GameManagementRow | null> {
  try {
    const raw = await apiRequest<BackendGameManagement>(
      `/api/admin/game-management/${encodeURIComponent(typeId)}/${encodeURIComponent(id)}`,
      { auth: true }
    );
    return adaptRow(raw);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * PLACEHOLDER — tickets-for-a-game. Ikke del av BIN-622-scopet (egen task).
 */
export async function fetchGameTickets(_typeId: string, _id: string): Promise<GameManagementRow[]> {
  return [];
}

/**
 * Opprett spill. Returnerer `{ ok:true, data }` ved suksess, eller
 * `{ ok:false, reason:"API_ERROR", code, message, status }` ved feil.
 * ApiError.code kommer fra backend (f.eks. "GAME_TYPE_NOT_FOUND",
 * "INVALID_INPUT", "VALIDATION_ERROR").
 */
export async function createGameManagement(
  payload: GameManagementFormPayload
): Promise<WriteResult> {
  try {
    const raw = await apiRequest<BackendGameManagement>(
      "/api/admin/game-management",
      { method: "POST", body: payload, auth: true }
    );
    return { ok: true, data: adaptRow(raw) };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        reason: "API_ERROR",
        code: err.code,
        message: err.message,
        status: err.status,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "API_ERROR",
      code: "UNKNOWN",
      message: msg,
      status: 0,
    };
  }
}

/** Oppdatér spill. `id` fra backend. */
export async function updateGameManagement(
  id: string,
  patch: Partial<GameManagementFormPayload> & {
    totalSold?: number;
    totalEarning?: number;
  }
): Promise<WriteResult> {
  try {
    const raw = await apiRequest<BackendGameManagement>(
      `/api/admin/game-management/${encodeURIComponent(id)}`,
      { method: "PATCH", body: patch, auth: true }
    );
    return { ok: true, data: adaptRow(raw) };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        reason: "API_ERROR",
        code: err.code,
        message: err.message,
        status: err.status,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "API_ERROR", code: "UNKNOWN", message: msg, status: 0 };
  }
}

/**
 * Legacy alias — saveGameManagement = createGameManagement (nytt), eller update
 * (eksisterende). Beholdt for bakoverkompatibilitet med tidligere placeholder.
 */
export async function saveGameManagement(
  payload: GameManagementFormPayload,
  existingId?: string
): Promise<WriteResult> {
  if (existingId) return updateGameManagement(existingId, payload);
  return createGameManagement(payload);
}

/** Repeat-game (BIN-622). */
export async function repeatGame(payload: RepeatGamePayload): Promise<WriteResult> {
  try {
    const body: Record<string, unknown> = { startDate: payload.startDate };
    if (payload.endDate !== undefined) body.endDate = payload.endDate;
    if (payload.name !== undefined && payload.name !== null) body.name = payload.name;
    if (payload.repeatToken !== undefined && payload.repeatToken !== null) {
      body.repeatToken = payload.repeatToken;
    }
    const raw = await apiRequest<BackendGameManagement>(
      `/api/admin/game-management/${encodeURIComponent(payload.sourceGameId)}/repeat`,
      { method: "POST", body, auth: true }
    );
    return { ok: true, data: adaptRow(raw) };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        reason: "API_ERROR",
        code: err.code,
        message: err.message,
        status: err.status,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "API_ERROR", code: "UNKNOWN", message: msg, status: 0 };
  }
}

/** PLACEHOLDER — close-day endpoint (BIN-623). */
export async function closeDay(_payload: CloseDayPayload): Promise<WriteResult> {
  return { ok: false, reason: "BACKEND_MISSING", issue: "BIN-623" };
}

/** Slett spill. `hard=true` query tillater hard-delete når det ikke er barn-data. */
export async function deleteGameManagement(
  _typeId: string,
  id: string,
  options: { hard?: boolean } = {}
): Promise<WriteResult<{ softDeleted: boolean }>> {
  try {
    const query = options.hard ? "?hard=true" : "";
    const raw = await apiRequest<{ softDeleted: boolean }>(
      `/api/admin/game-management/${encodeURIComponent(id)}${query}`,
      { method: "DELETE", auth: true }
    );
    return { ok: true, data: raw };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        reason: "API_ERROR",
        code: err.code,
        message: err.message,
        status: err.status,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "API_ERROR", code: "UNKNOWN", message: msg, status: 0 };
  }
}

/**
 * True if the given GameType is "Game 3"-shaped — admin uses a dedicated
 * add/view variant (`game3Add.html` / `game3View.html`) with pattern-selector
 * grid instead of the sub-game multi-select.
 */
export function isGame3Variant(gt: Pick<GameType, "type"> | null | undefined): boolean {
  return gt?.type === "game_3";
}

/**
 * True if the given GameType is "Game 1"-shaped — admin kan konfigurere
 * bingo-spesifikke felter (timing, ticket-farger, pattern-prize-grid, jackpot).
 */
export function isGame1Variant(gt: Pick<GameType, "type"> | null | undefined): boolean {
  return gt?.type === "game_1";
}
