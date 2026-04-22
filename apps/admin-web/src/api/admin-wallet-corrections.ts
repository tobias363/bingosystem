// PR-W5 wallet-split: admin wallet-correction API wrapper.
//
// Thin wrapper rundt `POST /api/admin/wallets/:walletId/credit` som ble
// introdusert i PR-W2 (apps/backend/src/routes/adminWallet.ts).
//
// Regulatorisk:
//   - `to: "winnings"` er server-side BLOKKERT (HTTP 403
//     ADMIN_WINNINGS_CREDIT_FORBIDDEN per §11 pengespillforskriften).
//   - Klient-UI har `winnings`-option disabled for defense-in-depth, men
//     hvis en ond-aktør slipper gjennom UI-gate'n får de fortsatt 403.
//   - Kun admin-rolle med WALLET_COMPLIANCE_WRITE har adgang (auth-guard i
//     routeren).
//
// Referanser:
//   - docs/architecture/WALLET_SPLIT_DESIGN_2026-04-22.md §3.2 + §5.3
//   - apps/backend/src/routes/adminWallet.ts (backend)

import { apiRequest } from "./client.js";
import type { WalletAccountSide, WalletTransaction } from "./admin-wallets.js";

export interface WalletCreditCorrectionInput {
  /** Beløp i kroner (NOK). Positivt tall. */
  amount: number;
  /** Menneskelig lesbar begrunnelse (obligatorisk — audit-spor). */
  reason: string;
  /**
   * Hvilken side. Default `"deposit"`. `"winnings"` BLOKKERES av server-gate
   * (HTTP 403 ADMIN_WINNINGS_CREDIT_FORBIDDEN) — UI-klient disabler denne
   * muligheten for defense-in-depth.
   */
  to?: WalletAccountSide;
  /**
   * Idempotency-key (anbefalt for retry-sikkerhet — hvis samme key sendes to
   * ganger returnerer server uendret resultat fra første kall).
   */
  idempotencyKey?: string;
}

export interface WalletCreditCorrectionResponse {
  transaction: WalletTransaction;
}

/**
 * Send en manuell wallet-kredit-korreksjon mot backend. Returnerer den nye
 * transaksjonen (inkludert `split`-fordeling) ved suksess, eller kaster
 * `ApiError` med `status: 403` + `code: "ADMIN_WINNINGS_CREDIT_FORBIDDEN"` for
 * regulatoriske avvisninger.
 */
export function submitWalletCorrection(
  walletId: string,
  input: WalletCreditCorrectionInput
): Promise<WalletCreditCorrectionResponse> {
  return apiRequest<WalletCreditCorrectionResponse>(
    `/api/admin/wallets/${encodeURIComponent(walletId)}/credit`,
    {
      method: "POST",
      auth: true,
      body: {
        amount: input.amount,
        reason: input.reason,
        ...(input.to !== undefined ? { to: input.to } : {}),
        ...(input.idempotencyKey !== undefined
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      },
    }
  );
}
