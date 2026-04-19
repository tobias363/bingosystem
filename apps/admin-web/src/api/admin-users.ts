// PR-A5 (BIN-663) — admin-users API-wrappers.
//
// Dekker admin/user-siden av konsolidert /api/admin/users-endpointen
// (backend: apps/backend/src/routes/adminUsers.ts, BIN-587 B6).
//
// Ny backend har én app_users-tabell differentiert på role-enum
// (ADMIN|SUPPORT|HALL_OPERATOR|AGENT|PLAYER). Admin-UI viser tre separate
// sider (AdminListPage, UserListPage, AgentListPage) for 1:1 UX-paritet
// med legacy, men alle filtrerer samme endpoint under panseret bortsett fra
// agent-listen som går via /api/admin/agents (egen ressurs — AgentService).
//
// Envelope: apiRequest pakker ut `{ ok, data }`. List-endpointet returnerer
// `{ users, count }`, så listAdminUsers unpacker `.users` for callere.

import { apiRequest } from "./client.js";

// ── Kjerne-typer ─────────────────────────────────────────────────────────────

/** Admin-panel user-role enum. Samme navngiving som backend UserRole. */
export type AdminUserRole = "ADMIN" | "SUPPORT" | "HALL_OPERATOR";

/** Full user-role inkl. AGENT/PLAYER (for role-assignment endpoints). */
export type UserRole = "ADMIN" | "SUPPORT" | "HALL_OPERATOR" | "AGENT" | "PLAYER";

/** KYC-status (re-exportert her for convenience i admin-sider). */
export type KycStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

/** Admin-panel bruker (ADMIN/SUPPORT/HALL_OPERATOR). */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  surname: string | null;
  phone: string | null;
  role: UserRole;
  hallId: string | null;
  kycStatus: KycStatus;
  createdAt: string;
  updatedAt: string;
}

interface AdminUserListEnvelope {
  users: AdminUser[];
  count: number;
}

// ── Liste + filter ───────────────────────────────────────────────────────────

export interface ListAdminUsersParams {
  /** Eksakt match mot enum. Backend tar én role ad gangen. */
  role?: AdminUserRole;
  includeDeleted?: boolean;
  limit?: number;
}

/**
 * Liste admin/support/hall-operator-brukere.
 *
 * Backend-endpoint tar ett role-filter ad gangen (query `?role=ADMIN`).
 * For UI-siden som trenger flere roller (f.eks. `/user` list med SUPPORT +
 * HALL_OPERATOR) — kall `listAdminUsers` per role og slå sammen, evt. bruk
 * `listAdminUsersMultiRole` helper nedenfor.
 */
export async function listAdminUsers(
  params: ListAdminUsersParams = {}
): Promise<AdminUser[]> {
  const qs = new URLSearchParams();
  if (params.role) qs.set("role", params.role);
  if (params.includeDeleted) qs.set("includeDeleted", "1");
  if (params.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const env = await apiRequest<AdminUserListEnvelope>(`/api/admin/users${suffix}`, {
    auth: true,
  });
  return env.users;
}

/**
 * Convenience-helper: liste brukere fra flere roller og slå sammen.
 *
 * Brukes av `/user`-siden som legacy listet både SUPPORT + HALL_OPERATOR.
 * Backend støtter ikke multi-role i ett kall, så vi sekvenserer.
 */
export async function listAdminUsersMultiRole(
  roles: AdminUserRole[],
  opts: { includeDeleted?: boolean; limit?: number } = {}
): Promise<AdminUser[]> {
  const results = await Promise.all(
    roles.map((role) => listAdminUsers({ role, ...opts }))
  );
  return results.flat();
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export interface CreateAdminUserInput {
  email: string;
  password: string;
  displayName: string;
  surname: string;
  role: AdminUserRole;
  phone?: string;
  hallId?: string | null;
}

export function createAdminUser(input: CreateAdminUserInput): Promise<AdminUser> {
  return apiRequest<AdminUser>("/api/admin/users", {
    method: "POST",
    body: input,
    auth: true,
  });
}

export function getAdminUser(id: string): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`, {
    auth: true,
  });
}

export interface UpdateAdminUserInput {
  displayName?: string;
  email?: string;
  phone?: string;
}

export function updateAdminUser(
  id: string,
  patch: UpdateAdminUserInput
): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: patch,
    auth: true,
  });
}

export function deleteAdminUser(id: string): Promise<{ deleted: true }> {
  return apiRequest<{ deleted: true }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    { method: "DELETE", auth: true }
  );
}

export function resetAdminUserPassword(id: string): Promise<{ initiated: true }> {
  return apiRequest<{ initiated: true }>(
    `/api/admin/users/${encodeURIComponent(id)}/reset-password`,
    { method: "POST", body: {}, auth: true }
  );
}

// ── Role + hall assignment (utenfor /users-resource) ─────────────────────────
//
// Disse endpoints ligger i apps/backend/src/routes/admin.ts og brukes av
// AdminEditRolePage og UserFormPage (hall-tildeling for HALL_OPERATOR).

/**
 * Tildel statisk role-enum til bruker.
 *
 * Legacy-rollen (dynamiske role-dokumenter) er erstattet med hard-kodet
 * permission-matrix pr. role (se AdminAccessPolicy.ts). UI-siden viser
 * matrix read-only og lar admin kun velge mellom de 5 static enum-verdiene.
 */
export function assignUserRole(
  userId: string,
  role: UserRole
): Promise<AdminUser> {
  return apiRequest<AdminUser>(
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    { method: "PUT", body: { role }, auth: true }
  );
}

/**
 * Tildel hall til HALL_OPERATOR-bruker (BIN-591). `null` fjerner tildeling.
 */
export function assignUserHall(
  userId: string,
  hallId: string | null
): Promise<AdminUser> {
  return apiRequest<AdminUser>(
    `/api/admin/users/${encodeURIComponent(userId)}/hall`,
    { method: "PUT", body: { hallId }, auth: true }
  );
}

// ── Permissions introspection ────────────────────────────────────────────────
//
// Brukes av AdminEditRolePage for å vise permission-matrix for valgt role.

export type AdminPermission = string;

export interface AdminPermissionsResponse {
  role: UserRole;
  permissions: AdminPermission[];
  permissionMap: Record<AdminPermission, boolean>;
  policy: Record<AdminPermission, readonly UserRole[]>;
}

export function getAdminPermissions(): Promise<AdminPermissionsResponse> {
  return apiRequest<AdminPermissionsResponse>("/api/admin/permissions", {
    auth: true,
  });
}
