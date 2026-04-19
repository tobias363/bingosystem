// PR-B4 (BIN-646) — admin wallet API wrappers.
// Thin wrappers around `apps/backend/src/routes/wallet.ts` for
// walletManagement-listen og viewWallet-detaljvisning.

import { apiRequest } from "./client.js";

export interface WalletAccount {
  id: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export type WalletTransactionType =
  | "DEBIT"
  | "CREDIT"
  | "TOPUP"
  | "WITHDRAWAL"
  | "TRANSFER_OUT"
  | "TRANSFER_IN";

export interface WalletTransaction {
  id: string;
  accountId: string;
  type: WalletTransactionType;
  amount: number;
  reason: string;
  createdAt: string;
  relatedAccountId?: string;
}

export interface WalletDetail {
  account: WalletAccount;
  transactions: WalletTransaction[];
}

export function listWallets(): Promise<WalletAccount[]> {
  return apiRequest<WalletAccount[]>("/api/wallets", { auth: true });
}

export function getWallet(walletId: string): Promise<WalletDetail> {
  return apiRequest<WalletDetail>(
    `/api/wallets/${encodeURIComponent(walletId)}`,
    { auth: true }
  );
}

export function listWalletTransactions(
  walletId: string,
  limit = 100
): Promise<WalletTransaction[]> {
  return apiRequest<WalletTransaction[]>(
    `/api/wallets/${encodeURIComponent(walletId)}/transactions?limit=${limit}`,
    { auth: true }
  );
}
