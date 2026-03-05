# Deploy Log - Staging - Candy Stabilization

## Release metadata

- Date/time (UTC): 2026-03-05
- Environment: staging
- Branch: `staging`
- Merge commit SHA: `9de7a225b5e3878b8a04e57bc23d86b2fac2276b`
- Branch heads:
  - `codex/candy-fix-chat2-unity`: `74a27098`
  - `codex/candy-fix-chat3-rtp`: `4f7eed20`
  - `codex/candy-fix-integration`: `0d1dafda`
  - `codex/candy-fix-chat1-release`: `b53813df`
- Deploy workflow: `Deploy Staging`
- Deploy run id: `22737338801`
- Deploy run url: `https://github.com/tobias363/bingosystem/actions/runs/22737338801`
- Deploy status: `success`

## Change summary

- Unity realtime stabilization:
  - snapshot-authoritative replay + draw resync watchdog
  - guaranteed draw ball rendering with fallback slot logic
  - delayed 10s reset of overlays only (ticket numbers preserved)
  - stable ticket cache to avoid disappearing bong numbers
- Backend RTP/near-miss:
  - adaptive RTP controller against rolling window
  - near-miss bias targeting 25-35%
  - telemetry endpoint for RTP/near-miss verification
  - simulation runner for high-volume RTP/near-miss gate checks

## Verification checklist

- [x] `/health` returns `ok: true`
  - URL: `https://bingosystem-staging.onrender.com/health`
  - Latest observed payload:
    - `ok=true`
    - `walletProvider=postgres`
    - `timestamp=2026-03-05T21:22:46.215Z`
- [x] Launch token/resolve smoke
  - `POST /api/games/candy/launch-token` => `200` + `launchToken`
  - `POST /api/games/candy/launch-resolve` (first) => `200` + launch payload
  - `POST /api/games/candy/launch-resolve` (second) => expected one-time failure `400 INVALID_LAUNCH_TOKEN`
- [x] Room/start/draw/claim smoke (socket)
  - URL: `https://bingosystem-staging.onrender.com`
  - Flow: `room:create` -> `room:join` -> `game:start` -> `draw:next` -> `ticket:mark` -> `claim:submit`
  - Result: `PASS`
  - Sample run:
    - `hallId=hall-default`
    - `roomCode=LK4QD5`
    - `drawNumber=18`
    - `claim:submit` accepted (latest claim `valid=false`, `reason=NO_VALID_LINE`, expected for single draw smoke)

## Candy Render fingerprint

- Launch URL from staging launch-token:
  - `https://candygame-9q3h.onrender.com/?v=fullsnapshot-20260305-200115-local`
- Live HTML fingerprint (loader/data/framework/wasm):
  - `fullsnapshot-20260305-200115-local`

## Risks and notes

- `scripts/qa/test3-e2e-smoke.sh` expects HTTP 200 on second launch-resolve consume, but runtime now returns HTTP 400 with `INVALID_LAUNCH_TOKEN` (correct one-time-token behavior).
- Candygame fingerprint currently resolves to `fullsnapshot-20260305-200115-local` from `launchUrl` settings.

## Rollback reference

- Previous stable staging deploy run id: `22736233920`
- Previous run url: `https://github.com/tobias363/bingosystem/actions/runs/22736233920`
- Rollback trigger:
  - Re-deploy previous successful Render staging deploy, or revert `9de7a225` on `staging` and push.

## Outcome

- Status: `success`
- Incident link: n/a
