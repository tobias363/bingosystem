import type {
  ApiResult,
  PublicAppUser,
  GameDefinition,
  GameStatusInfo,
  HallDefinition,
  WalletAccount,
  Transaction,
  PlayerComplianceSnapshot,
} from "@spillorama/shared-types/api";
import type { RoomSnapshot, RoomSummary } from "@spillorama/shared-types/game";

const TOKEN_KEY = "spillorama.accessToken";

function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

/**
 * Type-safe REST client for the Spillorama backend.
 *
 * Uses the web shell's authenticatedFetch when available (handles 401 token
 * refresh automatically). Falls back to direct fetch with Bearer token.
 */
export class SpilloramaApi {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // ── Generic request ───────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // Prefer web shell's authenticatedFetch (auto-refresh on 401)
    const shellAuth = (window as unknown as Record<string, unknown>).SpilloramaAuth as
      | { authenticatedFetch?: (path: string, init?: RequestInit) => Promise<Response> }
      | undefined;

    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };

    let res: Response;
    if (shellAuth?.authenticatedFetch) {
      res = await shellAuth.authenticatedFetch(path, init);
    } else {
      res = await fetch(`${this.baseUrl}${path}`, init);
    }

    return res.json() as Promise<ApiResult<T>>;
  }

  private get<T>(path: string): Promise<ApiResult<T>> {
    return this.request("GET", path);
  }

  private post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.request("POST", path, body);
  }

  // ── Auth / Profile ────────────────────────────────────────────────────

  getProfile(): Promise<ApiResult<PublicAppUser>> {
    return this.get("/api/auth/me");
  }

  // ── Games ─────────────────────────────────────────────────────────────

  getGames(): Promise<ApiResult<GameDefinition[]>> {
    return this.get("/api/games");
  }

  getGameStatus(): Promise<ApiResult<Record<string, GameStatusInfo>>> {
    return this.get("/api/games/status");
  }

  // ── Halls ─────────────────────────────────────────────────────────────

  getHalls(): Promise<ApiResult<HallDefinition[]>> {
    return this.get("/api/halls");
  }

  // ── Rooms ─────────────────────────────────────────────────────────────

  getRooms(hallId?: string): Promise<ApiResult<RoomSummary[]>> {
    const query = hallId ? `?hallId=${encodeURIComponent(hallId)}` : "";
    return this.get(`/api/rooms${query}`);
  }

  getRoomSnapshot(roomCode: string): Promise<ApiResult<RoomSnapshot>> {
    return this.get(`/api/rooms/${encodeURIComponent(roomCode)}`);
  }

  // ── Wallet ────────────────────────────────────────────────────────────

  getWallet(): Promise<ApiResult<{ account: WalletAccount; transactions: Transaction[] }>> {
    return this.get("/api/wallet/me");
  }

  getCompliance(hallId?: string): Promise<ApiResult<PlayerComplianceSnapshot>> {
    const query = hallId ? `?hallId=${encodeURIComponent(hallId)}` : "";
    return this.get(`/api/wallet/me/compliance${query}`);
  }

  getTransactions(limit = 50): Promise<ApiResult<Transaction[]>> {
    return this.get(`/api/wallet/me/transactions?limit=${limit}`);
  }
}
