// PR-B4 (BIN-646) — admin payment-request API wrappers.
// Thin wrappers around `apps/backend/src/routes/paymentRequests.ts`. Dekker
// både deposit-kø (TransactionManagement) og withdraw-kø (Amountwithdraw).
//
// Permissions:
//   - list/get: PAYMENT_REQUEST_READ (ADMIN, HALL_OPERATOR, SUPPORT)
//   - accept/reject: PAYMENT_REQUEST_WRITE (ADMIN, HALL_OPERATOR)
// HALL_OPERATOR er hall-scoped via BIN-591 — backend tvinger hallId til
// egen hall uavhengig av query-param.
//
// DTO-er: PaymentRequest/Kind/Status/DestinationType er typekontrakter
// definert i packages/shared-types/src/api.ts (single source of truth, brukes
// også av backend-route-handlerne). admin-web har ikke @spillorama/shared-types
// som workspace-dependency ennå, derfor bruker vi relativ path-import samme
// mønster som pages/games/common/types.ts.

import { apiRequest } from "./client.js";
import type {
  PaymentRequest,
  PaymentRequestKind,
  PaymentRequestStatus,
  PaymentRequestDestinationType,
  ListPaymentRequestsResponse,
  AcceptPaymentRequestBody,
  RejectPaymentRequestBody,
} from "../../../../packages/shared-types/src/api.js";

// Re-eksport slik at page-kode kan importere fra én kanal (./api/admin-payments).
export type {
  PaymentRequest,
  PaymentRequestKind,
  PaymentRequestStatus,
  PaymentRequestDestinationType,
  ListPaymentRequestsResponse,
  AcceptPaymentRequestBody,
  RejectPaymentRequestBody,
};

export interface ListPaymentRequestsParams {
  type?: PaymentRequestKind;
  status?: PaymentRequestStatus;
  /**
   * CSV av statuser (f.eks. "ACCEPTED,REJECTED" for historikk).
   * Overstyrer `status` når begge er satt.
   */
  statuses?: PaymentRequestStatus[];
  destinationType?: PaymentRequestDestinationType;
  hallId?: string;
  limit?: number;
}

export function listPaymentRequests(
  params: ListPaymentRequestsParams = {}
): Promise<ListPaymentRequestsResponse> {
  const q = new URLSearchParams();
  if (params.type) q.set("type", params.type);
  if (params.status) q.set("status", params.status);
  if (params.statuses && params.statuses.length) q.set("statuses", params.statuses.join(","));
  if (params.destinationType) q.set("destinationType", params.destinationType);
  if (params.hallId) q.set("hallId", params.hallId);
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiRequest<ListPaymentRequestsResponse>(
    `/api/admin/payments/requests${qs ? `?${qs}` : ""}`,
    { auth: true }
  );
}

export interface AcceptPaymentRequestResponse {
  request: PaymentRequest;
}

export function acceptPaymentRequest(
  id: string,
  body: AcceptPaymentRequestBody
): Promise<AcceptPaymentRequestResponse> {
  return apiRequest<AcceptPaymentRequestResponse>(
    `/api/admin/payments/requests/${encodeURIComponent(id)}/accept`,
    { method: "POST", body, auth: true }
  );
}

export function rejectPaymentRequest(
  id: string,
  body: RejectPaymentRequestBody
): Promise<AcceptPaymentRequestResponse> {
  return apiRequest<AcceptPaymentRequestResponse>(
    `/api/admin/payments/requests/${encodeURIComponent(id)}/reject`,
    { method: "POST", body, auth: true }
  );
}
