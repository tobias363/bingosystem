/**
 * BIN-587 B5-rest + BIN-630: admin-view av spillers aktivitet.
 *
 * Endepunkter:
 *   GET /api/admin/players/:id/transactions    — wallet-transaksjoner (B5)
 *   GET /api/admin/players/:id/game-history    — ledger-entries (stakes/prizes) (B5)
 *   GET /api/admin/players/:id/chips-history   — paginert chips-historikk (BIN-630)
 *
 * Alle er read-only; ingen audit-logging. Hall-scope for HALL_OPERATOR:
 * siden spillere ikke har hall-tilhørighet per tx, gir vi ADMIN/SUPPORT
 * tilgang men krever at HALL_OPERATOR spesifiserer hall-filter som
 * matcher egen hall.
 */

import express from "express";
import { DomainError } from "../game/BingoEngine.js";
import type { BingoEngine } from "../game/BingoEngine.js";
import type { PlatformService, PublicAppUser } from "../platform/PlatformService.js";
import type { WalletAdapter } from "../adapters/WalletAdapter.js";
import {
  assertAdminPermission,
  resolveHallScopeFilter,
  type AdminPermission,
} from "../platform/AdminAccessPolicy.js";
import {
  apiSuccess,
  apiFailure,
  getAccessTokenFromRequest,
  mustBeNonEmptyString,
  parseLimit,
} from "../util/httpHelpers.js";
import { buildChipsHistory } from "../admin/ChipsHistoryService.js";

export interface AdminPlayerActivityRouterDeps {
  platformService: PlatformService;
  walletAdapter: WalletAdapter;
  engine: BingoEngine;
}

function parseOptionalIso(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new DomainError("INVALID_INPUT", `${fieldName} må være en ISO-8601 dato/tid.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    throw new DomainError("INVALID_INPUT", `${fieldName} må være en ISO-8601 dato/tid.`);
  }
  return new Date(ms).toISOString();
}

function optionalNonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createAdminPlayerActivityRouter(deps: AdminPlayerActivityRouterDeps): express.Router {
  const { platformService, walletAdapter, engine } = deps;
  const router = express.Router();

  async function requirePermission(req: express.Request, permission: AdminPermission): Promise<PublicAppUser> {
    const accessToken = getAccessTokenFromRequest(req);
    const user = await platformService.getUserFromAccessToken(accessToken);
    assertAdminPermission(user.role, permission);
    return user;
  }

  // GET /api/admin/players/:id/transactions?limit
  // Returnerer wallet-tx-historikk. Read-only; ingen audit.
  router.get("/api/admin/players/:id/transactions", async (req, res) => {
    try {
      await requirePermission(req, "PLAYER_KYC_READ");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      const target = await platformService.getUserById(userId);
      if (target.role !== "PLAYER") {
        throw new DomainError("INVALID_INPUT", "Endepunktet er kun for spillere.");
      }
      const limit = parseLimit(req.query.limit, 100);
      const transactions = await walletAdapter.listTransactions(target.walletId, limit);
      apiSuccess(res, {
        userId: target.id,
        walletId: target.walletId,
        transactions,
        count: transactions.length,
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  // GET /api/admin/players/:id/game-history?dateFrom&dateTo&hallId&limit
  // Ledger-entries (STAKE/PRIZE) filtrert på walletId for spilleren.
  router.get("/api/admin/players/:id/game-history", async (req, res) => {
    try {
      const actor = await requirePermission(req, "PLAYER_KYC_READ");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      const target = await platformService.getUserById(userId);
      if (target.role !== "PLAYER") {
        throw new DomainError("INVALID_INPUT", "Endepunktet er kun for spillere.");
      }
      const hallIdInput =
        typeof req.query.hallId === "string" ? req.query.hallId.trim() || undefined : undefined;
      const hallId = resolveHallScopeFilter(actor, hallIdInput);
      const dateFrom =
        typeof req.query.dateFrom === "string" && req.query.dateFrom.trim()
          ? req.query.dateFrom.trim()
          : undefined;
      const dateTo =
        typeof req.query.dateTo === "string" && req.query.dateTo.trim()
          ? req.query.dateTo.trim()
          : undefined;
      const limit = parseLimit(req.query.limit, 200);
      const entries = engine.listComplianceLedgerEntries({
        walletId: target.walletId,
        hallId,
        dateFrom,
        dateTo,
        limit,
      });
      apiSuccess(res, {
        userId: target.id,
        walletId: target.walletId,
        entries,
        count: entries.length,
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  /**
   * BIN-630: GET /api/admin/players/:id/chips-history?from&to&limit&cursor
   *
   * Paginert wallet-transaksjonshistorikk for admin-player-detalj-UI.
   * Chips = wallet-balance i admin-terminologi. Viser innskudd, uttak,
   * gevinst, innsats og bonus per spiller med `balanceAfter` per rad.
   *
   * Tilgang: PLAYER_KYC_READ (ADMIN + SUPPORT). HALL_OPERATOR er bevisst
   * utelatt — wallet-historikk er sentralisert compliance, ikke hall-scope.
   *
   * Read-only, ingen audit-log. Aggregering bygges i `ChipsHistoryService`.
   */
  router.get("/api/admin/players/:id/chips-history", async (req, res) => {
    try {
      await requirePermission(req, "PLAYER_KYC_READ");
      const userId = mustBeNonEmptyString(req.params.id, "id");
      const target = await platformService.getUserById(userId);
      if (target.role !== "PLAYER") {
        throw new DomainError("INVALID_INPUT", "Endepunktet er kun for spillere.");
      }
      const from = parseOptionalIso(req.query.from, "from");
      const to = parseOptionalIso(req.query.to, "to");
      if (from && to && Date.parse(from) > Date.parse(to)) {
        throw new DomainError("INVALID_INPUT", "'from' må være <= 'to'.");
      }
      const pageSize = parseLimit(req.query.limit, 50);
      const cursor = optionalNonEmpty(req.query.cursor);

      // Hent hele historien (DESC) + aktuell saldo så balanceAfter kan
      // regnes korrekt uavhengig av [from, to]-vinduet. Wallet-adapteren
      // klemmer internt til 500; vi spør om 500 maks i tilfelle en aktiv
      // spiller har stor historie. Større historie → fremtidig service-
      // nivå aggregering (utenfor BIN-630).
      const [allTx, account] = await Promise.all([
        walletAdapter.listTransactions(target.walletId, 500),
        walletAdapter.getAccount(target.walletId),
      ]);

      const result = buildChipsHistory({
        walletId: target.walletId,
        transactions: allTx,
        currentBalance: account.balance,
        from,
        to,
        cursor,
        pageSize,
      });

      apiSuccess(res, {
        userId: target.id,
        walletId: result.walletId,
        from: result.from,
        to: result.to,
        items: result.items,
        nextCursor: result.nextCursor,
      });
    } catch (error) {
      apiFailure(res, error);
    }
  });

  return router;
}
