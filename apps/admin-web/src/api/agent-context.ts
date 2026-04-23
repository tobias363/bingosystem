// API wrapper for GET /api/agent/context — Agent-portal skeleton PR.
// Returns the operational context (assigned halls, primary hall, coarse
// capabilities) used by the Agent-portal header and side-nav.

import { apiRequest } from "./client.js";

export interface AgentContext {
  agent: {
    userId: string;
    email: string;
    displayName: string;
    role: "AGENT" | "HALL_OPERATOR";
  };
  hall: {
    id: string;
    name: string;
    slug: string;
    region: string;
  } | null;
  groupOfHalls: {
    id: string;
    name: string;
  } | null;
  assignedHalls: Array<{ id: string; name: string; isPrimary: boolean }>;
  capabilities: {
    canApprovePlayers: boolean;
    canSettle: boolean;
    canCreateUniqueId: boolean;
  };
}

export async function getAgentContext(): Promise<AgentContext> {
  return apiRequest<AgentContext>("/api/agent/context", { auth: true });
}
