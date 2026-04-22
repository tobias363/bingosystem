/**
 * Admin-router — thin fasade som monterer domene-spesifikke sub-routere.
 *
 * Den gamle filen på 2025 LOC er splittet opp per domene-gruppe
 * (adminAuth, adminGamesSettings, adminHallsTerminals, adminRooms,
 * adminCompliance, adminReports, adminOverskudd) med delte helpers i
 * adminShared. Ingen URL-stier endret; `createAdminRouter(deps)` er
 * fortsatt den eneste inngangen fra index.ts og adminAuditEmail.test.ts.
 */

import express from "express";
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
  const router = express.Router();
  const helpers = buildAdminRouterHelpers(deps);
  const subRouterDeps = { ...deps, helpers };

  router.use(createAdminAuthRouter(subRouterDeps));
  router.use(createAdminGamesSettingsRouter(subRouterDeps));
  router.use(createAdminHallsTerminalsRouter(subRouterDeps));
  router.use(createAdminRoomsRouter(subRouterDeps));
  router.use(createAdminComplianceRouter(subRouterDeps));
  router.use(createAdminReportsRouter(subRouterDeps));
  router.use(createAdminOverskuddRouter(subRouterDeps));

  return router;
}
