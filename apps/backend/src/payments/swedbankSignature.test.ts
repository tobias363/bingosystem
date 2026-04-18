import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { createHmac } from "node:crypto";
import {
  SWEDBANK_SIGNATURE_HEADER,
  computeSwedbankSignatureHex,
  extractSwedbankSignatureHex,
  verifySwedbankSignature,
} from "./swedbankSignature.js";

const SECRET = "test-webhook-secret-abcdef";
const BODY = JSON.stringify({
  paymentOrder: { id: "/psp/paymentorders/123" },
  orderReference: "TOPUP-abc-123",
});

function signedHeader(rawBody: string, secret: string, prefix = "sha256="): string {
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `${prefix}${hex}`;
}

describe("BIN-603 swedbankSignature", () => {
  test("header name matches the lowercase convention", () => {
    assert.equal(SWEDBANK_SIGNATURE_HEADER, "x-swedbank-signature");
  });

  test("computeSwedbankSignatureHex returns a 64-char hex digest", () => {
    const hex = computeSwedbankSignatureHex(BODY, SECRET);
    assert.equal(hex.length, 64);
    assert.match(hex, /^[0-9a-f]+$/);
  });

  test("extractSwedbankSignatureHex strips the sha256= prefix", () => {
    const hex = computeSwedbankSignatureHex(BODY, SECRET);
    assert.equal(extractSwedbankSignatureHex(`sha256=${hex}`), hex);
  });

  test("extractSwedbankSignatureHex accepts bare hex without prefix", () => {
    const hex = computeSwedbankSignatureHex(BODY, SECRET);
    assert.equal(extractSwedbankSignatureHex(hex), hex);
  });

  test("extractSwedbankSignatureHex is case-insensitive on the prefix and hex", () => {
    const hex = computeSwedbankSignatureHex(BODY, SECRET);
    assert.equal(extractSwedbankSignatureHex(`SHA256=${hex.toUpperCase()}`), hex);
  });

  test("extractSwedbankSignatureHex rejects non-hex payloads", () => {
    assert.equal(extractSwedbankSignatureHex("sha256=not-hex-value!!"), null);
    assert.equal(extractSwedbankSignatureHex("sha256=" + "a".repeat(63)), null); // wrong length
    assert.equal(extractSwedbankSignatureHex("sha256=" + "a".repeat(65)), null);
  });

  test("extractSwedbankSignatureHex returns null for missing / empty header", () => {
    assert.equal(extractSwedbankSignatureHex(undefined), null);
    assert.equal(extractSwedbankSignatureHex(""), null);
    assert.equal(extractSwedbankSignatureHex("   "), null);
  });

  test("extractSwedbankSignatureHex handles array-form header", () => {
    const hex = computeSwedbankSignatureHex(BODY, SECRET);
    // Express normalises duplicate headers to string[]; we pick the first.
    assert.equal(extractSwedbankSignatureHex([`sha256=${hex}`, "ignored"]), hex);
  });

  test("verifySwedbankSignature accepts a valid signature", () => {
    assert.equal(verifySwedbankSignature(BODY, signedHeader(BODY, SECRET), SECRET), true);
  });

  test("verifySwedbankSignature accepts a valid bare-hex signature (no sha256= prefix)", () => {
    const bareHex = computeSwedbankSignatureHex(BODY, SECRET);
    assert.equal(verifySwedbankSignature(BODY, bareHex, SECRET), true);
  });

  test("verifySwedbankSignature rejects a signature made with a different secret", () => {
    const signed = signedHeader(BODY, "wrong-secret");
    assert.equal(verifySwedbankSignature(BODY, signed, SECRET), false);
  });

  test("verifySwedbankSignature rejects when body mutates (even by a single byte)", () => {
    const signed = signedHeader(BODY, SECRET);
    const tampered = BODY.replace("abc", "xyz");
    assert.equal(verifySwedbankSignature(tampered, signed, SECRET), false);
  });

  test("verifySwedbankSignature rejects missing header", () => {
    assert.equal(verifySwedbankSignature(BODY, undefined, SECRET), false);
  });

  test("verifySwedbankSignature rejects empty secret", () => {
    // Fail-closed when config is missing — caller should reject the request
    // before reaching this path, but belt-and-braces.
    assert.equal(verifySwedbankSignature(BODY, signedHeader(BODY, "any"), ""), false);
  });

  test("verifySwedbankSignature rejects garbage-hex headers", () => {
    assert.equal(verifySwedbankSignature(BODY, "sha256=zzzz", SECRET), false);
    assert.equal(verifySwedbankSignature(BODY, "sha256=", SECRET), false);
  });
});
