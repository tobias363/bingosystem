# Observability Runbook (BIN-539)

**Owner:** Technical lead (Tobias Haugen)
**On-call rotation:** TBD — see [Linear team](https://linear.app/bingosystem/team) once rotation is formalized.
**Linear reference:** [BIN-539](https://linear.app/bingosystem/issue/BIN-539)
**Last updated:** 2026-04-17

This runbook is the single authoritative source for how Spillorama surfaces production signal, what thresholds page whom, and how to roll back when the signal looks wrong. It covers both `apps/backend/` and `packages/game-client/`.

---

## 1. What we emit

### Backend (`apps/backend/`)

| Signal | Source | Destination |
| --- | --- | --- |
| Sentry exceptions | `captureError()` in `apps/backend/src/observability/sentry.ts`, wrapped by `ackFailure` in `apps/backend/src/sockets/gameEvents.ts` and `errorReporter` middleware | Sentry project `spillorama-backend` |
| Sentry breadcrumbs | `addBreadcrumb("socket.connected" | "socket.disconnected" | "claim:submit" | "socket.domain_error")` | Attached to every captured exception |
| Prometheus metrics | `apps/backend/src/util/metrics.ts` + `/metrics` endpoint | Grafana scrape |
| `/health` | `GET /health` → JSON | Render uptime check + manual curl |

### Client (`packages/game-client/`)

| Signal | Source | Destination |
| --- | --- | --- |
| Sentry exceptions | `captureClientError()` wired via `Telemetry.trackError`; window-global `error` and `unhandledrejection` listeners | Sentry project `spillorama-client` |
| Sentry breadcrumbs | `addClientBreadcrumb()` via `Telemetry.trackFunnelStep` / `trackEvent` / `trackReconnect` / `trackDisconnect` | Attached to every captured client exception |
| Custom messages | `captureClientMessage("client_draw_gap", "warning")` from `GameApp.gapWatchdogTimer` after 30 s | Sentry messages (ad-hoc alerts) |

### Correlating across stacks

Both `apps/backend/src/observability/sentry.ts::hashPii` and `packages/game-client/src/telemetry/Sentry.ts::hashPii` produce the **same 12-hex truncation of SHA-256** for a given input. Use the `walletId` (server) / `accessToken` (client, opaque JWT) as the PII source and the two traces can be cross-joined in the Sentry UI — filter `user.id == <hash>` on both projects to find the player's full session trail.

---

## 2. Key metrics (Prometheus / Grafana)

| Metric | Type | Labels | What it tells you | Pilot SLO |
| --- | --- | --- | --- | --- |
| `spillorama_claim_submitted_total` | Counter | `game`, `hall`, `type` | Participation per room per pattern. Flat line = nobody claiming; sudden spike = possible claim-retry loop. | 5–50 / min per active hall during peak |
| `spillorama_payout_amount` | Histogram | `game`, `hall`, `type` | Distribution of per-claim payouts in NOK. Bucket drift ⇒ prize-pool math shifted. | p50 ≈ 5–25 kr, p99 ≤ 500 kr (tune after first week) |
| `spillorama_reconnect_total` | Counter | `reason` | Socket health. Persistent non-zero `transport close` or `ping timeout` signals network regression. | < 5 % of connected clients / hour |
| `bingo_socket_connections` | Gauge | — | Current active sockets. | — (sanity line, no threshold) |
| `bingo_active_rooms` / `bingo_active_players` | Gauge | — | Scale sanity. | — |
| `bingo_draw_errors_total` | Counter | `category` | Draw-engine failure categories (`TRANSIENT`, `LOCK_TIMEOUT`). | 0 sustained; transient spikes OK if < 5 / 5 min |
| `bingo_scheduler_tick_duration_ms` | Histogram | — | Scheduler-loop latency. p99 > 500 ms ⇒ scheduler is behind. | p99 < 250 ms |

### Alert thresholds

The first three pilot alerts:

1. **`reconnect-rate > 5 % (5 min window)`** — `sum(rate(spillorama_reconnect_total[5m])) / sum(bingo_socket_connections) > 0.05`. Pages oncall.
2. **`draw-to-client p99 > 500 ms`** — sourced from the Artillery nightly report *and* from Prometheus `bingo_socket_event_duration_ms` when BIN-508 wires it. Pages oncall.
3. **`client_draw_gap > 0`** — any Sentry message of category `client_draw_gap` seen within the last 10 min. Pages oncall. This fires when the BIN-502 resync couldn't close the gap within 30 s of mount.

Pre-pilot the alerts default to **Slack warning**, not PagerDuty. Flip to pager on the morning of the first pilot and document the decision in the ticket.

---

## 3. Dashboards

| Dashboard | Location | Purpose |
| --- | --- | --- |
| **Spillorama — Pilot overview** | `grafana.internal/d/spillorama-pilot` (_TBD once Grafana is provisioned_) | Reconnect rate, p99 draw latency, active rooms, claim rate. The single screen on-call watches during a pilot. |
| **Spillorama — Backend health** | `grafana.internal/d/spillorama-backend` | Scheduler tick, draw errors, wallet operation duration, rate-limit rejections. |
| **Sentry — spillorama-backend** | `sentry.io/organizations/<org>/projects/spillorama-backend` | All captured backend exceptions + breadcrumbs. |
| **Sentry — spillorama-client** | `sentry.io/organizations/<org>/projects/spillorama-client` | All captured client exceptions + breadcrumbs. |

**If a link is missing or returns 404**, assume the dashboard isn't provisioned yet. File a sub-issue under BIN-539 rather than silently working around — the dashboard gap is part of pilot readiness.

---

## 4. Rollback — who decides, who executes

**Who decides:** the on-call engineer, when any of the three pilot SLO alerts fires and cannot be mitigated within 5 min. If two or more alerts fire simultaneously, roll back immediately without waiting.

**Who executes:** the on-call engineer via the feature-flag rollback procedure in [BIN-540](https://linear.app/bingosystem/issue/BIN-540) (work in progress). Until BIN-540 lands, rollback = `git revert` the offending SHA + Render redeploy.

**Escalation path:** if the rollback itself fails (Render stuck, flag system unreachable), page the technical lead (Tobias). Off-hours, send a Slack DM + SMS.

**Rollback is not the first reflex for every alert.** Three common non-rollback mitigations:

1. **Restart the backend** — the graceful-shutdown handler flushes Sentry and re-initializes clean. Often enough for wallet/adapter hiccups.
2. **Drain sticky sessions** — if reconnect rate spikes but everything else looks fine, the issue is likely the reverse proxy. Drain + redeploy the proxy.
3. **Cut traffic to one hall** — via the hall-enable toggle in the admin panel. Isolates an ops incident to one location without disrupting others.

---

## 5. On-call quick-reference

### Symptom → first action

| Symptom | First action |
| --- | --- |
| Sentry backend errors spiking with `errCode: INVALID_INPUT` | Client bug — check Sentry-client for correlated exceptions from the same `user.id` hash. |
| Sentry backend errors spiking with `errCode: INSUFFICIENT_FUNDS` or `GAME_RUNNING` | **Expected** — these are `DomainError`s that shouldn't be reaching captureError. If they are, the filter in `ackFailure` is broken — open an incident. |
| `spillorama_reconnect_total{reason="ping timeout"}` climbing | Check `bingo_socket_connections` gauge for cliff. If socket count dropped, one backend node died — check Render logs. |
| `client_draw_gap` Sentry message | Open the linked session → check `drawIndex` breadcrumb sequence. Gap > 2 typically means the BIN-494 Redis adapter lost fanout — verify Redis health. |
| `/health` returns 500 | Check `walletAdapter` / `platformService` — one of the health-check dependencies threw. Backend logs show which. |

### How to silence an alert while investigating

- **Sentry:** "Ignore for 1h" on the event group (top-right of the issue page). Do NOT resolve — you need the trail after diagnosis.
- **Grafana:** silence in Alertmanager for `duration=30m, matchers={alertname=<name>}`. Always attach a comment linking the incident channel.
- **Never** disable the metric export itself — future investigations depend on the time-series being continuous.

---

## 6. Development hygiene

- **Local dev** defaults to Sentry-disabled. Set `SENTRY_DSN` in `.env` (backend) or `VITE_SENTRY_DSN` in the game-client's `.env.local` only when you're reproducing a prod incident.
- **PR testing** must verify the observability path is still wired:
  - `apps/backend/src/observability/__tests__/sentry.test.ts` — 5 unit tests for the disabled + mocked paths.
  - Manual smoke: start backend with `SENTRY_DSN=https://fake@example.com/0`, confirm `[sentry] ENABLED` appears in logs and no crash on boot.
- **Never log raw PII.** The `hashPii` helper is mandatory for walletId/playerId in breadcrumbs, tags, and log lines. Grep for `walletId` + `hashed` before merging any new breadcrumb.
- **Release tagging:** set `SENTRY_RELEASE=<commit-sha>` on every deploy. Render's "Commit SHA" env var can be wired directly. Without release tagging, source-map-uploaded stack traces break.

---

## 7. Post-incident

After every alert that paged oncall, write a short note (≤ 300 words) in `docs/operations/incident-log/<yyyy-mm-dd>-<slug>.md`. Include:

- Timeline: first alert → first action → resolution → confirmation.
- Root cause: what the signal actually meant.
- What the dashboard / runbook should have said that it didn't. This is the most valuable line in the whole doc — it drives the next update of this file.

The log doesn't need formal post-mortems for every small spike — only for anything that touched a pilot hall.
