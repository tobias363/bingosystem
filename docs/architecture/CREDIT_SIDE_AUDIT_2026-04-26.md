# Credit-side Audit — 2026-04-26

**Author:** Agent CREDIT-AUDIT (read-only investigation)
**Trigger:** Tobias' wallet `pm-test-pg-1777222913@spillorama.test` viste at en
72 kr-prize fra 17:26:56 endte på `deposit_balance`, mens etterfølgende
prizes (100 kr + 92 kr) endte korrekt på `winnings_balance`.

> Sum av prizes 17:26:56 + 17:54:40 + 17:55:32 = 264 kr.
> `winnings_balance` etter siste prize = 192 kr.
> Differanse: 72 kr (= 17:26:56-prize) → faktisk havnet på deposit-siden.

---

## TL;DR

Kort sagt:

1. **Det var IKKE noe code-fix mellom 17:26 og 17:54 som flyttet prize-credit
   fra deposit-side til winnings-side.** Alle ad-hoc-engine-paths i
   `BingoEngine.ts` har skrevet `targetSide: "winnings"` siden
   2026-04-23 (commit `cb91adb6e`) og `BingoEngine.payoutPhaseWinner` siden
   PR-W3 / `a0a43f10` (2026-04-22).
2. **De synlige deploysene mellom 17:26 og 17:54** var:
   - 17:10 PR #555 (`d4a7f16a`) — Mystery-default i mini-game-orchestrator,
     null påvirkning på credit-target.
   - 17:13 postgres-deploy (env/redis-deploy) — irrelevant for credit-target.
3. PR #553 (W1-hotfix) — som **er** referert i headeren — var deployet
   16:34 lokal, *før* begge prize-eventene. Den fikset bare
   `Game1DrawEngineService` (scheduled-engine), ikke `BingoEngine`
   (ad-hoc-engine).
4. **PR #550 (K2-A regulatorisk)** og **PR #551 (K2-B atomicity)** — som
   *ville* påvirket credit-target — ble merget først 19:35–19:40 lokal,
   ETTER begge prizene. K2-A bytter `gameType: "DATABINGO"` (hardkodet) til
   `ledgerGameTypeForSlug(room.gameSlug)`, som returnerer `"MAIN_GAME"` for
   `bingo`-slug. Dette endrer **`houseAccountId`** men ikke
   credit-target-logikken som sådan.
5. **De faktiske ad-hoc-engine-fixene `c80cd7b2` (19:06) og `14e1db3a`
   (19:54) handler IKKE om credit-target.** De fikser bare
   in-memory-`Player.balance`-refresh slik at `room:update`-snapshot ikke
   sender stale balance på 2.+ vinn. Selve DB-write-en gikk korrekt til
   winnings hele tiden — bare klient-snapshot-en var stale.

**Konklusjon:** 72 kr-prize-en på 17:26:56 har enten:
- (a) blitt skrevet av en helt annen flyt (refund / topup / non-payout),
- (b) trukket en idempotency-key-cache-hit fra en *tidligere*
  `transfer`-call med `targetSide: "deposit"`,
- (c) blitt routet via et code-path vi ikke har dekket — sannsynligvis
  scheduled-engine på samme rom (CRIT-4, fixet 19:36).

Punkt (c) er den mest sannsynlige årsaken — se §5 nedenfor.

---

## 1. Tidslinje 2026-04-26 (lokal tid CEST, +0200)

