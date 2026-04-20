import express from "express";
import type { PlatformService } from "../platform/PlatformService.js";
import type { BankIdKycAdapter } from "../adapters/BankIdKycAdapter.js";
import type { AuthTokenService } from "../auth/AuthTokenService.js";
import type { EmailService } from "../integration/EmailService.js";
import type { AuditLogService } from "../compliance/AuditLogService.js";
import { DomainError } from "../game/BingoEngine.js";
import {
  apiSuccess,
  apiFailure,
  getAccessTokenFromRequest,
  mustBeNonEmptyString,
  mustBePositiveAmount,
  parseLimit,
} from "../util/httpHelpers.js";
import type { WalletAdapter } from "../adapters/WalletAdapter.js";
import { logger as rootLogger } from "../util/logger.js";

const logger = rootLogger.child({ module: "auth-router" });

export interface AuthRouterDeps {
  platformService: PlatformService;
  walletAdapter: WalletAdapter;
  bankIdAdapter: BankIdKycAdapter | null;
  authTokenService: AuthTokenService;
  emailService: EmailService;
  /**
   * BIN-629: when present, the login endpoint emits `auth.login` /
   * `auth.login.failed` audit-rows so admin-player-detail can render
   * login-history. Optional — callers without audit wiring (e.g. focused
   * unit tests) still work; the events are just silently skipped.
   */
  auditLogService?: AuditLogService;
  /** Base-URL brukt til å bygge reset-lenker, e.g. "https://app.spillorama.no". */
  webBaseUrl: string;
  /** Support-e-post rendret i template-footer. */
  supportEmail: string;
}

function clientIp(req: express.Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0]!.trim();
  return req.ip ?? null;
}

function requestUserAgent(req: express.Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" && ua.trim() ? ua : null;
}

