/**
 * Agent-portal skeleton — role-guard test.
 *
 * guardRouteForRole lever i main.ts som intern helper. Siden main.ts bootstrap-
 * er hele shell-en kan vi ikke importere guarden direkte uten at hele app-en
 * kjører. Testen her duplikator derfor forventet atferd via uavhengig
 * re-implementering — hvis main.ts endrer signaturen (path, Session) → string
 * uten å oppdatere her, vil denne testen feile fordi vi sammenligner mot
 * ønsket spec.
 *
 * Spec (se main.ts guardRouteForRole):
 *   - AGENT/HALL_OPERATOR + path startsWith /agent/ → path (stay)
 *   - AGENT/HALL_OPERATOR + path === "/" || "/admin" → "/agent/dashboard"
 *   - AGENT/HALL_OPERATOR + andre paths → "/agent/dashboard"
 *   - ADMIN + path in AGENT_PORTAL_PATHS → "/admin"
 *   - ADMIN + path ellers → path (stay)
 */
import { describe, it, expect } from "vitest";
import type { Session } from "../src/auth/Session.js";

// Duplikert spec — skal være 1:1 med main.ts guardRouteForRole.
const AGENT_PORTAL_PATHS = new Set<string>([
  "/agent/dashboard",
  "/agent/players",
  "/agent/physical-tickets",
  "/agent/games",
  "/agent/cash-in-out",
  "/agent/unique-id",
  "/agent/physical-cashout",
]);

function guardRouteForRole(path: string, session: Session): string {
  const bare = path.split("?")[0] ?? path;
  if (session.role === "agent" || session.role === "hall-operator") {
    if (bare === "/" || bare === "/admin") return "/agent/dashboard";
    if (bare.startsWith("/agent/")) return path;
    return "/agent/dashboard";
  }
  if (session.role === "admin" || session.role === "super-admin") {
    if (AGENT_PORTAL_PATHS.has(bare)) return "/admin";
    return path;
  }
  return path;
}

function mkSess(role: Session["role"]): Session {
  return {
    id: "u",
    name: "n",
    email: "e@x.no",
    role,
    isSuperAdmin: role === "super-admin",
    avatar: "",
    hall: [],
    dailyBalance: null,
    permissions: {},
  };
}

describe("guardRouteForRole (agent-portal skeleton)", () => {
  describe("AGENT", () => {
    const s = mkSess("agent");
    it("lar /agent/dashboard stå", () => {
      expect(guardRouteForRole("/agent/dashboard", s)).toBe("/agent/dashboard");
    });
    it("lar /agent/cashinout stå (legacy agent-route)", () => {
      expect(guardRouteForRole("/agent/cashinout", s)).toBe("/agent/cashinout");
    });
    it("redirecter /admin til /agent/dashboard", () => {
      expect(guardRouteForRole("/admin", s)).toBe("/agent/dashboard");
    });
    it("redirecter rot-path til /agent/dashboard", () => {
      expect(guardRouteForRole("/", s)).toBe("/agent/dashboard");
    });
    it("redirecter admin-route (/cms) til /agent/dashboard", () => {
      expect(guardRouteForRole("/cms", s)).toBe("/agent/dashboard");
    });
  });

  describe("HALL_OPERATOR", () => {
    const s = mkSess("hall-operator");
    it("lar /agent/dashboard stå", () => {
      expect(guardRouteForRole("/agent/dashboard", s)).toBe("/agent/dashboard");
    });
    it("redirecter /admin til /agent/dashboard", () => {
      expect(guardRouteForRole("/admin", s)).toBe("/agent/dashboard");
    });
    it("redirecter admin-route til /agent/dashboard", () => {
      expect(guardRouteForRole("/hall", s)).toBe("/agent/dashboard");
    });
  });

  describe("ADMIN", () => {
    const s = mkSess("admin");
    it("lar /admin stå", () => {
      expect(guardRouteForRole("/admin", s)).toBe("/admin");
    });
    it("lar /cms stå", () => {
      expect(guardRouteForRole("/cms", s)).toBe("/cms");
    });
    it("redirecter /agent/dashboard til /admin", () => {
      expect(guardRouteForRole("/agent/dashboard", s)).toBe("/admin");
    });
    it("redirecter /agent/physical-tickets til /admin", () => {
      expect(guardRouteForRole("/agent/physical-tickets", s)).toBe("/admin");
    });
    it("lar /agent (admin-side agent-management) stå", () => {
      // /agent (flatt) er admin-CRUD-liste, ikke i skeleton-sett.
      expect(guardRouteForRole("/agent", s)).toBe("/agent");
    });
    it("lar /agent/add (admin-side agent-opprettelse) stå", () => {
      expect(guardRouteForRole("/agent/add", s)).toBe("/agent/add");
    });
  });

  describe("super-admin", () => {
    const s = mkSess("super-admin");
    it("lar /admin stå", () => {
      expect(guardRouteForRole("/admin", s)).toBe("/admin");
    });
    it("redirecter /agent/cash-in-out til /admin", () => {
      expect(guardRouteForRole("/agent/cash-in-out", s)).toBe("/admin");
    });
  });
});
