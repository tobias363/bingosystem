using System;
using UnityEngine;

public partial class APIManager
{
    private void ResetRealtimeBonusState(bool closeBonusPanel, string previousGameId = null)
    {
        bonusAMT = 0;
        realtimeBonusTriggeredGameId = string.Empty;
        realtimeBonusTriggeredClaimId = string.Empty;
        realtimeBonusMissingDataLogKey = string.Empty;

        NumberGenerator generator = ResolveNumberGenerator();
        if (generator == null)
        {
            return;
        }

        generator.ResetRealtimeBonusFlow(closeBonusPanel, previousGameId);
    }

    private int GetCardSlotsCount()
    {
        NumberGenerator generator = ResolveNumberGenerator();
        if (generator != null && generator.cardClasses != null && generator.cardClasses.Length > 0)
        {
            return generator.cardClasses.Length;
        }

        return 1;
    }

    private void ResetActiveRoomState(bool clearDesiredRoomCode)
    {
        ClearJoinOrCreatePending();
        ResolveGameManager()?.SyncRealtimeBetReservation(false, 0);
        activeRoomCode = string.Empty;
        activePlayerId = string.Empty;
        activeHostPlayerId = string.Empty;
        activeGameId = string.Empty;
        realtimeScheduler.Reset();
        realtimeRoomConfigurator.ResetWarningState();
        realtimeCountdownPresenter.ResetLayoutCache();
        processedDrawCount = 0;
        currentTicketPage = 0;
        activeTicketSets.Clear();
        cachedStableTicketSets.Clear();
        realtimeTicketFallbackLogKey = string.Empty;
        realtimePlayerParticipatingInCurrentRound = false;
        realtimeBetArmedForNextRound = false;
        desiredRealtimeBetArmedForNextRound = false;
        pendingRealtimeBetArmRequest = false;
        realtimeBetArmAwaitingAck = false;
        realtimeBetArmMutationVersion = 0;
        pendingRealtimePreRoundEditContinuation = null;
        delayedOverlayResetGameId = string.Empty;
        overlaysClearedForEndedGameId = string.Empty;
        StopRealtimeNearWinBlinking();
        ResetRealtimeBonusState(closeBonusPanel: true);
        nextScheduledRoomStateRefreshAt = -1f;
        nextScheduledManualStartAttemptAt = -1f;
        nextMissingRealtimeTicketsResyncAt = -1f;

        if (clearDesiredRoomCode)
        {
            roomCode = string.Empty;
        }
    }

    private void MarkJoinOrCreatePending()
    {
        isJoinOrCreatePending = true;
        joinOrCreateIssuedAtRealtime = Time.realtimeSinceStartup;
    }

    private void ClearJoinOrCreatePending()
    {
        isJoinOrCreatePending = false;
        joinOrCreateIssuedAtRealtime = -1f;
    }

    private bool IsJoinOrCreateTimedOut()
    {
        if (!isJoinOrCreatePending)
        {
            return false;
        }

        if (joinOrCreateIssuedAtRealtime < 0f)
        {
            return true;
        }

        return (Time.realtimeSinceStartup - joinOrCreateIssuedAtRealtime) > 8f;
    }
}