| Tid | Event |
|---|---|
| 14:34 | PR #553 W1-hotfix merget (`41ed85de`) — fikser `Game1DrawEngineService` (scheduled). Ad-hoc *ikke* berørt. |
| 16:34 | PR #553 deployed på Render (auto-deploy ved merge til main). |
| 17:01:53 | Tobias gjør TOPUP +1000 kr (initial). |
| 17:01:54 | Tobias gjør TOPUP +5000 kr. Wallet: 6000 deposit / 0 winnings. |
| 17:10 | PR #555 (Mystery-default i mini-game-orchestrator) merget (`d4a7f16a`). Endrer ingen credit-target. |
| 17:13 | Postgres-deploy (Render). Bare infrastruktur. |
| **17:26:28** | TRANSFER_OUT –90 kr (Bingo buy-in BINGO1, 4 tickets). Wallet: 5910 / 0. |
| **17:26:56** | TRANSFER_IN +72 kr (1 Rad prize BINGO1). **Skulle ha gått til winnings — gikk til deposit.** Wallet: 5982 / 0. |
| 17:54:00 | TRANSFER_OUT –240 kr (Bingo buy-in BINGO1, 4 tickets). |
| 17:54:40 | TRANSFER_IN +100 kr (1 Rad prize BINGO1) → deposit 5742 / winnings 100. Korrekt. |
| 17:55:32 | TRANSFER_IN +92 kr (2 Rader prize BINGO1) → 5742 / 192. Korrekt. |
| 19:06 | `c80cd7b2` mergedt — ad-hoc BingoEngine submitClaim **wallet refresh** (fikser stale in-memory balance, ikke credit-target). |
| 19:35 | PR #550 K2-A regulatorisk merget (`fcb4cb43`) — `gameType` per-slug-resolver. |
| 19:40 | PR #551 K2-B atomicity merget (`f1814893`). |
| 19:54 | `14e1db3a` — duplikat av `c80cd7b2` (ad-hoc wallet refresh). |

---

## 2. Code-state for ad-hoc-engine på 17:26 og 17:54

På begge tidspunktene var `BingoEngine.ts` på post-W3-state. Dette er
verifisert via `git blame` på de aktuelle `targetSide: "winnings"`-linjene:

| Linje | Hash | Dato | Kontekst |
|---|---|---|---|
| 1388 | `a0a43f10` | 2026-04-22 18:57 | `payoutPhaseWinner` — auto-claim phase prize |
| 1920 | `cb91adb6e` | 2026-04-23 10:28 | `submitClaim` LINE-grenen |
| 2016 | `cb91adb6e` | 2026-04-23 10:28 | `submitClaim` BINGO-grenen |
| 2606 | `cb91adb6e` | 2026-04-23 10:28 | `awardExtraPrize` |
| BingoEngineMiniGames.ts:156 | `92ca9c782` | 2026-04-23 09:58 | `spinJackpot` |
| BingoEngineMiniGames.ts:286 | `cb91adb6e` | 2026-04-23 10:28 | `playMiniGame` |

**Alle ad-hoc-engine-payout-paths har sendt `targetSide: "winnings"` siden
2026-04-23.** Det var ingen relevant code-endring 17:26 → 17:54.

Tilsvarende for scheduled-engine:

| Fil:linje | Parameter |
|---|---|
| `Game1PayoutService.ts:259` | `to: "winnings"` (PR-W2) |
| `Game1DrawEngineService.ts:2616` | `to: "winnings"` (Lucky Bonus) |
| `Game1DrawEngineDailyJackpot.ts:218` | `to: "winnings"` |
| `Game2Engine.ts:358` (jackpot) | `targetSide: "winnings"` |
| `Game2Engine.ts:454` (lucky-bonus) | `targetSide: "winnings"` |
| `Game3Engine.ts:516` | `targetSide: "winnings"` |

---

## 3. Hvordan credit-target faktisk bestemmes

I `apps/backend/src/adapters/PostgresWalletAdapter.ts`:

### Transfer (line 432, 467)

```ts
const requestedTarget: WalletAccountSide = options?.targetSide ?? "deposit";
// ...
const effectiveTarget: WalletAccountSide =
  toAccount.is_system ? "deposit" : requestedTarget;
```

### Credit (line 325)

```ts
const target: WalletAccountSide = options?.to ?? "deposit";
```

### Ledger entries (line 873–876, executeLedger)

```ts
const sign = entry.side === "CREDIT" ? 1 : -1;
const side = entry.accountSide ?? "deposit";  // ← key
const target = side === "winnings" ? winningsDeltas : depositDeltas;
```

