// REQ-138: hide POINTS-felt fra Admin/Agent/Spiller-panelet.
//
// Per Wireframe Catalog 17.20 ("We need to hide the POINTS data from the
// Admin/Agent Panel as well") — alle steder der ticket-kilden vises (legacy
// "Wallet" / "Points") skal kun "Wallet" eller "Kr" vises. POINTS-data
// finnes fortsatt i backend (compliance-relevant) men skal ikke surfaces
// til admin-/agent-/spiller-grids.
//
// Bruk denne helperen overalt der `ticket_purchased_from`-data renderes,
// slik at vi ikke ved et uhell viser "Points" hvis backend returnerer det.

const POINTS_TOKENS = new Set([
  "points",
  "point",
  "poeng",
  "loyalty_points",
  "loyaltypoints",
]);

/**
 * Returnér kilde-strengen som er trygg å vise til admin/agent/spiller.
 *
 * Mapping:
 *   - tomt/null/undefined → "—"
 *   - "wallet"/"kr"/"cash"/"card"/etc → returneres som-er
 *   - "points"-varianter → "Wallet" (skjules per REQ-138)
 *
 * Backend-data forblir uberørt — dette er KUN en presentasjons-filter.
 */
export function formatTicketSource(raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  if (typeof raw !== "string") return "—";
  const trimmed = raw.trim();
  if (!trimmed) return "—";
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  if (POINTS_TOKENS.has(normalized)) {
    // REQ-138: skjul "Points" fra UI. Spillere ser kun balanse-baserte kilder.
    return "Wallet";
  }
  return trimmed;
}

/**
 * Sjekk om en gitt kilde-streng er en POINTS-variant. Brukes f.eks. for
 * å skjule en hel kolonne hvis ALLE rader er POINTS — eller for å filtrere
 * tx-historikk i agent-views der POINTS-tx ikke skal vises.
 */
export function isPointsSource(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return POINTS_TOKENS.has(normalized);
}
