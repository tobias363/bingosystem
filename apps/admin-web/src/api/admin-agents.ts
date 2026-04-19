// PR-A5 (BIN-663) — admin-agents API-wrappers.
//
// Dekker agent-CRUD via /api/admin/agents (backend: apps/backend/src/
// routes/adminAgents.ts, BIN-583 B3.1). AGENT er egen role-enum med
// multi-hall-tilhørighet (app_agent_halls) — separat ressurs fra
// app_users for å holde shift/cash/settlement-kolonner utenfor vanlig
// user-tabell.
//
// RBAC (gjenspeiles i wrapper-API, men håndheves i backend):
//   - AGENT_READ:   ADMIN, HALL_OPERATOR, SUPPORT
//   - AGENT_WRITE:  ADMIN, HALL_OPERATOR (hall-scope for HO)
//   - AGENT_DELETE: ADMIN only
//
// Envelope: backend returnerer `{ agents, limit, offset }` for list og
// full AgentProfile for CRUD.

import { apiRequest } from "./client.js";

// ── Kjerne-typer (speiler backend AgentStore.ts) ─────────────────────────────

export type AgentStatus = "active" | "inactive";

export interface AgentHallAssignment {
  userId: string;
  hallId: string;
  isPrimary: boolean;
  assignedAt: string;
  assignedByUserId: string | null;
}

export interface Agent {
  userId: string;
  email: string;
  displayName: string;
  surname: string | null;
  phone: string | null;
  role: "AGENT";
  agentStatus: AgentStatus;
  language: string;
  avatarFilename: string | null;
  parentUserId: string | null;
  halls: AgentHallAssignment[];
  createdAt: string;
  updatedAt: string;
}

interface AgentListEnvelope {
  agents: Agent[];
  limit: number;
  offset: number;
}

// ── Liste + filter ───────────────────────────────────────────────────────────

export interface ListAgentsParams {
  hallId?: string;
  status?: AgentStatus;
  limit?: number;
  offset?: number;
}

export async function listAgents(params: ListAgentsParams = {}): Promise<Agent[]> {
  const qs = new URLSearchParams();
  if (params.hallId) qs.set("hallId", params.hallId);
  if (params.status) qs.set("status", params.status);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const env = await apiRequest<AgentListEnvelope>(`/api/admin/agents${suffix}`, {
    auth: true,
  });
  return env.agents;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateAgentInput {
  email: string;
  password: string;
  displayName: string;
  surname: string;
  phone?: string;
  language?: string;
  parentUserId?: string | null;
  hallIds?: string[];
  primaryHallId?: string;
}

export function createAgent(input: CreateAgentInput): Promise<Agent> {
  return apiRequest<Agent>("/api/admin/agents", {
    method: "POST",
    body: input,
    auth: true,
  });
}

export function getAgent(id: string): Promise<Agent> {
  return apiRequest<Agent>(`/api/admin/agents/${encodeURIComponent(id)}`, {
    auth: true,
  });
}

export interface UpdateAgentInput {
  displayName?: string;
  email?: string;
  phone?: string | null;
  language?: string;
  avatarFilename?: string | null;
  agentStatus?: AgentStatus;
  parentUserId?: string | null;
  hallIds?: string[];
  primaryHallId?: string;
}

export function updateAgent(id: string, patch: UpdateAgentInput): Promise<Agent> {
  return apiRequest<Agent>(`/api/admin/agents/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: patch,
    auth: true,
  });
}

/**
 * Soft-delete agent. Backend blokkerer hvis agenten har aktiv shift —
 * feil kastes som ApiError med code "AGENT_HAS_ACTIVE_SHIFT".
 */
export function deleteAgent(id: string): Promise<{ deleted: true }> {
  return apiRequest<{ deleted: true }>(
    `/api/admin/agents/${encodeURIComponent(id)}`,
    { method: "DELETE", auth: true }
  );
}
