import express from "express";
import {
  assertUserHallScope,
} from "../platform/AdminAccessPolicy.js";
import {
  apiSuccess,
  apiFailure,
  mustBeNonEmptyString,
  parseBooleanQueryValue,
  parseOptionalInteger,
} from "../util/httpHelpers.js";
import type { AdminSubRouterDeps } from "./adminShared.js";

export function createAdminHallsTerminalsRouter(deps: AdminSubRouterDeps): express.Router {
  const { platformService, helpers } = deps;
  const { auditAdmin, requireAdminPermissionUser } = helpers;
  const router = express.Router();

  // ── Halls ─────────────────────────────────────────────────────────────────

  router.get("/api/admin/halls", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_READ");
      const includeInactive = parseBooleanQueryValue(req.query.includeInactive, true);
      const halls = await platformService.listHalls({ includeInactive });
      apiSuccess(res, halls);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/admin/halls", async (req, res) => {
    try {
      const adminUser = await requireAdminPermissionUser(req, "HALL_WRITE");
      const hall = await platformService.createHall({
        slug: mustBeNonEmptyString(req.body?.slug, "slug"),
        name: mustBeNonEmptyString(req.body?.name, "name"),
        region: typeof req.body?.region === "string" ? req.body.region : undefined,
        address: typeof req.body?.address === "string" ? req.body.address : undefined,
        isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined
      });
      auditAdmin(req, adminUser, "hall.create", "hall", hall.id, {
        slug: hall.slug,
        name: hall.name,
      });
      apiSuccess(res, hall);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.put("/api/admin/halls/:hallId", async (req, res) => {
    try {
      const adminUser = await requireAdminPermissionUser(req, "HALL_WRITE");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const hall = await platformService.updateHall(hallId, {
        slug: typeof req.body?.slug === "string" ? req.body.slug : undefined,
        name: typeof req.body?.name === "string" ? req.body.name : undefined,
        region: typeof req.body?.region === "string" ? req.body.region : undefined,
        address: typeof req.body?.address === "string" ? req.body.address : undefined,
        isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined,
        // BIN-540 admin-flip for the pilot cutover handle. Validated inside
        // PlatformService.assertClientVariant; unknown values return
        // INVALID_INPUT, not INTERNAL_ERROR.
        clientVariant: typeof req.body?.clientVariant === "string" ? req.body.clientVariant : undefined
      });
      auditAdmin(req, adminUser, "hall.update", "hall", hallId, {
        fields: Object.keys(req.body ?? {}),
      });
      apiSuccess(res, hall);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── BIN-503: Hall TV-display tokens ───────────────────────────────────────
  //
  // DB-backed rotation for the tokens used by the `/web/tv/` kiosk page.
  // Plaintext is returned exactly once (POST) and never read back.

  router.get("/api/admin/halls/:hallId/display-tokens", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_READ");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const tokens = await platformService.listHallDisplayTokens(hallId);
      apiSuccess(res, tokens);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/admin/halls/:hallId/display-tokens", async (req, res) => {
    try {
      const adminUser = await requireAdminPermissionUser(req, "HALL_WRITE");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const label = typeof req.body?.label === "string" ? req.body.label : undefined;
      const token = await platformService.createHallDisplayToken(hallId, {
        label,
        createdByUserId: adminUser.id,
      });
      auditAdmin(req, adminUser, "hall.display_token.create", "hall", hallId, {
        tokenId: (token as { id?: string }).id ?? null,
        label: label ?? null,
      });
      apiSuccess(res, token);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.delete("/api/admin/halls/:hallId/display-tokens/:tokenId", async (req, res) => {
    try {
      const adminUser = await requireAdminPermissionUser(req, "HALL_WRITE");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const tokenId = mustBeNonEmptyString(req.params.tokenId, "tokenId");
      await platformService.revokeHallDisplayToken(tokenId, hallId);
      auditAdmin(req, adminUser, "hall.display_token.revoke", "hall", hallId, { tokenId });
      apiSuccess(res, { ok: true });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Terminals ─────────────────────────────────────────────────────────────

  router.get("/api/admin/terminals", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "TERMINAL_READ");
      const includeInactive = parseBooleanQueryValue(req.query.includeInactive, true);
      const hallId = typeof req.query.hallId === "string" ? req.query.hallId : undefined;
      const terminals = await platformService.listTerminals({
        hallId,
        includeInactive
      });
      apiSuccess(res, terminals);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.post("/api/admin/terminals", async (req, res) => {
    try {
      const adminUser = await requireAdminPermissionUser(req, "TERMINAL_WRITE");
      const hallId = mustBeNonEmptyString(req.body?.hallId, "hallId");
      assertUserHallScope(adminUser, hallId); // BIN-591
      const terminalCode = mustBeNonEmptyString(req.body?.terminalCode, "terminalCode");
      const displayName =
        typeof req.body?.displayName === "string" && req.body.displayName.trim()
          ? req.body.displayName
          : terminalCode;
      const terminal = await platformService.createTerminal({
        hallId,
        terminalCode,
        displayName,
        isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined
      });
      auditAdmin(req, adminUser, "terminal.create", "terminal", terminal.id, {
        hallId,
        terminalCode,
      });
      apiSuccess(res, terminal);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.put("/api/admin/terminals/:terminalId", async (req, res) => {
    try {
      const adminUser = await requireAdminPermissionUser(req, "TERMINAL_WRITE");
      const terminalId = mustBeNonEmptyString(req.params.terminalId, "terminalId");
      const existing = await platformService.getTerminal(terminalId);
      assertUserHallScope(adminUser, existing.hallId); // BIN-591
      const terminal = await platformService.updateTerminal(terminalId, {
        terminalCode: typeof req.body?.terminalCode === "string" ? req.body.terminalCode : undefined,
        displayName: typeof req.body?.displayName === "string" ? req.body.displayName : undefined,
        isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined,
        lastSeenAt: typeof req.body?.lastSeenAt === "string" ? req.body.lastSeenAt : undefined
      });
      auditAdmin(req, adminUser, "terminal.update", "terminal", terminalId, {
        hallId: existing.hallId,
        fields: Object.keys(req.body ?? {}),
      });
      apiSuccess(res, terminal);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Hall game config ──────────────────────────────────────────────────────

  router.get("/api/admin/halls/:hallId/game-config", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_GAME_CONFIG_READ");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const includeDisabled = parseBooleanQueryValue(req.query.includeDisabled, true);
      const configs = await platformService.listHallGameConfigs({
        hallId,
        includeDisabled
      });
      apiSuccess(res, configs);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  router.put("/api/admin/halls/:hallId/game-config/:gameSlug", async (req, res) => {
    try {
      const adminUser = await requireAdminPermissionUser(req, "HALL_GAME_CONFIG_WRITE");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      assertUserHallScope(adminUser, hallId); // BIN-591
      const gameSlug = mustBeNonEmptyString(req.params.gameSlug, "gameSlug");
      const maxTicketsPerPlayer = parseOptionalInteger(req.body?.maxTicketsPerPlayer, "maxTicketsPerPlayer");
      const minRoundIntervalMs = parseOptionalInteger(req.body?.minRoundIntervalMs, "minRoundIntervalMs");
      const config = await platformService.upsertHallGameConfig({
        hallId,
        gameSlug,
        isEnabled: typeof req.body?.isEnabled === "boolean" ? req.body.isEnabled : undefined,
        maxTicketsPerPlayer: maxTicketsPerPlayer !== undefined ? Number(maxTicketsPerPlayer) : undefined,
        minRoundIntervalMs: minRoundIntervalMs !== undefined ? Number(minRoundIntervalMs) : undefined
      });
      auditAdmin(req, adminUser, "hall.game_config.update", "hall", hallId, {
        gameSlug,
        fields: Object.keys(req.body ?? {}),
      });
      apiSuccess(res, config);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // ── Spilleplan — admin (§ 64) ─────────────────────────────────────────────

  // Admin: full schedule for a hall (all days, all states)
  router.get("/api/admin/halls/:hallId/schedule", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_READ");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const activeOnly = parseBooleanQueryValue(req.query.activeOnly, false);
      const slots = await platformService.listScheduleSlots(hallId, { activeOnly });
      apiSuccess(res, slots);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // Admin: create schedule slot
  router.post("/api/admin/halls/:hallId/schedule", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_WRITE");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const slot = await platformService.createScheduleSlot(hallId, {
        gameType: mustBeNonEmptyString(req.body?.gameType, "gameType"),
        displayName: mustBeNonEmptyString(req.body?.displayName, "displayName"),
        startTime: mustBeNonEmptyString(req.body?.startTime, "startTime"),
        dayOfWeek: req.body?.dayOfWeek !== undefined ? req.body.dayOfWeek : null,
        prizeDescription: req.body?.prizeDescription ?? "",
        maxTickets: req.body?.maxTickets,
        isActive: req.body?.isActive,
        sortOrder: req.body?.sortOrder
      });
      res.status(201).json({ ok: true, data: slot });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // Admin: update schedule slot
  router.put("/api/admin/halls/:hallId/schedule/:slotId", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_WRITE");
      const slotId = mustBeNonEmptyString(req.params.slotId, "slotId");
      const slot = await platformService.updateScheduleSlot(slotId, {
        gameType: req.body?.gameType,
        displayName: req.body?.displayName,
        startTime: req.body?.startTime,
        dayOfWeek: req.body?.dayOfWeek,
        prizeDescription: req.body?.prizeDescription,
        maxTickets: req.body?.maxTickets,
        isActive: req.body?.isActive,
        sortOrder: req.body?.sortOrder,
        variantConfig: req.body?.variantConfig,
      });
      apiSuccess(res, slot);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // Admin: delete schedule slot
  router.delete("/api/admin/halls/:hallId/schedule/:slotId", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_WRITE");
      const slotId = mustBeNonEmptyString(req.params.slotId, "slotId");
      await platformService.deleteScheduleSlot(slotId);
      apiSuccess(res, { deleted: true });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // Admin: log a completed scheduled game (audit trail)
  router.post("/api/admin/halls/:hallId/schedule/:slotId/log", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_WRITE");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const slotId = mustBeNonEmptyString(req.params.slotId, "slotId");
      const entry = await platformService.logScheduledGame({
        hallId,
        scheduleSlotId: slotId,
        gameSessionId: req.body?.gameSessionId,
        endedAt: req.body?.endedAt,
        playerCount: req.body?.playerCount,
        totalPayout: req.body?.totalPayout,
        notes: req.body?.notes
      });
      res.status(201).json({ ok: true, data: entry });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // Admin: view schedule audit log for a hall
  router.get("/api/admin/halls/:hallId/schedule-log", async (req, res) => {
    try {
      await requireAdminPermissionUser(req, "HALL_READ");
      const hallId = mustBeNonEmptyString(req.params.hallId, "hallId");
      const limit = parseOptionalInteger(req.query.limit, "limit");
      const entries = await platformService.listScheduleLog(hallId, {
        limit: limit !== undefined ? Number(limit) : undefined
      });
      apiSuccess(res, entries);
    } catch (error) {
      apiFailure(res, error);
    }
  });

  return router;
}
