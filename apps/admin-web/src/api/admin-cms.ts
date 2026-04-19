// PR-A6 (BIN-674) — admin-cms API-wrappers (stub + localStorage-fallback).
//
// Backend-gap: Ingen `/api/admin/cms/*` endpoints eksisterer i
// `apps/backend/src/routes/`. Når BIN-A6-CMS lander, erstattes localStorage-
// lag med faktiske apiRequest-kall.
//
// Håndterer to domener:
//   1. CMS text keys: terms, support, about_us, responsible_gaming, links.
//   2. FAQ: question/answer CRUD.
//
// Regulatorisk: Spillvett (responsible_gaming) krever AuditLog + versjonering
// før live edit tillates (BIN-A6-SPILLVETT-AUDIT, §11 pengespillforskriften).
// Siden dette ikke er på plass, er `setCmsText("responsible_gaming", ...)`
// blokkert på frontend-siden (se CmsTextEditPage regulatorisk-gate).

/** CMS-tekst-nøkler. Matcher legacy routes-navn (1:1 paritet for hall-ansatte). */
export type CmsTextKey =
  | "terms_of_service"
  | "support"
  | "about_us"
  | "responsible_gaming"
  | "links_of_other_agencies";

export interface CmsTextRecord {
  key: CmsTextKey;
  body: string;
  updatedAt: string;
}

export interface FaqRecord {
  id: string;
  queId: number;
  question: string;
  answer: string;
  updatedAt: string;
}

// ── localStorage keys ────────────────────────────────────────────────────────

const LS_CMS_TEXT_PREFIX = "bingo_admin_cms_text:";
const LS_FAQ_LIST_KEY = "bingo_admin_cms_faq_list";

function readLs<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLs<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — silently ignore (placeholder-flow)
  }
}

// ── CMS-tekst-CRUD ───────────────────────────────────────────────────────────

export async function getCmsText(key: CmsTextKey): Promise<CmsTextRecord> {
  const stored = readLs<CmsTextRecord | null>(LS_CMS_TEXT_PREFIX + key, null);
  if (stored) return stored;
  return {
    key,
    body: "",
    updatedAt: new Date(0).toISOString(),
  };
}

export async function setCmsText(key: CmsTextKey, body: string): Promise<CmsTextRecord> {
  const record: CmsTextRecord = {
    key,
    body,
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_CMS_TEXT_PREFIX + key, record);
  return record;
}

// ── FAQ-CRUD ─────────────────────────────────────────────────────────────────

export async function listFaq(): Promise<FaqRecord[]> {
  return readLs<FaqRecord[]>(LS_FAQ_LIST_KEY, []);
}

export async function getFaq(id: string): Promise<FaqRecord | null> {
  const list = await listFaq();
  return list.find((f) => f.id === id) ?? null;
}

export async function createFaq(input: { question: string; answer: string }): Promise<FaqRecord> {
  const list = await listFaq();
  const queId = list.length === 0 ? 1 : Math.max(...list.map((f) => f.queId)) + 1;
  const record: FaqRecord = {
    id: `faq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    queId,
    question: input.question,
    answer: input.answer,
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_FAQ_LIST_KEY, [...list, record]);
  return record;
}

export async function updateFaq(id: string, input: { question: string; answer: string }): Promise<FaqRecord | null> {
  const list = await listFaq();
  const idx = list.findIndex((f) => f.id === id);
  if (idx < 0) return null;
  const updated: FaqRecord = {
    ...list[idx]!,
    question: input.question,
    answer: input.answer,
    updatedAt: new Date().toISOString(),
  };
  const next = [...list];
  next[idx] = updated;
  writeLs(LS_FAQ_LIST_KEY, next);
  return updated;
}

export async function deleteFaq(id: string): Promise<boolean> {
  const list = await listFaq();
  const next = list.filter((f) => f.id !== id);
  if (next.length === list.length) return false;
  writeLs(LS_FAQ_LIST_KEY, next);
  return true;
}
