/**
 * BIN-627: admin-router for Pattern CRUD + dynamic-menu.
 *
 * Endepunkter (matches apps/admin-web/.../PatternState.ts-kontraktet):
 *   GET    /api/admin/patterns?gameTypeId=X
 *   GET    /api/admin/patterns/dynamic-menu?gameTypeId=X
 *   GET    /api/admin/patterns/:id
 *   POST   /api/admin/patterns
 *   PATCH  /api/admin/patterns/:id
 *   DELETE /api/admin/patterns/:id
 *
 * Rolle-krav: PATTERN_READ for GETs, PATTERN_WRITE for resten
 * (se apps/backend/src/platform/AdminAccessPolicy.ts).
 *
 * Svar-formatet matcher `PatternRow` i admin-web — typer er kanonisert i
 * packages/shared-types/src/schemas.ts (PatternRowSchema).
 *
 * NB (commit 1): Write-endpoints (POST/PATCH/DELETE) + audit-logging lander
 * i commit 2. Denne filen har dem som 405 Method Not Allowed frem til
 * commit 2 — men foreløpig eksponerer vi dem ikke. Liste + detalj +
 * dynamic-menu er nok til at admin-UI kan vise eksisterende data.
 */

import express from "express";
import { DomainError } from "../game/BingoEngine.js";
import type { PlatformService, PublicAppUser } from "../platform/PlatformService.js";
import type { AuditLogService } from "../compliance/AuditLogService.js";
import type {
  PatternService,
  Pattern,
  PatternStatus,
  PatternClaimType,
  CreatePatternInput,
  UpdatePatternInput,
} from "../admin/PatternService.js";
import {
  assertAdminPermission,
  type AdminPermission,
} from "../platform/AdminAccessPolicy.js";
import {
  apiSuccess,
  apiFailure,
  getAccessTokenFromRequest,
  mustBeNonEmptyString,
  parseLimit,
  isRecordObject,
} from "../util/httpHelpers.js";
import { logger as rootLogger } from "../util/logger.js";

const logger = rootLogger.child({ module: "admin-patterns" });

export interface AdminPatternsRouterDeps {
  platformService: PlatformService;
  auditLogService: AuditLogService;
  patternService: PatternService;
}

function clientIp(req: express.Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0]!.trim();
  return req.ip ?? null;
}

function userAgent(req: express.Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" && ua.trim() ? ua : null;
}

function actorTypeFromRole(
  role: PublicAppUser["role"]
): "ADMIN" | "SUPPORT" | "HALL_OPERATOR" | "USER" {
  if (role === "ADMIN") return "ADMIN";
  if (role === "SUPPORT") return "SUPPORT";
  if (role === "HALL_OPERATOR") return "HALL_OPERATOR";
  return "USER";
}

function parseOptionalStatus(value: unknown): PatternStatus | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new DomainError("INVALID_INPUT", "status må være en streng.");
  }
  const v = value.trim() as PatternStatus;
  if (v !== "active" && v !== "inactive") {
    throw new DomainError(
      "INVALID_INPUT",
      "status må være én av active, inactive."
    );
  }
  return v;
}

/**
 * Trim ned internt `Pattern`-objekt til wire-shape som matcher
 * `PatternRow` i admin-web (camelCase, ingen deletedAt eksponert).
 */
function toWireShape(p: Pattern): Omit<Pattern, "deletedAt"> {
  const { deletedAt: _deletedAt, ...rest } = p;
  return rest;
}

export function createAdminPatternsRouter(
  deps: AdminPatternsRouterDeps
): express.Router {
  const { platformService, auditLogService, patternService } = deps;
  const router = express.Router();

  async function requirePermission(
    req: express.Request,
    permission: AdminPermission
  ): Promise<PublicAppUser> {
    const accessToken = getAccessTokenFromRequest(req);
    const user = await platformService.getUserFromAccessToken(accessToken);
    assertAdminPermission(user.role, permission);
    return user;
  }

  function fireAudit(event: Parameters<AuditLogService["record"]>[0]): void {
    auditLogService.record(event).catch((err) => {
      logger.warn({ err, action: event.action }, "[BIN-627] audit append failed");
    });
  }

  // ── Read: list ──────────────────────────────────────────────────────

  router.get("/api/admin/patterns", async (req, res) => {
    try {
      await requirePermission(req, "PATTERN_READ");
      const gameTypeId =
        typeof req.query.gameTypeId === "string" && req.query.gameTypeId.trim()
          ? req.query.gameTypeId.trim()
          : undefined;
      const status = parseOptionalStatus(req.query.status);
      const limit = parseLimit(req.query.limit, 200);
      const patterns = await patternService.list({ gameTypeId, status, limit });
      apiSuccess(res, {
        patterns: patterns.map(toWireShape),
        count: patterns.length,
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Read: dynamic-menu (ordnet per gameType) ────────────────────────

  router.get("/api/admin/patterns/dynamic-menu", async (req, res) => {
    try {
      await requirePermission(req, "PATTERN_READ");
      const gameTypeId =
        typeof req.query.gameTypeId === "string" && req.query.gameTypeId.trim()
          ? req.query.gameTypeId.trim()
          : undefined;
      const menu = await patternService.dynamicMenu(gameTypeId);
      apiSuccess(res, menu);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Read: detail ────────────────────────────────────────────────────

  router.get("/api/admin/patterns/:id", async (req, res) => {
    try {
      await requirePermission(req, "PATTERN_READ");
      const id = mustBeNonEmptyString(req.params.id, "id");
      const pattern = await patternService.get(id);
      apiSuccess(res, toWireShape(pattern));
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // Write-endpoints (POST/PATCH/DELETE) lander i commit 2 — se plan i
  // PR-C3-PROGRESS.md / BIN-627-issue.
  // Referanser som forhindrer tree-shaking / unused-warnings:
  void ((
    _actorType: typeof actorTypeFromRole,
    _ua: typeof userAgent,
    _ip: typeof clientIp,
    _fire: typeof fireAudit,
    _input: CreatePatternInput | UpdatePatternInput | undefined,
    _claim: PatternClaimType | undefined,
    _isRecord: typeof isRecordObject
  ) => undefined)(
    actorTypeFromRole,
    userAgent,
    clientIp,
    fireAudit,
    undefined,
    undefined,
    isRecordObject
  );

  return router;
}
