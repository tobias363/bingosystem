using System;
using SimpleJSON;

public partial class APIManager
{
    private void HandleRealtimeRoomUpdateDedicated(JSONNode snapshot, Theme1GameplayViewRoot viewRoot)
    {
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
                realtimeScheduler.SetCurrentGameStatus("NONE");
                string previousGameId = activeGameId;
                activeGameId = string.Empty;
                lastDedicatedTheme1RoundState = null;
                realtimePlayerParticipatingInCurrentRound = false;
                processedDrawCount = 0;
                currentTicketPage = 0;
                delayedOverlayResetGameId = string.Empty;
                overlaysClearedForEndedGameId = string.IsNullOrWhiteSpace(previousGameId)
                    ? overlaysClearedForEndedGameId
                    : previousGameId;

                bool hasVisibleTickets = TryApplyPreRoundTicketSetsFromSnapshotDedicated(snapshot) ||
                                         TryApplyCachedStableTicketsDedicated();
                if (!hasVisibleTickets)
                {
                    activeTicketSets.Clear();
                    realtimeTicketFallbackLogKey = string.Empty;
                }

                ResetRealtimeBonusState(closeBonusPanel: true, previousGameId: previousGameId);
                RefreshRealtimeCountdownLabel(forceRefresh: true);
                StopRealtimeMatchedPatternVisuals();
                StopRealtimeNearWinBlinking();

                Theme1DisplayState preservedState = GetPreservedTheme1RoundDisplayState();
                if (preservedState != null)
                {
                    theme1DisplayPresenter.Render(viewRoot, preservedState);
                    RegisterDedicatedTheme1RenderMetrics(viewRoot, preservedState);
                }
                else
                {
                    RenderDedicatedTheme1State(viewRoot, currentGame: null);
                }
                return;
            }

            realtimeScheduler.SetCurrentGameStatus(currentGame["status"]);

            string gameId = currentGame["id"];
            if (string.IsNullOrWhiteSpace(gameId))
            {
                RefreshRealtimeCountdownLabel(forceRefresh: true);
                RenderDedicatedTheme1State(viewRoot, currentGame: null);
                return;
            }

            bool startedNewGame = false;
            if (!string.Equals(activeGameId, gameId, StringComparison.Ordinal))
            {
                string previousGameId = activeGameId;
                activeGameId = gameId;
                startedNewGame = true;
                lastDedicatedTheme1RoundState = null;
                ClearPreservedTheme1RoundDisplayState();
                processedDrawCount = 0;
                currentTicketPage = 0;
                activeTicketSets.Clear();
                realtimeTicketFallbackLogKey = string.Empty;
                delayedOverlayResetGameId = string.Empty;
                overlaysClearedForEndedGameId = string.Empty;
                ResetRealtimeBonusState(closeBonusPanel: true, previousGameId: previousGameId);
            }

            bool isActiveRoundParticipant = ApplyVisibleTicketSetsForCurrentSnapshotDedicated(currentGame, snapshot);
            realtimePlayerParticipatingInCurrentRound = isActiveRoundParticipant;
            if (startedNewGame)
            {
                SyncRealtimeFinancialsForRoundStart(isActiveRoundParticipant);
            }

            ProcessRealtimeDrawUpdatesDedicated(currentGame, isActiveRoundParticipant);
            RefreshRealtimeCountdownLabel(forceRefresh: true);

            if (!isActiveRoundParticipant)
            {
                ResetRealtimeBonusState(closeBonusPanel: true);
            }

            RenderDedicatedTheme1State(viewRoot, currentGame);
        }
        finally
        {
            NotifyRealtimeControlsStateChanged();
        }
    }
}
