export type Role = "admin" | "super-admin" | "agent" | "hall-operator";

export interface SessionHall {
  id: string;
  name: string;
  /** Group of halls (optional — populated by /api/agent/context for AGENT/HALL_OPERATOR). */
  groupName?: string;
}

export interface Session {
  id: string;
  name: string;
  email: string;
  role: Role;
  isSuperAdmin: boolean;
  avatar: string;
  hall: SessionHall[];
  dailyBalance: number | null;
  permissions: Record<string, PermissionFlags>;
}

/**
 * True if the session should land in the agent-portal (`/agent/*`) after login.
 * AGENT and HALL_OPERATOR share the portal per Agent V1.0/V2.0 wireframes —
 * HALL_OPERATOR is a super-agent who can operate any hall in their group.
 */
export function isAgentPortalRole(role: Role): boolean {
  return role === "agent" || role === "hall-operator";
}

/**
 * True if the session belongs to admin-panel (`/admin/*`). ADMIN + super-admin
 * only — HALL_OPERATOR moved to the agent-portal per Agent-portal skeleton PR.
 */
export function isAdminPanelRole(role: Role): boolean {
  return role === "admin" || role === "super-admin";
}

/**
 * Resolve the landing-route for a given role after successful login. Called
 * by LoginPage + role-guards in the router.
 */
export function landingRouteForRole(role: Role): string {
  if (isAgentPortalRole(role)) return "/agent/dashboard";
  return "/admin";
}

export interface PermissionFlags {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

let current: Session | null = null;

export function setSession(s: Session | null): void {
  current = s;
  if (!s) clearAdminActiveHall();
  window.dispatchEvent(new CustomEvent("session:changed", { detail: { session: s } }));
}

export function getSession(): Session | null {
  return current;
}

export function requireSession(): Session {
  if (!current) throw new Error("No active session");
  return current;
}

// ── ADMIN super-user hall-impersonation ────────────────────────────────────
// Tobias 2026-04-27 pilot-blokker: ADMIN må kunne åpne Cash inn/ut og se
// alle haller via super-user-vy uten å være låst til én primær-hall.

const ADMIN_ACTIVE_HALL_STORAGE_KEY = "spillorama.admin.activeHall";

interface AdminActiveHallStored {
  id: string;
  name: string;
  groupName?: string;
}

export function setAdminActiveHall(hall: SessionHall | null): void {
  if (typeof window === "undefined") return;
  try {
    if (hall) {
      const data: AdminActiveHallStored = { id: hall.id, name: hall.name };
      if (hall.groupName) data.groupName = hall.groupName;
      window.localStorage.setItem(ADMIN_ACTIVE_HALL_STORAGE_KEY, JSON.stringify(data));
    } else {
      window.localStorage.removeItem(ADMIN_ACTIVE_HALL_STORAGE_KEY);
    }
  } catch {
    // localStorage kan være låst i private-browsing.
  }
  window.dispatchEvent(
    new CustomEvent("session:admin-active-hall-changed", { detail: { hall } }),
  );
}

export function getAdminActiveHall(): SessionHall | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_ACTIVE_HALL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminActiveHallStored;
    if (!parsed.id || !parsed.name) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      ...(parsed.groupName ? { groupName: parsed.groupName } : {}),
    };
  } catch {
    return null;
  }
}

function clearAdminActiveHall(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ADMIN_ACTIVE_HALL_STORAGE_KEY);
  } catch {
    // best-effort cleanup at logout — ignore failures.
  }
}

/**
 * Resolverer hvilken hall den aktive økten "ser" akkurat nå.
 * - AGENT/HALL_OPERATOR: session.hall[0]
 * - ADMIN/super-admin: admin-active-hall fra localStorage (null = ikke valgt)
 */
export function getEffectiveHall(): SessionHall | null {
  if (!current) return null;
  if (isAgentPortalRole(current.role)) {
    return current.hall[0] ?? null;
  }
  if (isAdminPanelRole(current.role)) {
    return getAdminActiveHall();
  }
  return current.hall[0] ?? null;
}
