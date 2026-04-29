// Bølge 2B (FE-P0-002): re-export from the single shared utility.
// This file used to host its own escapeHtml impl; 22 callers under
// `pages/games/**` import from here. Re-exporting preserves their import
// paths while collapsing the duplication on disk.
export { escapeHtml } from "../../../utils/escapeHtml.js";
