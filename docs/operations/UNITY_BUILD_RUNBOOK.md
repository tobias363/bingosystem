# Unity build + rollback runbook (BIN-532)

**Owner:** Technical lead (Tobias Haugen)
**Linear:** [BIN-532](https://linear.app/bingosystem/issue/BIN-532)
**Related:** [`ROLLBACK_RUNBOOK.md`](./ROLLBACK_RUNBOOK.md) (BIN-540 — per-hall flag) · [`RELEASE_GATE.md`](../compliance/RELEASE_GATE.md) §7 (pre-pilot checklist)

This runbook is the **rollback insurance** for the Unity → web migration. It documents how to produce a deployable Unity WebGL bundle on demand (CI), and how to drop that bundle into production when the pilot needs to fall back off the web client.

Without this, BIN-540's `unity-fallback` flag has nothing to fall back to. That's why a working Unity CI is a hard pilot-blocker per RELEASE_GATE §7.

---

## 1. The CI workflow

File: [`.github/workflows/unity-build.yml`](../../.github/workflows/unity-build.yml)

Triggers:

| Trigger | When | Why |
| --- | --- | --- |
| `workflow_dispatch` (manual) | Operator runs it ad hoc from the Actions tab | Cut a bundle for a specific commit without tagging |
| `push` on tags `unity-build-*` | Any tag matching that prefix | Named rollback bundle; tag stays in the repo as a record |
| `push` on tags `v*` | Release tags | Every production cut has a matching rollback bundle |
| `schedule` cron `0 3 * * 1` | Weekly Monday 03:00 UTC | Proves the toolchain still works when nobody's touching `legacy/unity-client/` |

Artefact: `spillorama-unity-webgl-<sha>`, 90-day retention. Contains the full WebGL bundle from `build/WebGL/` plus `BUILD_METADATA.txt` stamped with commit SHA + run URL + Unity version.

---

## 2. One-time CI setup

Before the first run, the ops owner must configure three GitHub repo secrets:

| Secret | Value | Notes |
| --- | --- | --- |
| `UNITY_LICENSE` | Full contents of the `.ulf` license file | Preferred path. Generate via GameCI [license activation flow](https://game.ci/docs/github/activation). |
| `UNITY_EMAIL` | Unity account email | Fallback when `UNITY_LICENSE` is unset (Pro serial path). |
| `UNITY_PASSWORD` | Unity account password | Ditto. Rotate if exposed. |
| `UNITY_SERIAL` | Unity Pro serial | Only if using the Pro-serial path. |

**Licence tier decision:** the bingo platform is a commercial product, so a Unity Pro seat is required under Unity's revenue thresholds (the legal thresholds change per year; confirm with Unity sales when in doubt). For the one-off rollback bundle this secret only needs to cover the CI build — a single Pro seat tied to a build-service email is the cheapest path.

Without the license secrets, the workflow fails in the "Build WebGL bundle" step with a licence activation error. That's intentional — a useless unsigned bundle is worse than no bundle.

---

## 3. Running the build

### Option A — ad hoc (most common during pilot)

1. GitHub → Actions → **Unity WebGL build (BIN-532)** → "Run workflow".
2. Enter the git ref (default `main`) and click "Run workflow".
3. Wait ~25 min on first cache miss, ~5 min with warm `Library/` cache.
4. When green, download the artefact from the run's Artifacts section.

### Option B — via tag

```bash
git tag unity-build-2026-04-18
git push origin unity-build-2026-04-18
```

Same outcome as Option A, but the tag stays in the repo as a permanent reference to the bundle.

### Option C — via release

Any `v*` release tag (e.g. `v1.2.3`) automatically triggers a matching Unity build. The artefact is named after the release SHA so the rollback pairing is 1-to-1.

---

## 4. Deploying the rollback bundle

Goal: during pilot, if the on-call decides to roll a hall (or all halls) back to Unity, the bundle from §3 must be serving at the Unity client path within the same 2-min SLA as the feature-flag flip (BIN-540).

**Steps** (operator, ~3 min if bundle is already downloaded):

1. Download the artefact from the CI run. Unzip to a local directory, e.g. `~/unity-rollback-<sha>/`.
2. Verify `BUILD_METADATA.txt` shows the expected commit SHA.
3. Upload the bundle to the Unity client hosting location:
   - **Render static site** (current production host): replace the files at `apps/backend/public/web/games/unity/` via the Render dashboard upload, or via a deploy PR that commits the bundle under that path. Preferred path is the deploy PR so the change is reviewable.
   - **CDN** (if one's fronted): purge the CDN cache for `/web/games/unity/*` after the swap.
4. Flip the hall client-variant flag to `unity-fallback` per `ROLLBACK_RUNBOOK.md` §2 or §3. New sessions immediately load the Unity bundle.

**Rollback-of-rollback:** if the Unity bundle itself is broken (rare but possible), flip the flag back to `web` — players return to the web client. The per-hall flag is bi-directional by design.

---

## 5. Rehearsal requirement (pre-pilot)

RELEASE_GATE §7 expects a staging rehearsal of this runbook. Checklist for the rehearsal:

- [ ] CI workflow runs green with the real `UNITY_LICENSE` secret (not a dry-run).
- [ ] Artefact downloads and unzips cleanly.
- [ ] `BUILD_METADATA.txt` matches the commit SHA from the run.
- [ ] Bundle deploys to the staging static host without errors.
- [ ] Opening the staging lobby with `?client_variant=unity-fallback` (or via a flipped staging hall row) loads the Unity client and a test game completes end-to-end.
- [ ] Time from "decision to roll back" → "next session lands on Unity" is measured and recorded — target < 5 min for the first rehearsal (< 2 min once the bundle is pre-staged on CDN).

Record the rehearsal pass in `RELEASE_GATE.md` §7 Unity-build checkbox with the CI run URL.

---

## 6. Known gaps / follow-ups

- **Bundle size:** Unity WebGL bundles for the current `legacy/unity-client/` are ~35 MB compressed. If rollback traffic hits an un-warmed CDN, first-session load will be slow. Pre-warm the CDN by pulling the bundle from multiple regions before flipping the flag on the first hall.
- **Reproducibility note:** `allowDirtyBuild: true` is set in the workflow so a slightly-dirty working tree doesn't block a hot-fix build. For auditable production bundles, prefer building from a clean tag (Option B / C).
- **Source-map / debug symbols:** not emitted by default. If production Unity debugging is needed, extend the workflow's `buildMethod` to include a Unity build script that preserves symbols and uploads them separately.
- **Cost:** GameCI's Unity Pro licence runtime is billable per minute. Weekly cron + every release tag is ~4 builds/month — keep an eye on the invoice.
