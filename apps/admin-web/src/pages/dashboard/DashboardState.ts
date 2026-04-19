import { fetchSummaryCounts, fetchTopPlayers, listRooms, type SummaryCounts, type TopPlayerRow, type AdminRoomSummary } from "../../api/dashboard.js";
import { listPendingRequests, type PaymentRequest } from "../../api/paymentRequests.js";

export type GameTab = "game1" | "game2" | "game3" | "game4" | "game5";

export const GAME_TABS: GameTab[] = ["game1", "game2", "game3", "game4", "game5"];

// Mapping from the new Spillorama room-slug taxonomy to the legacy Game1-5 tabs.
// Keeps parity with legacy /dashboard/ongoingGames/:gameType semantics.
const ROOM_GAME_MAPPING: Record<string, GameTab> = {
  bingo: "game1",
  "bingo-1-75": "game1",
  "bingo-90": "game2",
  jackpot: "game3",
  "wheel-of-fortune": "game4",
  wheel: "game4",
  "treasure-chest": "game5",
  chest: "game5",
};

export function classifyRoom(room: AdminRoomSummary): GameTab {
  const slug = (room.currentGame?.gameSlug ?? room.currentGame?.gameType ?? room.gameSlug ?? "").toLowerCase();
  return ROOM_GAME_MAPPING[slug] ?? "game1";
}

export interface DashboardData {
  summary: SummaryCounts;
  latestRequests: PaymentRequest[];
  topPlayers: TopPlayerRow[] | null;
  ongoingGames: Record<GameTab, AdminRoomSummary[]>;
  fetchedAt: number;
}

export function emptyOngoingGames(): Record<GameTab, AdminRoomSummary[]> {
  return { game1: [], game2: [], game3: [], game4: [], game5: [] };
}

export async function fetchDashboardData(opts: { hallId?: string } = {}): Promise<DashboardData> {
  const [summary, latestRequests, topPlayers, rooms] = await Promise.all([
    fetchSummaryCounts(),
    listPendingRequests({ kind: "deposit", hallId: opts.hallId, limit: 5 }).catch(() => [] as PaymentRequest[]),
    fetchTopPlayers(5).catch(() => null),
    listRooms().catch(() => [] as AdminRoomSummary[]),
  ]);

  const ongoing = emptyOngoingGames();
  for (const room of rooms) {
    if (!room.currentGame) continue;
    const tab = classifyRoom(room);
    ongoing[tab].push(room);
  }

  return {
    summary,
    latestRequests,
    topPlayers,
    ongoingGames: ongoing,
    fetchedAt: Date.now(),
  };
}

// ── Polling controller ───────────────────────────────────────────────────────

export interface PollController {
  stop: () => void;
  refreshNow: () => Promise<void>;
}

export function startPolling(
  intervalMs: number,
  onData: (data: DashboardData) => void,
  onError: (err: unknown) => void,
  opts: { hallId?: string } = {}
): PollController {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (document.hidden) {
      schedule();
      return;
    }
    try {
      const data = await fetchDashboardData(opts);
      if (!stopped) onData(data);
    } catch (e) {
      if (!stopped) onError(e);
    } finally {
      schedule();
    }
  };

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => void tick(), intervalMs);
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    refreshNow: tick,
  };
}