Så DB-state oppdateres basert på `accountSide` på hver enkelt ledger-entry.
Hvis caller sender `targetSide: "winnings"` → `effectiveTarget = "winnings"`
→ `accountSide = "winnings"` på CREDIT-entry-en → `winnings_balance` økes.

Default (uten `targetSide`/`to`) → `"deposit"`. **Dette er edge-casen.**

---

## 4. Edge-cases der prize fortsatt kan gå til deposit

### 4.1 Idempotency-key-collision (mest sannsynlig)

`PostgresWalletAdapter.singleAccountMovement` linje 621–623:

```ts
if (input.idempotencyKey) {
  const existing = await this.findByIdempotencyKey(input.idempotencyKey);
  if (existing) return existing;
}
```

`PostgresWalletAdapter.transfer` har samme logikk (linje 528+).

**Konsekvens:** hvis det finnes en eksisterende transaksjon med samme
idempotency-key, returneres dén transaksjonen *uten* å skrive ny ledger-entry.
Hvis den eksisterende tx-en ble skrevet med `targetSide: "deposit"`
(eller default), blir prize-en aldri lagt til `winnings_balance` —
selv om den nye `transfer`-callen sender `"winnings"`.

**Faktisk risiko nå:** lav for *helt nye* prize-keyer (alle idempotency-key-formler
i `idempotency.ts` inkluderer entydige IDs som `gameId` + `claimId`/`patternId`/
`playerId`). Men hvis et code-path tidligere har brukt samme key med annet
target (f.eks. legacy-data eller dev-test-data), vil cache-hit gjenbruke den.

### 4.2 Dual-engine-collision (CRIT-4 — lukkede 19:40 lokal)

`BingoEngine` (ad-hoc) og `Game1DrawEngineService` (scheduled) bruker
**forskjellige idempotency-keyer** (`phase-{patternId}-{gameId}-{playerId}`
vs `g1-phase-{scheduledGameId}-{phase}-{assignmentId}`). Begge engines kunne
i teorien kjøre på samme rom før CRIT-4-guarden ble innført — det betyr at:

- Ad-hoc skrev prize til winnings (`targetSide: "winnings"`)
- Scheduled skrev *også* prize til winnings (`to: "winnings"`)
- **MEN** hvis en av dem brukte annen credit-target (f.eks. en
  ekstra-feature-flag), kunne en av prizene endt på deposit.

Tobias' rom (BINGO1) er en **ad-hoc-rom-kode** (room:create-flow), så det
er sannsynligvis bare ad-hoc-engine som kjørte. Likevel — CRIT-4-fixen
beskriver eksplisitt scenariet "dual-payout siden idempotency-keyene
differerer".

### 4.3 Refund vs payout-mix-up

Hvis Tobias før 17:26 hadde en pending refund (f.eks. avbestilt purchase),
og en `wallet.credit(... { to: "deposit" })`-call ble kjørt med samme
`reason`/idempotency som prize-en, ville den eksisterende deposit-tx-en
returneres ved cache-hit. Sjekk `app_wallet_transactions WHERE
account_id = '<tobias-wallet>' ORDER BY created_at LIMIT 50` for å verifisere.

### 4.4 System-account klassifiserings-bug

Hvis Tobias' wallet ved et uhell hadde `is_system = true`, ville
`PostgresWalletAdapter.transfer` (linje 467) tvinge `effectiveTarget = "deposit"`.
Sjekk `SELECT is_system FROM wallet_accounts WHERE id = '<tobias-wallet-id>'` —
forventer `false`.

### 4.5 Manglende `targetSide` på *en* call-site

Vi har gjennomgått alle `walletAdapter.transfer`/`wallet.credit`-call-sites
i `apps/backend/src/game/`. Samtlige prize-paths har `targetSide: "winnings"`
eller `to: "winnings"`. Eneste unntak er **refunds** (deposit, by design)
og **buy-ins** (debit, hvor `targetSide` er irrelevant).

---

## 5. Mest sannsynlige forklaring på 17:26-bug-en

