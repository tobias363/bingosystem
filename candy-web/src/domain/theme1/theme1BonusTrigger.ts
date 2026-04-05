import type { ClaimRecord, RealtimeRoomSnapshot } from "@/domain/realtime/contracts";
import { theme1BonusPayoutTable, createTheme1BonusRound, createTheme1WinningBonusRound } from "@/domain/theme1/theme1Bonus";
import type { Theme1BonusState, Theme1BonusSymbolId } from "@/domain/theme1/renderModel";

interface ExtractNewTheme1BonusTriggerInput {
  playerId: string;
  knownClaimIds: readonly string[];
  previousGameId: string;
}

export interface Theme1BonusTrigger {
  claimId: string;
  amountKr: number;
  winningPatternIndex?: number;
  topperSlotIndex?: number;
}

export function extractNewTheme1BonusTrigger(
  snapshot: RealtimeRoomSnapshot,
  input: ExtractNewTheme1BonusTriggerInput,
): Theme1BonusTrigger | null {
  const nextGameId = snapshot.currentGame?.id ?? "";
  const retainedClaimIds =
    nextGameId !== input.previousGameId ? [] : [...input.knownClaimIds];
  const seenClaimIds = new Set(retainedClaimIds);
  const freshClaims: ClaimRecord[] = [];

  const relevantClaims = (snapshot.currentGame?.claims ?? [])
    .filter((claim) => isBonusTriggerClaim(claim, input.playerId))
    .sort(compareClaimsByCreatedAt);

  for (const claim of relevantClaims) {
    if (!seenClaimIds.has(claim.id)) {
      freshClaims.push(claim);
    }

    seenClaimIds.add(claim.id);
  }

  const latestClaim = freshClaims.at(-1);
  if (!latestClaim) {
    return null;
  }

  return {
    claimId: latestClaim.id,
    amountKr: normalizeAmount(latestClaim.bonusAmount ?? latestClaim.payoutAmount ?? 0),
    winningPatternIndex:
      typeof latestClaim.winningPatternIndex === "number"
        ? latestClaim.winningPatternIndex
        : undefined,
    topperSlotIndex:
      typeof latestClaim.topperSlotIndex === "number"
        ? latestClaim.topperSlotIndex
        : undefined,
  };
}

export function createTheme1BonusStateFromTrigger(trigger: Theme1BonusTrigger): Theme1BonusState {
  const bonusSymbolId = resolveTheme1BonusSymbolIdForPayoutAmount(trigger.amountKr);
  return bonusSymbolId
    ? createTheme1WinningBonusRound({ winningSymbolId: bonusSymbolId })
    : createTheme1BonusRound();
}

function isBonusTriggerClaim(claim: ClaimRecord, playerId: string): boolean {
  return (
    claim.valid &&
    claim.type === "PATTERN" &&
    claim.playerId === playerId &&
    claim.bonusTriggered === true
  );
}

function resolveTheme1BonusSymbolIdForPayoutAmount(amountKr: number): Theme1BonusSymbolId | null {
  const normalizedAmount = normalizeAmount(amountKr);
  const payoutEntry = theme1BonusPayoutTable.find((entry) => entry.payoutKr === normalizedAmount);
  return payoutEntry?.symbolId ?? null;
}

function normalizeAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function compareClaimsByCreatedAt(left: ClaimRecord, right: ClaimRecord): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
}
