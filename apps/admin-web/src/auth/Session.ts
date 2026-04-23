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
  window.dispatchEvent(new CustomEvent("session:changed", { detail: { session: s } }));
}

export function getSession(): Session | null {
  return current;
}

export function requireSession(): Session {
  if (!current) throw new Error("No active session");
  return current;
}
