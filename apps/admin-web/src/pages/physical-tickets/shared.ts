// Shared helpers for physical-tickets pages — re-exports the cash-inout helpers
// (boxOpen/Close, contentHeader, escapeHtml, formatNOK, hashParam) so all
// ported AdminLTE-layouts share chrome. A later refactor can lift these to
// `apps/admin-web/src/util/` but that's out of scope for PR-B3.

export {
  boxClose,
  boxOpen,
  contentHeader,
  escapeHtml,
  formatNOK,
  hashParam,
} from "../cash-inout/shared.js";
