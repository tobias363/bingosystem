import { apiRequest, ApiError } from "./client.js";

// ── Halls ────────────────────────────────────────────────────────────────────

export interface AdminHall {
  id: string;
  name: string;
  isActive: boolean;
}

export async function listHalls(): Promise<AdminHall[]> {
  const raw = await apiRequest<AdminHall[] | { halls: AdminHall[] }>("/api/admin/halls?includeInactive=true", { auth: true });
  if (Array.isArray(raw)) return raw;
  return raw.halls ?? [];
}

// ── Admin users (agents) ─────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  isActive?: boolean;
  isDeleted?: boolean;
}

export async function listAgents(): Promise<AdminUser[]> {
  try {
    const res = await apiRequest<{ users: AdminUser[]; count: number }>(
      "/api/admin/users?role=agent",
      { auth: true }
    );
    return res.users;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return [];
    throw err;
  }
}

// ── Rooms (source for ongoing games) ─────────────────────────────────────────

export interface AdminRoomSummary {
  code: string;
  hallId: string;
  hallName?: string;
  gameSlug?: string;
  status?: string;
  currentGame?: {
    id: string;
    status: string;
    gameType?: string;
    gameSlug?: string;
    startedAt?: string;
    endsAt?: string;
    ticketPrice?: number;
    minTicketCount?: number;
    luckyNumberPrize?: number;
  } | null;
  createdAt?: string;
}

export async function listRooms(): Promise<AdminRoomSummary[]> {
  const raw = await apiRequest<AdminRoomSummary[]>("/api/admin/rooms", { auth: true });
  return Array.isArray(raw) ? raw : [];
}

// ── Players — approved count ─────────────────────────────────────────────────

// No dedicated `/api/admin/players/stats` yet (flagged as BIN-A2-API-2-approved).
// `players/search` requires a non-empty query — we can't use it for totals.
// Return null; DashboardPage displays `"—"` until the stats-endpoint lands.
export async function fetchApprovedPlayerCount(): Promise<number | null> {
  return null;
}

// ── Top 5 players — not yet available (BIN-A2-API-2) ─────────────────────────

export interface TopPlayerRow {
  id: string;
  username: string;
  avatar?: string;
  walletAmount: number;
}

export async function fetchTopPlayers(limit = 5): Promise<TopPlayerRow[] | null> {
  try {
    const raw = await apiRequest<{ players: TopPlayerRow[] } | TopPlayerRow[]>(
      `/api/admin/players/top?metric=wallet&limit=${limit}`,
      { auth: true }
    );
    if (Array.isArray(raw)) return raw;
    return raw.players ?? [];
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      // Endpoint not implemented yet — BIN-A2-API-2.
      return null;
    }
    if (err instanceof ApiError && err.status === 403) return [];
    throw err;
  }
}

// ── Hall groups — not yet available (BIN-A2-API-1) ───────────────────────────

export interface HallGroup {
  id: string;
  name: string;
  isActive: boolean;
}

export async function fetchHallGroups(): Promise<HallGroup[] | null> {
  try {
    const raw = await apiRequest<{ groups: HallGroup[] } | HallGroup[]>("/api/admin/hall-groups", { auth: true });
    if (Array.isArray(raw)) return raw;
    return raw.groups ?? [];
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      // Endpoint not implemented yet — BIN-A2-API-1.
      return null;
    }
    if (err instanceof ApiError && err.status === 403) return [];
    throw err;
  }
}

// ── Convenience aggregate ────────────────────────────────────────────────────

export interface SummaryCounts {
  totalApprovedPlayers: number | null;
  activeAgents: { active: number; total: number } | null;
  activeHallGroups: { active: number; total: number } | null;
  activeHalls: { active: number; total: number };
}

export async function fetchSummaryCounts(): Promise<SummaryCounts> {
  const [players, agents, groups, halls] = await Promise.all([
    fetchApprovedPlayerCount(),
    listAgents().catch(() => [] as AdminUser[]),
    fetchHallGroups(),
    listHalls().catch(() => [] as AdminHall[]),
  ]);

  const agentTotals = agents.length
    ? {
        active: agents.filter((a) => a.isActive !== false && a.isDeleted !== true).length,
        total: agents.length,
      }
    : null;

  const hallGroupTotals = groups
    ? { active: groups.filter((g) => g.isActive).length, total: groups.length }
    : null;

  const hallTotals = {
    active: halls.filter((h) => h.isActive).length,
    total: halls.length,
  };

  return {
    totalApprovedPlayers: players,
    activeAgents: agentTotals,
    activeHallGroups: hallGroupTotals,
    activeHalls: hallTotals,
  };
}
