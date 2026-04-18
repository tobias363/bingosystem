/**
 * BIN-587 B2.2: admin-endepunkter for KYC-moderasjon.
 *
 * Separert fra `admin.ts` for å holde den filen overkommelig; logisk
 * gruppert rundt spiller-lifecycle-ressursen.
 *
 * Endepunkter:
 *   GET    /api/admin/players/pending      — list pending KYC-moderasjon
 *   GET    /api/admin/players/rejected     — list rejected
 *   POST   /api/admin/players/:id/approve  — godkjenn KYC
 *   POST   /api/admin/players/:id/reject   — avvis med reason
 *   POST   /api/admin/players/:id/resubmit — tillat ny innsending
 *   GET    /api/admin/players/:id          — full detalj (compliance_data inkl.)
 *   GET    /api/admin/players/:id/audit    — audit-log per spiller
 *   PUT    /api/admin/players/:id/kyc-status — admin-override (PLAYER_KYC_OVERRIDE, ADMIN only)
 *
 * Alle mutasjoner logges til AuditLogService og sender tilsvarende
 * e-post til spilleren (godkjent/avvist). E-post er fire-and-forget
 * så en SMTP-feil aldri blokkerer moderasjons-handlingen.
 */

import express from "express";
import { DomainError } from "../game/BingoEngine.js";
import type {
  PlatformService,
  PublicAppUser,
  KycStatus,
} from "../platform/PlatformService.js";
import type { AuditLogService } from "../compliance/AuditLogService.js";
import type { EmailService } from "../integration/EmailService.js";
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

const logger = rootLogger.child({ module: "admin-players" });

export interface AdminPlayersRouterDeps {
  platformService: PlatformService;
  auditLogService: AuditLogService;
  emailService: EmailService;
  /** Base-URL brukt til å bygge resubmit-lenker (sendt i reject-e-post). */
  webBaseUrl: string;
  supportEmail: string;
}

function clientIp(req: express.Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) {
    return fwd.split(",")[0]!.trim();
  }
  return req.ip ?? null;
}

function userAgent(req: express.Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" && ua.trim() ? ua : null;
}

/**
 * Offentlig DTO for spiller-lister — strips ut felt som ikke hører hjemme
 * i moderator-UI (ingen wallet-transaksjoner/sesjonsdetaljer her).
 */
function publicPlayerSummary(user: {
  id: string;
  email: string;
  displayName: string;
  surname?: string;
  phone?: string;
  kycStatus: KycStatus;
  birthDate?: string;
  kycVerifiedAt?: string;
  kycProviderRef?: string;
  hallId: string | null;
  createdAt: string;
  updatedAt: string;
  complianceData?: Record<string, unknown>;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    surname: user.surname ?? null,
    phone: user.phone ?? null,
    kycStatus: user.kycStatus,
    birthDate: user.birthDate ?? null,
    kycVerifiedAt: user.kycVerifiedAt ?? null,
    kycProviderRef: user.kycProviderRef ?? null,
    hallId: user.hallId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    complianceData: user.complianceData ?? null,
  };
}

function parseKycStatus(raw: unknown): KycStatus {
  const s = mustBeNonEmptyString(raw, "status").toUpperCase();
  if (s === "UNVERIFIED" || s === "PENDING" || s === "VERIFIED" || s === "REJECTED") {
    return s;
  }
  throw new DomainError("INVALID_INPUT", "status må være UNVERIFIED, PENDING, VERIFIED eller REJECTED.");
}

function parseReason(raw: unknown, field = "reason"): string {
  const r = mustBeNonEmptyString(raw, field);
  if (r.length > 500) {
    throw new DomainError("INVALID_INPUT", `${field} er for lang (maks 500 tegn).`);
  }
  return r;
}