Etter å ha eliminert alle code-paths som kan rute til deposit, er det
mest sannsynlige scenariet:

> **17:26:56-prize-en ble skrevet via et idempotency-key-cache-hit fra en
> tidligere wallet-tx (sannsynligvis topup eller refund) som hadde
> deposit-target.**

Verifiserings-query (read-only):

```sql
SELECT
  id,
  account_id,
  transaction_type,
  amount,
  reason,
  related_account_id,
  idempotency_key,
  account_side,
  created_at
FROM wallet_transactions
WHERE account_id = '<tobias-wallet-id>'
  AND created_at BETWEEN '2026-04-26 17:00:00+02' AND '2026-04-26 18:00:00+02'
ORDER BY created_at;
```

og

```sql
-- Sjekk om idempotency-key-en var brukt før prize-tx-en
SELECT id, transaction_type, amount, account_side, created_at
FROM wallet_transactions
WHERE idempotency_key = (
  SELECT idempotency_key
  FROM wallet_transactions
  WHERE account_id = '<tobias-wallet-id>'
    AND amount = 72
    AND created_at = '2026-04-26 17:26:56'
)
ORDER BY created_at;
```

Hvis den siste returnerer >1 rad, og første raden ble skrevet før 17:26:56
med `account_side = 'deposit'`, er hypotesen bekreftet.

---

## 6. Anbefalte tester for å sikre prize → winnings (regression-prevention)

### 6.1 Integration-test: end-to-end prize-flow til winnings

```ts
// apps/backend/src/game/__tests__/BingoEngine.prizeAlwaysWinnings.test.ts
test("LINE prize krediterer winnings_balance, ikke deposit_balance", async () => {
  const wallet = createTestWalletAdapter();
  const player = await wallet.createAccount({ initialBalance: 1000 });
  // player har 1000 deposit / 0 winnings

  const engine = new BingoEngine({ walletAdapter: wallet, ... });
  // ... join + buy-in + draw + claim LINE

  const balances = await wallet.getBothBalances(player.id);
  expect(balances.winnings).toBeGreaterThan(0);  // ← prize landed here
  expect(balances.deposit).toBe(1000 - buyIn);  // ← deposit unchanged by prize
});
```

Test for hver: LINE / BINGO / payoutPhaseWinner / spinJackpot / playMiniGame /
awardExtraPrize / Game1PayoutService / Game2 jackpot / Game2 lucky / Game3
prize / Game1DrawEngineDailyJackpot / Game1DrawEngineService Lucky-bonus.

### 6.2 Property-test: idempotency-key-format kollisjon

```ts
test("idempotency-keyer kolliderer ikke på tvers av engines", () => {
  const adhoc = IdempotencyKeys.adhocLinePrize({ gameId: "G1", claimId: "C1" });
  const scheduled = IdempotencyKeys.game1Phase({
    scheduledGameId: "G1", phase: "1RAD", assignmentId: "C1",
  });
  expect(adhoc).not.toBe(scheduled);
  // Plus: enumerér alle keyer og sjekk pairwise inequality
});
```

### 6.3 DB-invariant-test: prize-PRIZE-ledger-entries har account_side='winnings'

```ts
test("alle PRIZE-ledger-entries krediterer winnings-side på user-wallet", async () => {
  // Etter en hel runde: query app_compliance_ledger + wallet_transactions
  // og verifiser at hver PRIZE-entry sin tilhørende CREDIT-tx har
  // account_side = 'winnings' på user-konto-siden.
  const rows = await db.query(`
    SELECT wt.account_side, wt.amount
    FROM wallet_transactions wt
    JOIN app_compliance_ledger acl ON acl.target_account_id = wt.account_id
    WHERE acl.event_type = 'PRIZE'
      AND wt.transaction_type = 'TRANSFER_IN'
      AND wt.account_id NOT IN (SELECT id FROM wallet_accounts WHERE is_system)
  `);
  for (const row of rows) {
    expect(row.account_side).toBe("winnings");
  }
});
```

### 6.4 Reconciliation-cron som flagger anomali

