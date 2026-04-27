/**
 * Compliance-test: ADMIN-rollen MÅ ha tilgang til hver eneste definerte
 * admin-permission.
 *
 * **Hvorfor ligger denne testen i `auth/__tests__/`?**
 * Tobias-direktiv 2026-04-27 («ADMIN har alle tilganger som er mulig å ha»):
 * dette er en pilot-blokker, og vi har valgt å plassere kontrolltesten i
 * auth-domenet sammen med de andre RBAC-relevante testene
 * (TwoFactorService, SessionService, AuthTokenService) selv om selve
 * `AdminAccessPolicy` lever i `platform/`. Auth-domenet eier RBAC-shapen
 * og er den naturlige plasseringen for «hvilke permissions skal hvilken
 * rolle ha»-invarianter.
 *
 * **Hva sjekker testen?**
 *
 * 1. ADMIN er listet i hver eneste rad i `ADMIN_ACCESS_POLICY_DEFINITION`.
 * 2. `canAccessAdminPermission("ADMIN", X)` er `true` for alle X.
 * 3. `assertAdminPermission("ADMIN", X)` kaster aldri.
 * 4. `getAdminPermissionMap("ADMIN")` har `true` for hver eneste nøkkel.
 * 5. `listAdminPermissionsForRole("ADMIN")` returnerer hele permission-
 *     katalogen (ingen rad mangler).
 * 6. Pollute-protection: «ALL»-invarianten gjelder kun ADMIN. Ingen annen
 *     rolle skal ha 100% dekning (det ville indikere at vi har mistet
 *     least-privilege).
 *
 * **Hvorfor er denne testen viktig fremover?**
 * Pattern er Alt 2 fra direktivet («eksplisitt liste alle permissions i
 * ADMIN-key, krever vedlikehold når nye legges til»). Sentinel-pattern
 * (Alt 1) ble vurdert men forkastet fordi:
 *   - 160+ kallsteder bruker `canAccessAdminPermission(role, perm)` —
 *     refactor til sentinel ville touche alle og gi merge-konflikt mot
 *     parallel agent-arbeid.
 *   - Eksisterende AdminAccessPolicy bruker `as const`-snutt; sentinel
 *     ville bryte type-inferens.
 *   - Audit-test gir samme garanti: hvis en ny permission legges til uten
 *     ADMIN, FAILS testen i CI før merge.
 *
 * Nye permissions må alltid inkludere `"ADMIN"` i sin role-liste. Dersom
 * du bevisst vil unngå at ADMIN har en spesifikk permission (f.eks.
 * separation-of-duties for super-sensitive operasjoner), må du ENDRE
 * denne testen samtidig — det skal være et bevisst, dokumentert valg.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ACCESS_POLICY,
  assertAdminPermission,
  canAccessAdminPermission,
  getAdminPermissionMap,
  listAdminPermissionsForRole,
} from "../../platform/AdminAccessPolicy.js";
import type { AdminPermission } from "../../platform/AdminAccessPolicy.js";
import type { UserRole } from "../../platform/PlatformService.js";

const ALL_ROLES: UserRole[] = ["ADMIN", "HALL_OPERATOR", "SUPPORT", "PLAYER", "AGENT"];

function listAllPermissions(): AdminPermission[] {
  return Object.keys(ADMIN_ACCESS_POLICY) as AdminPermission[];
}

test("compliance-invariant: ADMIN er listet i hver permissions role-array", () => {
  const allPermissions = listAllPermissions();
  // Sanity-check: vi forventer minst 50 permissions etter 5+ år med BIN-tickets.
  // Hvis tallet faller drastisk har vi mistet en eller annen kategori.
  assert.ok(
    allPermissions.length >= 50,
    `Forventet minst 50 permissions, fant ${allPermissions.length}. ` +
      `Har en kategori blitt fjernet ved et uhell?`
  );

  const missingAdmin: AdminPermission[] = [];
  for (const permission of allPermissions) {
    const roles = ADMIN_ACCESS_POLICY[permission];
    if (!roles.includes("ADMIN")) {
      missingAdmin.push(permission);
    }
  }
  assert.equal(
    missingAdmin.length,
    0,
    `ADMIN MÅ være med i hver permission. Mangler i: ${missingAdmin.join(", ")}. ` +
      `Tobias-direktiv 2026-04-27: ADMIN er superbruker og skal aldri låses ute.`
  );
});

test("compliance-invariant: canAccessAdminPermission returnerer true for ADMIN på alle permissions", () => {
  const failures: AdminPermission[] = [];
  for (const permission of listAllPermissions()) {
    if (!canAccessAdminPermission("ADMIN", permission)) {
      failures.push(permission);
    }
  }
  assert.equal(
    failures.length,
    0,
    `canAccessAdminPermission(ADMIN, X) returnerte false for: ${failures.join(", ")}`
  );
});

test("compliance-invariant: assertAdminPermission kaster aldri for ADMIN", () => {
  const failures: { permission: AdminPermission; message: string }[] = [];
  for (const permission of listAllPermissions()) {
    try {
      assertAdminPermission("ADMIN", permission);
    } catch (err) {
      failures.push({
        permission,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  assert.equal(
    failures.length,
    0,
    `assertAdminPermission kastet for ADMIN på: ` +
      failures.map((f) => `${f.permission} (${f.message})`).join(", ")
  );
});

test("compliance-invariant: getAdminPermissionMap(ADMIN) er { [perm]: true } for alle permissions", () => {
  const map = getAdminPermissionMap("ADMIN");
  const allPermissions = listAllPermissions();
  // Map skal ha en nøkkel per permission.
  assert.equal(
    Object.keys(map).length,
    allPermissions.length,
    `getAdminPermissionMap returnerte feil antall nøkler.`
  );
  // Hver verdi skal være true for ADMIN.
  for (const permission of allPermissions) {
    assert.equal(
      map[permission],
      true,
      `getAdminPermissionMap(ADMIN)[${permission}] var ikke true`
    );
  }
});

test("compliance-invariant: listAdminPermissionsForRole(ADMIN) returnerer alle permissions", () => {
  const adminPerms = listAdminPermissionsForRole("ADMIN");
  const allPerms = listAllPermissions();
  assert.equal(
    adminPerms.length,
    allPerms.length,
    `ADMIN har ${adminPerms.length} permissions men det finnes ${allPerms.length} totalt — ` +
      `mangler: ${allPerms.filter((p) => !adminPerms.includes(p)).join(", ")}`
  );
  // Sett-likhet — rekkefølge er ikke stabil/garantert.
  const expected = new Set(allPerms);
  const actual = new Set(adminPerms);
  for (const perm of expected) {
    assert.ok(actual.has(perm), `ADMIN missing permission: ${perm}`);
  }
});

test("least-privilege-invariant: ingen ikke-ADMIN-rolle har 100% dekning", () => {
  // Hvis en annen rolle har alle permissions, har vi mistet least-privilege
  // og policyen er meningsløs. Denne testen forhindrer regresjon der noen
  // ved et uhell legger til en rolle i hver eneste permission.
  const allPermissions = listAllPermissions();
  for (const role of ALL_ROLES) {
    if (role === "ADMIN") continue;
    const granted = listAdminPermissionsForRole(role);
    assert.ok(
      granted.length < allPermissions.length,
      `${role} har 100% permission-dekning (${granted.length}/${allPermissions.length}). ` +
        `Det er bare ADMIN som skal være superbruker.`
    );
  }
});

test("policy-sanity: alle role-arrays inneholder kun kjente UserRole-verdier", () => {
  // Reproduserer eksisterende test fra AdminAccessPolicy.test.ts med en
  // eksplisitt feilmelding som peker på den korrupte permission.
  const knownRoles = new Set<UserRole>(ALL_ROLES);
  const corruptions: { permission: AdminPermission; role: string }[] = [];
  for (const permission of listAllPermissions()) {
    for (const role of ADMIN_ACCESS_POLICY[permission]) {
      if (!knownRoles.has(role)) {
        corruptions.push({ permission, role });
      }
    }
  }
  assert.equal(
    corruptions.length,
    0,
    `Permissions med ukjente roller: ` +
      corruptions.map((c) => `${c.permission}=${c.role}`).join(", ")
  );
});
