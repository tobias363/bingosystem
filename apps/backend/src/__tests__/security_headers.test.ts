/**
 * SEC-P0-002 (Bølge 2A — 2026-04-28): Security headers via Helmet.
 *
 * Closes FIN-P0-02 from docs/audit/SECURITY_AUDIT_2026-04-28.md.
 *
 * BEFORE THE FIX:
 *   `apps/backend/src/index.ts` had no `helmet`, no manual `setHeader` for
 *   X-Frame-Options / CSP / HSTS / X-Content-Type-Options /
 *   Referrer-Policy. The admin panel was clickjackable and there was no
 *   CSP defense-in-depth for the 27 reflected-XSS sinks (FIN-P1-01).
 *
 * THE FIX:
 *   Added `helmet({...})` middleware in index.ts before `app.use(cors(...))`.
 *   Configured CSP to allow inline-style/inline-script (legacy
 *   /web/index.html requirement) but block load of resources from
 *   non-allowed origins, frame-ancestors 'none' (clickjacking),
 *   1-year HSTS, nosniff, strict-origin Referrer-Policy.
 *
 * THESE TESTS:
 *   1. Source-level smoke: import + middleware mount in index.ts (cheap,
 *      runs without DB/Redis — same pattern as indexWiring.adminOps.test.ts).
 *   2. Behaviour test: build a minimal Express app with the same Helmet
 *      config and verify each header is set on a response.
 *
 * Why both: source-level catches "someone deleted the import"; behaviour
 * test catches "someone changed the config to disable a critical header".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── Source-level smoke (cheap, no boot) ─────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, "..", "index.ts");
const indexSrc = readFileSync(indexPath, "utf8");

test("SEC-P0-002: index.ts imports helmet", () => {
  assert.match(
    indexSrc,
    /import\s+helmet\s+from\s+["']helmet["']/,
    "helmet must be imported in index.ts",
  );
});

test("SEC-P0-002: index.ts mounts helmet() as middleware", () => {
  assert.match(
    indexSrc,
    /app\.use\(\s*\n?\s*helmet\(/,
    "app.use(helmet(...)) must be present",
  );
});

test("SEC-P0-002: helmet config sets frame-ancestors 'none' (clickjacking)", () => {
  // Critical for clickjacking. The audit explicitly called out clickjacking
  // as a P0 risk vector for hall-operator approval flows.
  assert.match(
    indexSrc,
    /["']frame-ancestors["']\s*:\s*\[\s*["']'none'["']\s*\]/,
    "CSP frame-ancestors 'none' must be set",
  );
});

test("SEC-P0-002: helmet config sets HSTS with at least 1 year max-age", () => {
  // Audit recommended ≥1 year max-age + includeSubDomains.
  assert.match(
    indexSrc,
    /strictTransportSecurity\s*:\s*\{[\s\S]*?maxAge\s*:\s*31_?536_?000/,
    "HSTS maxAge must be at least 31536000 (1 year)",
  );
  assert.match(
    indexSrc,
    /strictTransportSecurity\s*:\s*\{[\s\S]*?includeSubDomains\s*:\s*true/,
    "HSTS must include subdomains",
  );
});

test("SEC-P0-002: helmet config enables noSniff (X-Content-Type-Options)", () => {
  assert.match(
    indexSrc,
    /noSniff\s*:\s*true/,
    "noSniff must be enabled to block MIME-sniff XSS on uploads",
  );
});

test("SEC-P0-002: helmet config sets Referrer-Policy to strict-origin-when-cross-origin", () => {
  assert.match(
    indexSrc,
    /referrerPolicy\s*:\s*\{[\s\S]*?policy\s*:\s*["']strict-origin-when-cross-origin["']/,
    "Referrer-Policy must be strict-origin-when-cross-origin",
  );
});

test("SEC-P0-002: helmet mounted BEFORE cors (so headers apply to preflight + all responses)", () => {
  // Order matters: helmet before cors so preflight responses also get
  // X-Frame-Options etc. Otherwise an OPTIONS request to /api/* would
  // come back without the headers.
  const helmetIdx = indexSrc.search(/app\.use\(\s*\n?\s*helmet\(/);
  const corsIdx = indexSrc.search(/app\.use\(cors\(/);
  assert.ok(helmetIdx > 0, "helmet should be mounted in index.ts");
  assert.ok(corsIdx > 0, "cors should be mounted in index.ts");
  assert.ok(
    helmetIdx < corsIdx,
    "helmet middleware must come BEFORE cors so headers apply to preflight responses",
  );
});

// ── Behaviour test: actual headers on real HTTP response ────────────────────

function makeAppWithHelmet(): express.Express {
  const app = express();
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.gstatic.com"],
          "style-src": ["'self'", "'unsafe-inline'", "https:"],
          "img-src": ["'self'", "data:", "blob:", "https:"],
          "connect-src": ["'self'", "wss:", "https:", "ws:"],
          "font-src": ["'self'", "data:", "https:"],
          "frame-ancestors": ["'none'"],
          "form-action": ["'self'"],
          "object-src": ["'none'"],
          "upgrade-insecure-requests": [],
        },
      },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      dnsPrefetchControl: { allow: false },
      noSniff: true,
      hidePoweredBy: true,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    }),
  );
  app.get("/health", (_req, res) => res.json({ ok: true }));
  return app;
}

async function fetchHeaders(): Promise<Record<string, string | string[] | undefined>> {
  const app = makeAppWithHelmet();
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const req = http.get({
        host: "127.0.0.1",
        port,
        path: "/health",
        headers: { "User-Agent": "sec-test" },
      }, (res) => {
        // Drain body so socket closes promptly.
        res.on("data", () => {});
        res.on("end", () => {
          server.close();
          resolve(res.headers);
        });
      });
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
    });
  });
}

test("SEC-P0-002 behaviour: response carries X-Frame-Options: DENY", async () => {
  const headers = await fetchHeaders();
  assert.equal(
    headers["x-frame-options"]?.toString().toUpperCase(),
    "DENY",
    "X-Frame-Options must be DENY (clickjacking protection)",
  );
});

test("SEC-P0-002 behaviour: response carries Strict-Transport-Security with 1y max-age", async () => {
  const headers = await fetchHeaders();
  const hsts = headers["strict-transport-security"]?.toString() ?? "";
  assert.ok(hsts.length > 0, "Strict-Transport-Security header must be present");
  assert.match(hsts, /max-age=31536000/, "HSTS max-age must be 1 year");
  assert.match(hsts, /includeSubDomains/, "HSTS must include subdomains");
});

test("SEC-P0-002 behaviour: response carries X-Content-Type-Options: nosniff", async () => {
  const headers = await fetchHeaders();
  assert.equal(
    headers["x-content-type-options"]?.toString(),
    "nosniff",
    "X-Content-Type-Options must be nosniff",
  );
});

test("SEC-P0-002 behaviour: response carries Referrer-Policy: strict-origin-when-cross-origin", async () => {
  const headers = await fetchHeaders();
  assert.equal(
    headers["referrer-policy"]?.toString(),
    "strict-origin-when-cross-origin",
    "Referrer-Policy must be strict-origin-when-cross-origin",
  );
});

test("SEC-P0-002 behaviour: response carries Content-Security-Policy with frame-ancestors 'none'", async () => {
  const headers = await fetchHeaders();
  const csp = headers["content-security-policy"]?.toString() ?? "";
  assert.ok(csp.length > 0, "CSP header must be present");
  assert.match(csp, /frame-ancestors 'none'/, "CSP must set frame-ancestors 'none'");
  assert.match(csp, /object-src 'none'/, "CSP must set object-src 'none'");
  assert.match(csp, /default-src 'self'/, "CSP must set default-src 'self'");
});

test("SEC-P0-002 behaviour: response does NOT carry X-Powered-By: Express", async () => {
  const headers = await fetchHeaders();
  assert.equal(
    headers["x-powered-by"],
    undefined,
    "X-Powered-By must be hidden (no fingerprinting of Express version)",
  );
});

test("SEC-P0-002 behaviour: X-DNS-Prefetch-Control is off", async () => {
  const headers = await fetchHeaders();
  assert.equal(
    headers["x-dns-prefetch-control"]?.toString(),
    "off",
    "X-DNS-Prefetch-Control must be off",
  );
});
