# Render + GitHub Actions Setup

Dette dokumentet beskriver minimum oppsett for staging deploy via GitHub Actions og production deploy via Render.

Per 9. april 2026 er production i `Spillorama-system` satt opp slik:

- Render auto-deployer fra `main`
- GitHub Actions brukes fortsatt for CI og compliance
- den manuelle workflowen `Deploy Production Hook (Manual)` finnes kun som nødverktøy
- hvis den manuelle hooken kjøres mens Render allerede deployer, kan Render svare `409 Conflict`

## 1) Opprett to Render services

Anbefalt:

- `spillorama-staging` (staging)
- `spillorama-system` (production)

Hver service skal ha egen deploy hook URL og health endpoint.

## 2) Legg inn GitHub Secrets (repo)

På GitHub repo -> `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`.

Påkrevde secrets:

- `RENDER_STAGING_DEPLOY_HOOK_URL`
- `RENDER_STAGING_HEALTHCHECK_URL`
- `RENDER_PRODUCTION_DEPLOY_HOOK_URL`
- `RENDER_PRODUCTION_HEALTHCHECK_URL`

Påkrevde Render environment variables for production:

- `APP_PG_CONNECTION_STRING`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_URL` — påkrevd for multi-node (BIN-494). Socket.IO Redis-adapter gjør cross-node fanout mulig. Uten dette vil `io.to(room).emit(...)` kun nå klienter på samme node.
- `SESSION_SECRET`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

Anbefalt health-endpoint:

- `https://<service-domain>/health`

### Multi-node skalering (BIN-494)

Ved horisontal skalering (>1 backend-node) må følgende være på plass:

1. **`REDIS_URL` satt** på alle noder — peker til felles Redis. Adapteren (`@socket.io/redis-adapter`) republiserer room-events via Redis pub/sub så alle noder får fanout.
2. **Sticky sessions** konfigureres på Render/reverse-proxy. Socket.IO fallback-transport (long-polling) krever at samme klient rutes til samme node i hele handshake-løpet. Sett sticky session cookie på Render-service-nivå (sporenummer konfigureres i BIN-540 feature-flag rollout).
3. Ved fravær av `REDIS_URL`: backend logger `[socket.io] redis-adapter DISABLED (no REDIS_URL) — multi-node fanout will not work` og faller tilbake til in-memory (single-node-oppførsel).

## 3) (Valgfritt) GitHub Variables for timeouts

Repo variables (`Settings` -> `Secrets and variables` -> `Actions` -> `Variables`):

- `RENDER_STAGING_WAIT_TIMEOUT_SECONDS` (default `600`)
- `RENDER_STAGING_POLL_INTERVAL_SECONDS` (default `10`)
- `RENDER_STAGING_CURL_RETRIES` (default `3`)
- `RENDER_PRODUCTION_WAIT_TIMEOUT_SECONDS` (default `900`)
- `RENDER_PRODUCTION_POLL_INTERVAL_SECONDS` (default `10`)
- `RENDER_PRODUCTION_CURL_RETRIES` (default `3`)

## 4) Workflow trigger-regler

- `Deploy Staging`:
  - trigges automatisk ved `push` til `staging`
  - kan også kjøres manuelt (`workflow_dispatch`)
- `Deploy Production Hook (Manual)`:
  - trigges kun manuelt (`workflow_dispatch`)
  - skal bare brukes hvis dere bevisst vil trigge Render deploy hook direkte
  - hvis Render allerede deployer fra `main`, kan hooken returnere `409 Conflict`

## 5) Sikkerhet

- Branch protection på `main` må være aktiv.
- Required checks må minst inkludere:
  - `backend`
  - `compliance`
- Sett GitHub Environment protection for `production` med required reviewers hvis ønskelig.

## 6) Verifisering etter oppsett

1. Lag en test-PR fra `codex/*`.
2. Verifiser at `CI` blir grønn.
3. Merge PR til `main`.
4. Cherry-pick eller merge samme endring til `staging`.
5. Verifiser at `Deploy Staging` starter på push til `staging` og passerer healthcheck.
6. Verifiser at Render faktisk deployer automatisk fra `main`.
7. Bruk bare `Deploy Production Hook (Manual)` når dere trenger en eksplisitt manuell trigger.
