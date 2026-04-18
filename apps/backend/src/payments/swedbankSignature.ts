import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * BIN-603: HMAC-SHA256 signature verification for Swedbank Pay webhooks.
 *
 * Swedbank Pay signs webhook callbacks with the shared merchant secret
 * and sends the hex-digest in the `X-Swedbank-Signature` header.
 * Format examples accepted here:
 *
 *   X-Swedbank-Signature: sha256=a3f1...e9
 *   X-Swedbank-Signature: a3f1...e9            (bare hex, no prefix)
 *
 * Constant-time compared via `crypto.timingSafeEqual` so response time
 * does not leak signature shape under a brute-force attempt.
 *
 * Raw body requirement:
 *   The signature is computed over the EXACT bytes Swedbank sent. If we
 *   sign `JSON.stringify(parsed)` we will desync on whitespace/key-order.
 *   `express.json()` is wired with a `verify`-callback (see index.ts) that
 *   stashes the raw UTF-8 body on `req.rawBody` before parsing — feed
 *   that string in here, never the parsed object.
 */

/** Header name Swedbank uses for the signature digest. Lowercase because
 * Node normalises incoming header keys. */
export const SWEDBANK_SIGNATURE_HEADER = "x-swedbank-signature";

/** Strip the optional `sha256=` prefix Swedbank uses in line with other
 * webhook providers (Stripe, GitHub). Returns the bare hex or null if the
 * header is missing/empty. */
export function extractSwedbankSignatureHex(headerValue: string | string[] | undefined): string | null {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const prefix = "sha256=";
  const hex = trimmed.toLowerCase().startsWith(prefix) ? trimmed.slice(prefix.length).trim() : trimmed;
  // HMAC-SHA256 hex digest is always 64 chars. Reject anything else early —
  // stops malformed headers from reaching timingSafeEqual (which requires
  // equal-length buffers).
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  return hex.toLowerCase();
}

/** Compute the expected HMAC-SHA256 hex digest of `rawBody` with `secret`. */
export function computeSwedbankSignatureHex(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Verify a Swedbank webhook signature against the raw request body.
 *
 * Returns `true` only if:
 *   - `secret` is non-empty (caller must reject missing-config upstream)
 *   - `headerValue` parses to a valid 64-char hex digest
 *   - The digest matches HMAC-SHA256(secret, rawBody) in constant time
 *
 * Any other input (empty secret, malformed header, wrong digest) returns
 * `false`. The caller decides the HTTP status — this function never
 * throws.
 */
export function verifySwedbankSignature(
  rawBody: string,
  headerValue: string | string[] | undefined,
  secret: string,
): boolean {
  if (!secret) return false;
  const providedHex = extractSwedbankSignatureHex(headerValue);
  if (!providedHex) return false;
  const expectedHex = computeSwedbankSignatureHex(rawBody, secret);
  const a = Buffer.from(providedHex, "hex");
  const b = Buffer.from(expectedHex, "hex");
  // Both are 32 bytes by construction (SHA-256 output), but double-check
  // to avoid timingSafeEqual throwing on unexpected length skew.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
