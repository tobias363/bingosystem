import { randomUUID } from "node:crypto";
import express from "express";
import { DomainError } from "../game/BingoEngine.js";
import type { GameDefinition, UserRole } from "../platform/PlatformService.js";
import { APP_USER_ROLES } from "../platform/PlatformService.js";
import {
  ADMIN_ACCESS_POLICY,
  assertUserHallScope,
  canAccessAdminPermission,
  getAdminPermissionMap,
  listAdminPermissionsForRole,
  resolveHallScopeFilter,
} from "../platform/AdminAccessPolicy.js";
import type { PublicAppUser } from "../platform/PlatformService.js";
import {
  apiSuccess,
  apiFailure,
  getAccessTokenFromRequest,
  mustBeNonEmptyString,
  mustBePositiveAmount,
  parseLimit,
  parseBooleanQueryValue,
  parseOptionalNonNegativeNumber,
  parseOptionalInteger,
  parseOptionalPositiveInteger,
  parseOptionalIsoTimestampMs,
  parseOptionalLedgerGameType,
  parseOptionalLedgerChannel,
  parseOptionalTicketsPerPlayerInput,
  isRecordObject,
} from "../util/httpHelpers.js";
import type { AdminSettingsCatalog } from "../admin/settingsCatalog.js";
import { buildBingoSettingsDefinition, buildDefaultGameSettingsDefinition } from "../admin/settingsCatalog.js";
import {
  buildAdminRouterHelpers,
  type AdminRouterDeps,
  type BingoSchedulerSettings,
  type PendingBingoSettingsUpdate,
  type BingoSettingsState,
} from "./adminShared.js";
import { createAdminAuthRouter } from "./adminAuth.js";
import { createAdminGamesSettingsRouter } from "./adminGamesSettings.js";
import { createAdminHallsTerminalsRouter } from "./adminHallsTerminals.js";
import { createAdminRoomsRouter } from "./adminRooms.js";
import { createAdminComplianceRouter } from "./adminCompliance.js";
import { createAdminReportsRouter } from "./adminReports.js";
import { createAdminOverskuddRouter } from "./adminOverskudd.js";

export type { AdminRouterDeps, BingoSchedulerSettings, PendingBingoSettingsUpdate, BingoSettingsState };

export function createAdminRouter(deps: AdminRouterDeps): express.Router {
  const {
    platformService,
    engine,
    io,
    drawScheduler,
    bingoSettingsState,
    responsibleGamingStore,
    localBingoAdapter,
    usePostgresBingoAdapter,
    enforceSingleRoomPerHall,
    bingoMinRoundIntervalMs,
    bingoMinPlayersToStart,
    bingoMaxDrawsPerRound,
    fixedAutoDrawIntervalMs,
    forceAutoStart,
    forceAutoDraw,
    isProductionRuntime,
    autoplayAllowed,
    allowAutoplayInProduction,
    schedulerTickMs,
    emitRoomUpdate,
    emitManyRoomUpdates,
    emitWalletRoomUpdates,
    buildRoomUpdatePayload,
    persistBingoSettingsToCatalog,
    normalizeBingoSchedulerSettings,
    parseBingoSettingsPatch,
    getRoomConfiguredEntryFee,
    getArmedPlayerIds,
    disarmAllPlayers,
    clearDisplayTicketCache,
    roomConfiguredEntryFeeByRoom,
    getPrimaryRoomForHall,
    resolveBingoHallGameConfigForRoom,
    emailService,
    supportEmail,
  } = deps;

  const router = express.Router();

  // Shared helpers (audit + auth-guards). Single-use helpers bor i sitt eget
  // domenefil (adminAuth.ts, adminGamesSettings.ts, adminRooms.ts).
  const {
    auditAdmin,
    getAuthenticatedUser,
    requireAdminPermissionUser,
    requireAdminPanelUser,
  } = buildAdminRouterHelpers(deps);

  // ── Admin auth ────────────────────────────────────────────────────────────
  // Flyttet til adminAuth.ts — montert via sub-router under.

  // ── Games ─────────────────────────────────────────────────────────────────
  // Flyttet til adminGamesSettings.ts — montert via sub-router under.

  // ── Halls / Terminals / Hall-game-config / Spilleplan ────────────────────
  // Flyttet til adminHallsTerminals.ts — montert via sub-router under.

  // ── Rooms / room-ready / pause-resume ────────────────────────────────────
  // Flyttet til adminRooms.ts — montert via sub-router under.

  // ── Wallet compliance / Compliance / Prize policy / Payout audit ──────────
  // Flyttet til adminCompliance.ts — montert via sub-router under.

  // ── Ledger / Daily reports / Dashboard / Reports v2 ───────────────────────
  // Flyttet til adminReports.ts — montert via sub-router under.

  // ── Overskudd ─────────────────────────────────────────────────────────────
  // Flyttet til adminOverskudd.ts — montert via sub-router under.

  // ── Sub-routere ───────────────────────────────────────────────────────────
  // Domenefilene bygges med samme deps + de delte helpers.
  const subRouterDeps = {
    ...deps,
    helpers: {
      auditAdmin,
      getAuthenticatedUser,
      requireAdminPermissionUser,
      requireAdminPanelUser,
    },
  };
  router.use(createAdminAuthRouter(subRouterDeps));
  router.use(createAdminGamesSettingsRouter(subRouterDeps));
  router.use(createAdminHallsTerminalsRouter(subRouterDeps));
  router.use(createAdminRoomsRouter(subRouterDeps));
  router.use(createAdminComplianceRouter(subRouterDeps));
  router.use(createAdminReportsRouter(subRouterDeps));
  router.use(createAdminOverskuddRouter(subRouterDeps));

  return router;
}
