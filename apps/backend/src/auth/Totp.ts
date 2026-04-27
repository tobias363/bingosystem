/**
 * REQ-129: TOTP-implementering (RFC 6238 + RFC 4648 Base32) uten eksterne
 * pakker.
 *
 * Hvorfor egen impl:
 *   - Backend har ingen `otplib`/`speakeasy` i deps. Å legge til en pakke
 *     for ~120 linjer kode er overkill.
 *   - RFC 6238 er stabilt: HMAC-SHA1 over 8-byte counter (Unix-time / 30s),
 *     output 6 sifre. Algoritmen er trivielt verifiserbar mot
 *     Google Authenticator / 1Password / Authy.
 *
 * Threat model:
 *   - Secrets lagres i `app_user_2fa.enabled_secret` som Base32. Vi anser
 *     DB som beskyttet (samme som `password_hash`). Ingen ekstra
 *     kryptering av secret pga. operasjonelle behov (re-issue ved DB-
 *     restore).
 *   - Replay-prevention: vi tillater ±1 step (90s vindu totalt) men
 *     forsetter ikke å spore "siste brukte step" — TOTP-koden er kun
 *     gyldig én login-flow (challenge konsumeres uansett ved første
 *     match).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Konvertér Buffer til RFC 4648 Base32 (uten padding). */
export function bufferToBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Dekod RFC 4648 Base32 (case-insensitive, ignorerer padding/spaces). */
export function base32ToBuffer(input: string): Buffer {
  const normalized = input.replace(/\s+/g, "").replace(/=+$/u, "").toUpperCase();
  if (normalized.length === 0) {
    return Buffer.alloc(0);
  }
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error("Ugyldig Base32-streng.");
  }
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of normalized) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generer en 160-bit (20 byte) random TOTP-secret som Base32-streng.
 * 160 bits matcher RFC 4226 anbefaling for HMAC-SHA1.
 */
export function generateTotpSecret(): string {
  return bufferToBase32(randomBytes(20));
}

/**
 * Beregn TOTP-kode for gitt secret + tidspunkt + step.
 *
 * @param secret Base32-encoded shared secret
 * @param timestampMs Unix-time i ms (default: Date.now())
 * @param step Heltalls offset fra current step (-1 = forrige 30s vindu, +1 = neste)
 * @param stepSeconds Tids-vindu-størrelse i sekunder (default 30)
 * @param digits Antall sifre i koden (default 6)
 */
export function generateTotpCode(
  secret: string,
  timestampMs: number = Date.now(),
  step: number = 0,
  stepSeconds: number = 30,
  digits: number = 6
): string {
  const key = base32ToBuffer(secret);
  if (key.length === 0) {
    throw new Error("Tom TOTP-secret.");
  }
  const counter = Math.floor(timestampMs / 1000 / stepSeconds) + step;
  // 8-byte big-endian counter
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  // Dynamic truncation per RFC 4226 §5.3
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const code = binary % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

/**
 * Verifiser en TOTP-kode med ±skew step-toleranse. Returnerer true hvis
 * koden matcher hvilken som helst step i [-skew, +skew].
 *
 * Defaults: ±1 step (90 sekunders vindu) for å takle klokke-skew.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  options: {
    timestampMs?: number;
    skewSteps?: number;
    stepSeconds?: number;
    digits?: number;
  } = {}
): boolean {
  const { timestampMs = Date.now(), skewSteps = 1, stepSeconds = 30, digits = 6 } = options;
  if (!/^\d+$/.test(code) || code.length !== digits) {
    return false;
  }
  const codeBuf = Buffer.from(code);
  for (let step = -skewSteps; step <= skewSteps; step++) {
    const expected = generateTotpCode(secret, timestampMs, step, stepSeconds, digits);
    const expectedBuf = Buffer.from(expected);
    if (codeBuf.length === expectedBuf.length && timingSafeEqual(codeBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

/**
 * Bygg `otpauth://`-URI for QR-kode-rendering. Klienten kan rendre
 * QR-kode selv, eller vi kan generere via en gratis QR-tjeneste.
 *
 * Format: otpauth://totp/{label}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30
 *
 * Kilder: Google Authenticator key URI format spec.
 */
export function buildOtpauthUri(input: {
  secret: string;
  accountLabel: string;
  issuer: string;
}): string {
  const issuerEncoded = encodeURIComponent(input.issuer);
  const labelEncoded = encodeURIComponent(`${input.issuer}:${input.accountLabel}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${labelEncoded}?${params.toString()}`;
}
