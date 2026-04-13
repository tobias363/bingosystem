// ── REST API response types ─────────────────────────────────────────────────

/** Standard response wrapper for all Spillorama REST endpoints. */
export interface ApiResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: { code: string; message: string };
}

export type ApiResult<T = unknown> = ApiResponse<T> | ApiError;

// ── User & Auth ─────────────────────────────────────────────────────────────

export type UserRole = "ADMIN" | "HALL_OPERATOR" | "SUPPORT" | "PLAYER";
export type KycStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface PublicAppUser {
  id: string;
  email: string;
  displayName: string;
  surname?: string;
  phone?: string;
  walletId: string;
  role: UserRole;
  kycStatus: KycStatus;
  birthDate?: string;
  kycVerifiedAt?: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionInfo {
  accessToken: string;
  expiresAt: string;
  user: PublicAppUser;
}

// ── Games & Halls ───────────────────────────────────────────────────────────

export interface GameDefinition {
  slug: string;
  name: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface GameStatusInfo {
  status: "OPEN" | "STARTING" | "CLOSED";
  nextRoundAt: string | null;
}

export interface HallDefinition {
  id: string;
  name: string;
  organizationName?: string;
  settlementName?: string;
}

// ── Wallet & Compliance ─────────────────────────────────────────────────────

export interface WalletAccount {
  id: string;
  balance: number;
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

export interface PlayerComplianceSnapshot {
  dailyLossLimit?: number;
  monthlyLossLimit?: number;
  timedPauseUntil?: string;
  selfExcludedUntil?: string;
  dailyLoss: number;
  monthlyLoss: number;
}
