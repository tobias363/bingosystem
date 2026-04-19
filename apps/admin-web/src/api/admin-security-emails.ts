// PR-B4 (BIN-646) — admin withdraw-email-allowlist API wrappers.
// Thin wrappers around `apps/backend/src/routes/adminSecurity.ts`.
//
// Menypunktet lever under `/withdraw/list/emails` i admin-web (matcher legacy
// Amountwithdraw/emails.html), men selve endepunktet ligger under
// /api/admin/security/withdraw-emails for at backend-modularisering speiler
// pengespillforskriften-domenet "security" fremfor legacy-menystruktur.
//
// Permissions:
//   - list:   SECURITY_READ  (ADMIN, HALL_OPERATOR, SUPPORT)
//   - add/del: SECURITY_WRITE (ADMIN kun)
//
// Edit: backend har ikke PATCH-endepunkt. Frontend gjør DELETE + POST
// (se PR-B4-PLAN §2.6 G4). Uniqueness fanges av DB-constraint som returnerer
// WITHDRAW_EMAIL_EXISTS-feilkode.

import { apiRequest } from "./client.js";

export interface WithdrawEmail {
  id: string;
  email: string;
  label: string | null;
  addedBy: string;
  createdAt: string;
}

export interface ListWithdrawEmailsResponse {
  emails: WithdrawEmail[];
  count: number;
}

export function listWithdrawEmails(): Promise<ListWithdrawEmailsResponse> {
  return apiRequest<ListWithdrawEmailsResponse>(
    "/api/admin/security/withdraw-emails",
    { auth: true }
  );
}

export interface AddWithdrawEmailBody {
  email: string;
  label?: string | null;
}

export function addWithdrawEmail(body: AddWithdrawEmailBody): Promise<WithdrawEmail> {
  return apiRequest<WithdrawEmail>("/api/admin/security/withdraw-emails", {
    method: "POST",
    body,
    auth: true,
  });
}

export function deleteWithdrawEmail(id: string): Promise<{ deleted: true }> {
  return apiRequest<{ deleted: true }>(
    `/api/admin/security/withdraw-emails/${encodeURIComponent(id)}`,
    { method: "DELETE", auth: true }
  );
}
