using System;
using SimpleJSON;

public partial class APIManager
{
    private void HandleRealtimeRoomUpdate(JSONNode snapshot)
    {
        if (ShouldUseDedicatedTheme1RealtimeView() &&
            TryResolveDedicatedTheme1GameplayView(out Theme1GameplayViewRoot dedicatedTheme1ViewRoot))
        {
            HandleRealtimeRoomUpdateDedicated(snapshot, dedicatedTheme1ViewRoot);
            return;
        }

        if (snapshot == null || snapshot.IsNull)
        {
            return;
        }
        try
        {
            string snapshotRoomCode = snapshot["code"];
            if (!string.IsNullOrWhiteSpace(snapshotRoomCode))
            {
                activeRoomCode = snapshotRoomCode.Trim().ToUpperInvariant();
                roomCode = activeRoomCode;
            }

            string snapshotHallId = snapshot["hallId"];
            if (!string.IsNullOrWhiteSpace(snapshotHallId))
            {
                hallId = snapshotHallId.Trim();
            }

            string snapshotHostPlayerId = snapshot["hostPlayerId"];
            if (!string.IsNullOrWhiteSpace(snapshotHostPlayerId))
            {
                activeHostPlayerId = snapshotHostPlayerId.Trim();
            }

            ResolveRealtimePlayerIdFromSnapshot(snapshot, syncField: true);
            ApplySchedulerMetadata(snapshot);

            JSONNode currentGame = snapshot["currentGame"];
            if (currentGame == null || currentGame.IsNull)
            {
                string previousGameId = activeGameId;
                bool shouldPreserveEndedRoundOverlay =
                    !string.IsNullOrWhiteSpace(previousGameId) &&
                    string.Equals(delayedOverlayResetGameId, previousGameId, StringComparison.Ordinal) &&
                    !string.Equals(overlaysClearedForEndedGameId, previousGameId, StringComparison.Ordinal) &&
                    TryShowEndedRoundResultsFromHistory(snapshot, previousGameId);

                realtimeScheduler.SetCurrentGameStatus("NONE");
                if (shouldPreserveEndedRoundOverlay)
                {
                    overlaysClearedForEndedGameId = previousGameId;
                    activeGameId = string.Empty;
                    realtimePlayerParticipatingInCurrentRound = false;
                    processedDrawCount = 0;
                    currentTicketPage = 0;
                    RefreshRealtimeCountdownLabel(forceRefresh: true);
                    return;
                }

                if (!string.IsNullOrWhiteSpace(delayedOverlayResetGameId))
                {
                    ResetRealtimeRoundVisuals();
                    NumberGenerator endedRoundGenerator = ResolveNumberGenerator();
                    if (endedRoundGenerator != null)
                    {
                        endedRoundGenerator.ClearPaylineVisuals();
                    }

                    StopRealtimeMatchedPatternVisuals();
                    StopRealtimeNearWinBlinking();
                    ResetRealtimeBonusState(closeBonusPanel: true, previousGameId: delayedOverlayResetGameId);
                    delayedOverlayResetGameId = string.Empty;
                }

                activeGameId = string.Empty;
                realtimePlayerParticipatingInCurrentRound = false;
                processedDrawCount = 0;
                currentTicketPage = 0;
                bool appliedPreRoundTickets = TryApplyPreRoundTicketsFromSnapshot(snapshot);
                if (appliedPreRoundTickets)
                {
                    overlaysClearedForEndedGameId = string.IsNullOrWhiteSpace(previousGameId)
                        ? overlaysClearedForEndedGameId
                        : previousGameId;
                }
                else if (TryApplyCachedStableTickets())
                {
                    overlaysClearedForEndedGameId = string.IsNullOrWhiteSpace(previousGameId)
                        ? overlaysClearedForEndedGameId
                        : previousGameId;
                }
                else if (preserveTicketNumbersOnTransientSnapshotGaps && activeTicketSets != null && activeTicketSets.Count > 0)
                {
                    ApplyTicketSetsToCards(activeTicketSets);
                    overlaysClearedForEndedGameId = string.IsNullOrWhiteSpace(previousGameId)
                        ? overlaysClearedForEndedGameId
                        : previousGameId;
                }
                else if (!string.IsNullOrWhiteSpace(previousGameId))
                {
                    ClearRealtimeTicketCards();
                    activeTicketSets.Clear();
                    cachedStableTicketSets.Clear();
                    realtimeTicketFallbackLogKey = string.Empty;
                    overlaysClearedForEndedGameId = previousGameId;
                }
                else
                {
                    if (TryApplyCachedStableTickets())
                    {
                        // Behold siste gyldige preround-bonger hvis snapshotet mangler dem midlertidig.
                    }
                    else if (preserveTicketNumbersOnTransientSnapshotGaps && activeTicketSets != null && activeTicketSets.Count > 0)
                    {
                        ApplyTicketSetsToCards(activeTicketSets);
                    }
                    else
                    {
                        activeTicketSets.Clear();
                        realtimeTicketFallbackLogKey = string.Empty;
                    }
                }
                RefreshRealtimeCountdownLabel(forceRefresh: true);
                return;
            }

            realtimeScheduler.SetCurrentGameStatus(currentGame["status"]);

            string gameId = currentGame["id"];
            if (string.IsNullOrWhiteSpace(gameId))
            {
                RefreshRealtimeCountdownLabel(forceRefresh: true);
                return;
            }

            bool startedNewGame = false;
            if (!string.Equals(activeGameId, gameId, StringComparison.Ordinal))
            {
                string previousGameId = activeGameId;
                activeGameId = gameId;
                startedNewGame = true;
                processedDrawCount = 0;
                currentTicketPage = 0;
                activeTicketSets.Clear();
                realtimeTicketFallbackLogKey = string.Empty;
                ResetRealtimeRoundVisuals();
                NumberGenerator nextRoundGenerator = ResolveNumberGenerator();
                if (nextRoundGenerator != null)
                {
                    nextRoundGenerator.ClearPaylineVisuals();
                }

                StopRealtimeNearWinBlinking();
                ResetRealtimeBonusState(closeBonusPanel: true, previousGameId: previousGameId);
            }

            if (string.Equals(realtimeScheduler.LatestGameStatus, "ENDED", StringComparison.OrdinalIgnoreCase))
            {
                delayedOverlayResetGameId = gameId;
            }
            else if (string.Equals(delayedOverlayResetGameId, gameId, StringComparison.Ordinal))
            {
                delayedOverlayResetGameId = string.Empty;
            }

            bool isActiveRoundParticipant = ApplyVisibleTicketSetsForCurrentSnapshot(currentGame, snapshot);
            realtimePlayerParticipatingInCurrentRound = isActiveRoundParticipant;
            if (startedNewGame)
            {
                SyncRealtimeFinancialsForRoundStart(isActiveRoundParticipant);
            }
            ApplyDrawnNumbers(currentGame, isActiveRoundParticipant);
            if (isActiveRoundParticipant)
            {
                RefreshRealtimeWinningPatternVisuals(currentGame);
            }
            else
            {
                ClearRealtimeTicketTransientVisuals();
                StopRealtimeMatchedPatternVisuals();
                StopRealtimeNearWinBlinking();
                ResetRealtimeBonusState(closeBonusPanel: true);
            }
            RefreshRealtimeCountdownLabel(forceRefresh: true);
        }
        finally
        {
            NotifyRealtimeControlsStateChanged();
        }
    }
}