export function createAuthRouter(deps: AuthRouterDeps): express.Router {
  const {
    platformService,
    walletAdapter,
    bankIdAdapter,
    authTokenService,
    emailService,
    auditLogService,
    webBaseUrl,
    supportEmail,
  } = deps;
  const router = express.Router();

  /**
   * BIN-629: fire-and-forget audit emit. Same policy as AuditLogService
   * internals — never block the auth response on audit-DB outages; the
   * structured logger below keeps an intent-trail in any case.
   */
  function fireLoginAudit(event: Parameters<AuditLogService["record"]>[0]): void {
    if (!auditLogService) return;
    auditLogService.record(event).catch((err) => {
      logger.warn({ err, action: event.action }, "[BIN-629] login audit append failed");
    });
  }

  async function getAuthenticatedUser(req: express.Request) {
    const accessToken = getAccessTokenFromRequest(req);
    return platformService.getUserFromAccessToken(accessToken);
  }

  router.post("/api/auth/register", async (req, res) => {
    try {
      const email = mustBeNonEmptyString(req.body?.email, "email");
      const password = mustBeNonEmptyString(req.body?.password, "password");
      const displayName = mustBeNonEmptyString(req.body?.displayName, "displayName");
      const surname = mustBeNonEmptyString(req.body?.surname, "surname");
      const birthDate = mustBeNonEmptyString(req.body?.birthDate, "birthDate");
      const phone = typeof req.body?.phone === "string" && req.body.phone.trim()
        ? req.body.phone.trim()
        : undefined;
      const complianceData = req.body?.complianceData && typeof req.body.complianceData === "object"
        ? req.body.complianceData as Record<string, unknown>
        : undefined;
      const session = await platformService.register({
        email,
        password,
        displayName,
        surname,
        phone,
        birthDate,
        complianceData
      });
      apiSuccess(res, session);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── BankID verification (BIN-274) ─────────────────────────────────────────
  router.post("/api/auth/bankid/init", async (req, res) => {
    try {
      if (!bankIdAdapter) {
        apiSuccess(res, {
          sessionId: `bankid-${Date.now()}`,
          authUrl: null,
          status: "NOT_CONFIGURED",
          message: "BankID-integrasjon er ikke konfigurert. Bruk manuell verifisering."
        });
        return;
      }
      const user = await getAuthenticatedUser(req);
      const { sessionId, authUrl } = bankIdAdapter.createAuthSession(user.id);
      apiSuccess(res, { sessionId, authUrl, status: "PENDING" });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.get("/api/auth/bankid/callback", async (req, res) => {
    try {
      if (!bankIdAdapter) {
        res.status(501).json({ error: "BankID ikke konfigurert" });
        return;
      }
      const { code, state, session_id } = req.query as Record<string, string>;
      if (!code || !state || !session_id) {
        res.status(400).json({ error: "Mangler code, state eller session_id" });
        return;
      }
      const result = await bankIdAdapter.handleCallback(session_id, code, state);
      if (result.birthDate) {
        await platformService.submitKycVerification({ userId: result.userId, birthDate: result.birthDate, nationalId: result.nationalId ?? undefined });
      }
      // Redirect user back to web shell after BankID verification
      res.redirect("/web/?bankid=complete");
    } catch (error) {
      console.error("[BankID] Callback error:", error);
      res.redirect("/web/?bankid=error");
    }
  });

  router.get("/api/auth/bankid/status/:sessionId", async (req, res) => {
    try {
      if (!bankIdAdapter) {
        apiSuccess(res, { sessionId: req.params.sessionId, status: "NOT_CONFIGURED", verified: false });
        return;
      }
      // Check user's KYC status directly
      const user = await getAuthenticatedUser(req);
      apiSuccess(res, {
        sessionId: req.params.sessionId,
        status: user.kycStatus === "VERIFIED" ? "COMPLETE" : "PENDING",
        verified: user.kycStatus === "VERIFIED",
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/auth/login", async (req, res) => {
    const ipAddress = clientIp(req);
    const userAgent = requestUserAgent(req);
    let emailForAudit: string | null = null;
    try {
      const email = mustBeNonEmptyString(req.body?.email, "email");
      emailForAudit = email;
      const password = mustBeNonEmptyString(req.body?.password, "password");
      const session = await platformService.login({
        email,
        password
      });
      // BIN-629: per-spiller login-history. actorId = spiller-id så admin-
      // detaljside kan filtrere direkte i /api/admin/players/:id/login-history.
      fireLoginAudit({
        actorId: session.user.id,
        actorType: "USER",
        action: "auth.login",
        resource: "session",
        resourceId: null,
        ipAddress,
        userAgent,
      });
      apiSuccess(res, session);
    } catch (error) {
      // BIN-629: log failed attempts too. Look up the account by email so
      // admin can see "someone tried to log in to player X" — useful for
      // credential-stuffing triage. If the email isn't ours, actorId stays
      // null; the row still lands but won't surface in per-player filters.
      let failedActorId: string | null = null;
      if (emailForAudit) {
        try {
          const existing = await platformService.findUserByEmail(emailForAudit);
          failedActorId = existing?.id ?? null;
        } catch {
          // Deliberately swallow — audit-trail is best-effort.
        }
      }
      const failureReason = error instanceof DomainError ? error.code : "UNKNOWN";
      fireLoginAudit({
        actorId: failedActorId,
        actorType: "USER",
        action: "auth.login.failed",
        resource: "session",
        resourceId: null,
        details: { failureReason },
        ipAddress,
        userAgent,
      });
      apiFailure(res, error);
    }
  });

  router.post("/api/auth/logout", async (req, res) => {
    try {
      const accessToken = getAccessTokenFromRequest(req);
      await platformService.logout(accessToken);
      apiSuccess(res, { loggedOut: true });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // BIN-174: Token refresh — issue new token, revoke old one
  router.post("/api/auth/refresh", async (req, res) => {
    try {
      const accessToken = getAccessTokenFromRequest(req);
      const session = await platformService.refreshSession(accessToken);
      apiSuccess(res, session);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.get("/api/auth/me", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      apiSuccess(res, user);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Profile management ────────────────────────────────────────────────────

  router.put("/api/auth/me", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      const updated = await platformService.updateProfile(user.id, {
        displayName: typeof req.body?.displayName === "string" ? req.body.displayName : undefined,
        email: typeof req.body?.email === "string" ? req.body.email : undefined,
        phone: typeof req.body?.phone === "string" ? req.body.phone : undefined
      });
      apiSuccess(res, updated);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/auth/change-password", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      const currentPassword = mustBeNonEmptyString(req.body?.currentPassword, "currentPassword");
      const newPassword = mustBeNonEmptyString(req.body?.newPassword, "newPassword");
      await platformService.changePassword(user.id, { currentPassword, newPassword });
      apiSuccess(res, { changed: true });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.delete("/api/auth/me", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      await platformService.deleteAccount(user.id);
      apiSuccess(res, { deleted: true });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Forgot password + reset (BIN-587 B2.1) ──────────────────────────────
  //
  // Alle responser er enumeration-safe: vi returnerer alltid { sent: true }
  // uansett om e-posten finnes eller ikke. Real-world e-post sendes kun
  // dersom brukeren finnes og EmailService er konfigurert. Ved stub-e-post
  // (SMTP ikke konfigurert) logges lenken i warn-level — utvikling/test.

  router.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const emailRaw = typeof req.body?.email === "string" ? req.body.email : "";
      if (!emailRaw.trim()) {
        throw new DomainError("INVALID_INPUT", "email er påkrevd.");
      }
      const user = await platformService.findUserByEmail(emailRaw);
      if (user) {
        try {
          const { token, expiresAt } = await authTokenService.createToken(
            "password-reset",
            user.id
          );
          const base = webBaseUrl.replace(/\/+$/, "");
          const resetLink = `${base}/reset-password/${encodeURIComponent(token)}`;
          const sendResult = await emailService.sendTemplate({
            to: user.email,
            template: "reset-password",
            context: {
              username: user.displayName,
              resetLink,
              expiresInHours: 1,
              supportEmail,
            },
          });
          if (sendResult.skipped) {
            logger.warn(
              { userId: user.id, resetLink, expiresAt },
              "[BIN-587 B2.1] SMTP disabled — reset-link not sent; logged for dev only"
            );
          }
        } catch (err) {
          // Ikke la e-post-/token-feil lekke ut via enumeration.
          logger.error({ err, userId: user.id }, "[BIN-587 B2.1] forgot-password internal error");
        }
      }
      apiSuccess(res, { sent: true });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.get("/api/auth/reset-password/:token", async (req, res) => {
    try {
      const token = mustBeNonEmptyString(req.params.token, "token");
      const { userId } = await authTokenService.validate("password-reset", token);
      // Returner minimum info — kun at tokenet er gyldig. Brukes av
      // reset-password-skjema for å vise "sett nytt passord"-form.
      apiSuccess(res, { valid: true, userId });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/auth/reset-password/:token", async (req, res) => {
    try {
      const token = mustBeNonEmptyString(req.params.token, "token");
      const newPassword = mustBeNonEmptyString(req.body?.newPassword, "newPassword");
      const { userId, tokenId } = await authTokenService.validate("password-reset", token);
      // Consume først så en mislykket setPassword ikke etterlater tokenet
      // gjenbrukbart. setPassword revoker sesjoner som side-effekt.
      await authTokenService.consume("password-reset", tokenId);
      await platformService.setPassword(userId, newPassword);
      apiSuccess(res, { reset: true });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/auth/verify-email/:token", async (req, res) => {
    try {
      const token = mustBeNonEmptyString(req.params.token, "token");
      const { userId, tokenId } = await authTokenService.validate("email-verify", token);
      await authTokenService.consume("email-verify", tokenId);
      await platformService.markEmailVerified(userId);
      apiSuccess(res, { verified: true });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.get("/api/kyc/me", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      apiSuccess(res, {
        userId: user.id,
        status: user.kycStatus,
        birthDate: user.birthDate,
        verifiedAt: user.kycVerifiedAt,
        providerReference: user.kycProviderRef
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/kyc/verify", async (req, res) => {
    try {
      const accessToken = getAccessTokenFromRequest(req);
      const user = await platformService.getUserFromAccessToken(accessToken);
      await platformService.submitKycVerification({
        userId: user.id,
        birthDate: mustBeNonEmptyString(req.body?.birthDate, "birthDate"),
        nationalId: typeof req.body?.nationalId === "string" ? req.body.nationalId : undefined
      });
      const refreshedUser = await platformService.getUserFromAccessToken(accessToken);
      apiSuccess(res, {
        user: refreshedUser
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Transaction history ───────────────────────────────────────────────────

  router.get("/api/wallet/me/transactions", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      const limit = parseLimit(req.query.limit, 50);
      const transactions = await walletAdapter.listTransactions(user.walletId, limit);
      apiSuccess(res, transactions);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  return router;
}
