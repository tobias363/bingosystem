# Candy Release Rollout Plan (Chat 1)

## Branches
1. Integration branch: `codex/candy-c1-bonus-integration-step1`
2. Base branch for prod release: `main`

## Included Work
Integrasjonsbranch inkluderer:
1. Chat 1: 30-draw cap + bonus bridge + docs.
2. Chat 2: near-win/pattern visibility fixes.
3. Chat 3: realtime bonus flow + bonus payout in winning sum.

## Pre-merge QA
1. Backend checks:
```bash
npm --prefix backend run check
npm --prefix backend run build
```
2. Smoke-test etter runbook:
- `docs/CANDY_SMOKE_RUNBOOK.md`
3. Preflight for Candy launch API på deploy target:
```bash
curl -i -X POST "$CANDY_API_BASE_URL/api/games/candy/launch-token" \
  -H "Authorization: Bearer $CANDY_TEST_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```
Forventet: HTTP `200` + JSON payload med `launchToken`.

## Merge Order
1. Opprett PR: `codex/candy-c1-bonus-integration-step1` -> `main`
2. Review gate:
- Ingen merge-conflicts.
- Smoke-test sign-off.
3. Merge til `main`.
4. Trigger deploy på Render.
5. Kjør smoke-test i prod umiddelbart.

## Deterministisk Candy deploy (WebGL paritet)
1. Kjør `.github/workflows/deploy-candygame.yml` på riktig environment (`staging`/`production`).
2. Workflow bygger WebGL fra aktuell Bingo-commit og publiserer kun:
- `index.html`
- `Build/*`
- `TemplateData/*`
- `release.json`
3. Workflow validerer:
- `release.json.releaseCommit == github.sha[:8]` i build-output
- live `release.json.releaseCommit` etter Render deploy
4. Etter vellykket deploy synkes backend automatisk:
- Candy game `launchUrl`
- Candy game `apiBaseUrl`
- Candy drift policy (`autoRoundStartEnabled=true`, `autoRoundStartIntervalMs=30000`, `autoRoundMinPlayers=1`, `autoDrawEnabled=true`)
5. E2E gate må passere:
- launch-token -> resolve
- rundestart fra scheduler innen 45s
- runde avsluttes med `endedReason=MAX_DRAWS_REACHED` etter 30 trekk
- claim-kontrakt verifiseres for `winningPatternIndex/patternIndex/bonusTriggered/bonusAmount`

## Suggested Commands
```bash
git checkout main
git pull origin main
git merge --no-ff origin/codex/candy-c1-bonus-integration-step1
git push origin main
```

## Rollback Plan
Hvis prod feiler:
1. Umiddelbar app-rollback i Render til forrige grønne deploy.
2. Git rollback med revert av merge commit:
```bash
git checkout main
git pull origin main
git log --oneline -n 5
git revert -m 1 <merge_commit_sha>
git push origin main
```
3. Verifiser `/health` + Candy smoke-test etter rollback.
4. Rollback-eier må dokumentere tidspunkt + deploy-id + resultat av:
   - `GET /health`
   - `POST /api/games/candy/launch-token`
   - `POST /api/games/candy/launch-resolve`
5. Verifiser fingerprint etter rollback:
   - `GET https://<candygame-host>/release.json`
   - bekreft at `releaseCommit` matcher rollback-målet
6. Verifiser scheduler-policy fortsatt 30s etter rollback:
   - `GET /api/admin/candy-mania/settings`
   - forvent `autoRoundStartIntervalMs=30000`

## Post-release Validation
1. `/health` returnerer `ok:true`.
2. Candy launch fungerer for testbruker.
3. Runde avsluttes ved 30 trekk.
4. Bonus/winning oppdatering er konsistent.
5. Ingen nye kritiske feil i Render logs.
