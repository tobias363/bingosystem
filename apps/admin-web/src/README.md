# Module: `apps/admin-web/src`

**Sist oppdatert:** 2026-05-06
**Eier:** Tobias Haugen

## Ansvar

Admin-web er Vite-built static SPA for hall-operatører og admins. Inneholder:
- Admin-portal (`pages/admin/`)
- Agent-portal som route-tree (`pages/agent/` eller `/agent/*`)
- TV-screen public route (`pages/tv/`)
- Dashboard, players, halls, games, reports
- RBAC enforced via `auth/`

Per ADR (LEGACY_1_TO_1_MAPPING_2026-04-23 §8.1): Agent-portal er IKKE en separat app, men route-tree
i admin-web. Login redirecter basert på role.

## Ikke-ansvar

- Spill-runtime (delegert til `packages/game-client`)
- Backend-logikk (kun API-kall)

## Public API

Vite-built SPA. Entry point: `main.ts`. Routing via Vue Router (eller equivalent).
Routes mounted under:
- `/admin/*` — admin-portal (ADMIN role)
- `/agent/*` — agent-portal (AGENT role)
- `/tv/:hallId/:hallToken` — TV-screen (public)

API-kall til backend via `api/`-typed clients.

## Struktur

- `pages/` — sider organisert per domene
- `components/` — gjenbrukbare UI-komponenter
- `api/` — typed API-clients (mot backend)
- `auth/` — token-management, route-guards
- `i18n/` — internationalisering (NO/EN)
- `router/` — Vue-router-config (eller hva vi bruker)
- `shell/` — layout-shell
- `styles/` — globale stiler
- `utils/` — helpers

## Invariants

1. **API-kall via typed clients:** ikke fetch direct
2. **Route-guards på role:** redirect til riktig portal basert på user.role
3. **HALL_OPERATOR scoped:** UI viser kun egen hall-data
4. **Trace-id på alle requests:** ADR-006/010
5. **Lokalisering:** alle bruker-vendt tekst i i18n

## Bug-testing-guide

### "Admin-side viser data fra alle haller for HALL_OPERATOR"
- Sjekk om backend respekterer hall-scope
- Sjekk om frontend dobbel-filtrerer på klient (defense in depth)

### "Login redirecter feil"
- Sjekk `user.role` returnert fra `/api/auth/me`
- Sjekk router-guard-logikk

## Referanser

- `docs/architecture/LEGACY_1_TO_1_MAPPING_2026-04-23.md`
- `docs/architecture/WIREFRAME_CATALOG.md`
- ADR-007 (RBAC-modell)