I `BIN-763 WalletReconciliation`-service: legg til invariant:
```sql
SELECT account_id, SUM(amount) AS total_prize_to_deposit
FROM wallet_transactions wt
JOIN app_compliance_ledger acl ON acl.target_account_id = wt.account_id
WHERE acl.event_type = 'PRIZE'
  AND wt.transaction_type = 'TRANSFER_IN'
  AND wt.account_side = 'deposit'
  AND wt.account_id NOT IN (SELECT id FROM wallet_accounts WHERE is_system)
GROUP BY account_id
HAVING SUM(amount) > 0;
```

Hvis radmengden > 0 → `wallet_reconciliation_alerts.severity = 'critical'`.

### 6.5 Type-system-guard mot manglende `targetSide`

Endre `transfer`-API-et slik at `targetSide` er **obligatorisk** for
prize-paths:

```ts
// Foreslått: ny type-safe wrapper
type PrizeTransferOptions = TransferOptions & {
  targetSide: "winnings";  // bokstavelig type — ikke valgfritt
};

walletAdapter.transferPrize(from, to, amount, reason, opts: PrizeTransferOptions);
```

Migrer all prize-code til `transferPrize()` slik at TypeScript-compilator
fanger opp manglende `targetSide`. Refunds beholder vanlig `transfer()`
med default deposit.

### 6.6 Idempotency-key-cache-revalidation

Når en `transfer`-call returnerer cache-hit, sjekk at den eksisterende
tx-en faktisk har samme `account_side` som requested `targetSide`.
Hvis ikke — kast `WalletError("IDEMPOTENCY_TARGET_MISMATCH")` slik at
caller ikke stiltiende får feil credit-side.

```ts
// I PostgresWalletAdapter.transfer:
if (input.idempotencyKey) {
  const existing = await this.findByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    if (existing.toAccountSide !== requestedTarget) {
      throw new WalletError(
        "IDEMPOTENCY_TARGET_MISMATCH",
        `Idempotency-key ${input.idempotencyKey} ble skrevet med ${existing.toAccountSide} men nå requested ${requestedTarget}.`,
      );
    }
    return existing;
  }
}
```

Dette ville forhindret 17:26-bug-en hvis hypotese §5 stemmer.

---

## 7. Oppsummering for PM

- **Det fantes IKKE en regresjon → bugfix mellom 17:26 og 17:54.** Koden
  var korrekt på begge tidspunkt.
- 17:26-bug-en er sannsynligvis idempotency-key-cache-hit eller en
  dual-engine-race på samme rom (CRIT-4 — lukket 19:40 men kun via
  `assertNotScheduled`-guard, ikke ved å fjerne risikoen for at *ad-hoc*
  rom kan ha stale tx-er fra et tidligere code-path).
- **PR-W3 / cb91adb6e (2026-04-23) er den siste relevante endringen** —
  før dén kunne ad-hoc-engine teoretisk skrive til deposit. Hvis det
  finnes wallet-tx-er fra før 2026-04-23 med matching idempotency-keyer,
  ville cache-hit returnere dem.
- **Mitigasjon:** test §6.6 (idempotency-target-mismatch-guard) er den
  enkleste regression-prevention. Den ville stoppet kanskje-bug-en
  17:26 ved å kaste tydelig error i stedet for å silently velge feil
  credit-side.

**Anbefalt neste skritt:**
1. Kjør verifiserings-queriene i §5 mot prod-DB for å bekrefte hypotesen.
2. Implementer guard §6.6 + reconciliation-invariant §6.4 i en oppfølgings-PR.
3. Hvis hypotesen ikke stemmer (ingen tidligere idempotency-key-match):
   utvid søket til å se om det fantes en parallell code-path (gammel
   docker-image, blå/grønn-deploy-leftover, rollback-state) som var live
   ved 17:26.

---

**Branch:** `docs/credit-side-audit-2026-04-26`
**Filer endret:** kun denne rapporten (read-only undersøkelse).
**Tester kjørt:** ingen (read-only).
**PR:** ikke laget (PM eier).