export function createAdminPlayersRouter(deps: AdminPlayersRouterDeps): express.Router {
  const { platformService, auditLogService, emailService, webBaseUrl, supportEmail } = deps;
  const router = express.Router();

  async function requireAdminPermissionUser(
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
      logger.warn({ err, action: event.action }, "[BIN-587 B2.2] audit append failed");
    });
  }

  async function sendKycEmail(
    kind: "approved" | "rejected",
    user: { email: string; displayName: string },
    opts?: { reason?: string }
  ): Promise<void> {
    const base = webBaseUrl.replace(/\/+$/, "");
    try {
      if (kind === "approved") {
        await emailService.sendTemplate({
          to: user.email,
          template: "kyc-approved",
          context: { username: user.displayName, supportEmail },
        });
      } else {
        await emailService.sendTemplate({
          to: user.email,
          template: "kyc-rejected",
          context: {
            username: user.displayName,
            reason: opts?.reason ?? "",
            resubmitLink: `${base}/kyc/resubmit`,
            supportEmail,
          },
        });
      }
    } catch (err) {
      logger.warn({ err, kind, userId: user.email }, "[BIN-587 B2.2] KYC e-post failed (non-blocking)");
    }
  }

  // ── List endpoints ───────────────────────────────────────────────────────

  router.get("/api/admin/players/pending", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "PLAYER_KYC_READ");
      const limit = parseLimit(req.query.limit, 100);
      const players = await platformService.listUsersByKycStatus("PENDING", { limit });
      apiSuccess(res, {
        players: players.map((p) => publicPlayerSummary(p)),
        count: players.length,
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.get("/api/admin/players/rejected", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "PLAYER_KYC_READ");
      const limit = parseLimit(req.query.limit, 100);
      const players = await platformService.listUsersByKycStatus("REJECTED", { limit });
      apiSuccess(res, {
        players: players.map((p) => publicPlayerSummary(p)),
        count: players.length,
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Detail + audit-history ───────────────────────────────────────────────

  router.get("/api/admin/players/:id", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "PLAYER_KYC_READ");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      const user = await platformService.getUserById(userId);
      apiSuccess(res, publicPlayerSummary(user));
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.get("/api/admin/players/:id/audit", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "PLAYER_KYC_READ");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      const limit = parseLimit(req.query.limit, 100);
      // Sikre at brukeren faktisk finnes før vi avslører audit-hull.
      await platformService.getUserById(userId);
      const events = await auditLogService.list({
        resource: "user",
        resourceId: userId,
        limit,
      });
      apiSuccess(res, { events, count: events.length });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  router.post("/api/admin/players/:id/approve", async (req, res) => {
    try {
      const actor = await requireAdminPermissionUser(req, "PLAYER_KYC_MODERATE");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      const note = isRecordObject(req.body) && typeof req.body.note === "string"
        ? req.body.note.trim().slice(0, 500)
        : undefined;
      const updated = await platformService.approveKycAsAdmin({
        userId,
        actorId: actor.id,
      });
      fireAudit({
        actorId: actor.id,
        actorType: actor.role === "ADMIN" ? "ADMIN" : actor.role === "SUPPORT" ? "SUPPORT" : "USER",
        action: "player.kyc.approve",
        resource: "user",
        resourceId: userId,
        details: {
          note: note ?? null,
          previousStatus: null, // kalleren kan trekke dette fra audit-historikken
          newStatus: "VERIFIED",
        },
        ipAddress: clientIp(req),
        userAgent: userAgent(req),
      });
      void sendKycEmail("approved", updated);
      apiSuccess(res, publicPlayerSummary(updated));
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/admin/players/:id/reject", async (req, res) => {
    try {
      const actor = await requireAdminPermissionUser(req, "PLAYER_KYC_MODERATE");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      if (!isRecordObject(req.body)) {
        throw new DomainError("INVALID_INPUT", "Payload må være et objekt.");
      }
      const reason = parseReason(req.body.reason);
      const updated = await platformService.rejectKycAsAdmin({
        userId,
        actorId: actor.id,
        reason,
      });
      fireAudit({
        actorId: actor.id,
        actorType: actor.role === "ADMIN" ? "ADMIN" : actor.role === "SUPPORT" ? "SUPPORT" : "USER",
        action: "player.kyc.reject",
        resource: "user",
        resourceId: userId,
        details: {
          reason,
          newStatus: "REJECTED",
        },
        ipAddress: clientIp(req),
        userAgent: userAgent(req),
      });
      void sendKycEmail("rejected", updated, { reason });
      apiSuccess(res, publicPlayerSummary(updated));
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/admin/players/:id/resubmit", async (req, res) => {
    try {
      const actor = await requireAdminPermissionUser(req, "PLAYER_KYC_MODERATE");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      const updated = await platformService.resubmitKycAsAdmin({
        userId,
        actorId: actor.id,
      });
      fireAudit({
        actorId: actor.id,
        actorType: actor.role === "ADMIN" ? "ADMIN" : actor.role === "SUPPORT" ? "SUPPORT" : "USER",
        action: "player.kyc.resubmit",
        resource: "user",
        resourceId: userId,
        details: {
          newStatus: "UNVERIFIED",
          note: "Admin reopened KYC for resubmit",
        },
        ipAddress: clientIp(req),
        userAgent: userAgent(req),
      });
      apiSuccess(res, publicPlayerSummary(updated));
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.put("/api/admin/players/:id/kyc-status", async (req, res) => {
    try {
      const actor = await requireAdminPermissionUser(req, "PLAYER_KYC_OVERRIDE");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      if (!isRecordObject(req.body)) {
        throw new DomainError("INVALID_INPUT", "Payload må være et objekt.");
      }
      const status = parseKycStatus(req.body.status);
      const reason = parseReason(req.body.reason);
      const updated = await platformService.overrideKycStatusAsAdmin({
        userId,
        actorId: actor.id,
        status,
        reason,
      });
      fireAudit({
        actorId: actor.id,
        actorType: "ADMIN",
        action: "player.kyc.override",
        resource: "user",
        resourceId: userId,
        details: {
          reason,
          newStatus: status,
        },
        ipAddress: clientIp(req),
        userAgent: userAgent(req),
      });
      apiSuccess(res, publicPlayerSummary(updated));
    } catch (error) {
      apiFailure(res, error);
    }
  });

  return router;
}
