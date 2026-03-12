using System;
using System.Collections.Generic;
using System.Globalization;
using SimpleJSON;
using TMPro;
using UnityEngine;

public partial class APIManager
{
    private readonly struct RealtimeNearWinState
    {
        public readonly int PatternIndex;
        public readonly int CardNo;
        public readonly int CellIndex;
        public readonly int MissingNumber;

        public RealtimeNearWinState(int patternIndex, int cardNo, int cellIndex, int missingNumber)
        {
            PatternIndex = patternIndex;
            CardNo = cardNo;
            CellIndex = cellIndex;
            MissingNumber = missingNumber;
        }
    }

    private void RefreshRealtimeWinningPatternVisuals(JSONNode currentGame)
    {
        NumberGenerator generator = ResolveNumberGenerator();
        if (generator == null || generator.cardClasses == null || generator.patternList == null)
        {
            StopRealtimeMatchedPatternVisuals();
            StopRealtimeNearWinBlinking();
            return;
        }

        List<int> activePatternIndexes = GetActivePatternIndexes(generator);
        if (activePatternIndexes.Count == 0)
        {
            generator.ClearPaylineVisuals();
            StopRealtimeMatchedPatternVisuals();
            StopRealtimeNearWinBlinking();
            NumberGenerator.isPrizeMissedByOneCard = false;
            RefreshRealtimeBonusFlow(currentGame, default, null);
            return;
        }

        RealtimeClaimInfo latestClaim = GetLatestValidClaimForCurrentPlayer(currentGame);
        Dictionary<int, HashSet<int>> winningPatternsByCard = ResolveWinningPatternsByCard(
            generator,
            activePatternIndexes,
            latestClaim,
            currentGame);

        LogRealtimeWinningPatternResolution(currentGame, latestClaim, winningPatternsByCard);
        ResolveGameManager()?.SyncRealtimePatternWinnings(winningPatternsByCard);

        SyncRealtimeMatchedPatternVisuals(winningPatternsByCard);

        Dictionary<int, RealtimeNearWinState> activeNearWinStates = new();
        for (int cardNo = 0; cardNo < generator.cardClasses.Length; cardNo++)
        {
            CardClass card = generator.cardClasses[cardNo];
            if (card == null)
            {
                continue;
            }

            HashSet<int> wonPatternIndexes = winningPatternsByCard.TryGetValue(cardNo, out HashSet<int> resolvedWonPatternIndexes)
                ? resolvedWonPatternIndexes
                : null;

            ApplyTicketStateVisualsForCard(
                generator,
                cardNo,
                activePatternIndexes,
                wonPatternIndexes,
                activeNearWinStates);
        }

        SyncRealtimeNearWinBlinking(activeNearWinStates);
        NumberGenerator.isPrizeMissedByOneCard = activeNearWinStates.Count > 0;
        RefreshRealtimeBonusFlow(currentGame, latestClaim, winningPatternsByCard);
    }
    private void RenderDedicatedTheme1State(Theme1GameplayViewRoot viewRoot, JSONNode currentGame)
    {
        Theme1DisplayState renderState = BuildDedicatedTheme1DisplayState(currentGame, viewRoot);
        if (currentGame == null || currentGame.IsNull)
        {
            theme1DisplayPresenter.Render(viewRoot, renderState);
            RegisterDedicatedTheme1RenderMetrics(viewRoot, renderState);
            SyncLegacyTheme1MatchedPaylines(null);
            StopRealtimeMatchedPatternVisuals();
            StopRealtimeNearWinBlinking();
            NumberGenerator.isPrizeMissedByOneCard = false;
            return;
        }

        RealtimeClaimInfo latestClaim = GetLatestValidClaimForCurrentPlayer(currentGame);
        byte[][] patternMasks = CollectPatternMasks();
        Dictionary<int, HashSet<int>> winningPatternsByCard =
            ResolveDedicatedWinningPatternsByCard(renderState, currentGame, latestClaim, patternMasks);
        NumberGenerator generator = ResolveNumberGenerator();
        Dictionary<int, HashSet<int>> legacyWinningPatternsByCard = ResolveWinningPatternsByCard(
            generator,
            GetActivePatternIndexes(generator),
            latestClaim,
            currentGame);
        winningPatternsByCard = MergeWinningPatternsByCard(winningPatternsByCard, legacyWinningPatternsByCard);
        ApplyWinningPatternsToDedicatedState(renderState, winningPatternsByCard, patternMasks);
        GameManager resolvedGameManager = ResolveGameManager();
        resolvedGameManager?.SyncRealtimePatternWinnings(winningPatternsByCard);
        int completedPatternWinnings = ResolveRenderStateCompletedPatternWinnings(renderState);
        if (resolvedGameManager != null && renderState.Hud != null)
        {
            renderState.Hud.CreditLabel = GameManager.FormatWholeNumber(resolvedGameManager.CreditBalance);
            renderState.Hud.WinningsLabel = GameManager.FormatWholeNumber(Mathf.Max(resolvedGameManager.RoundWinnings, completedPatternWinnings));
            renderState.Hud.BetLabel = GameManager.FormatWholeNumber(resolvedGameManager.currentBet);
        }
        else if (renderState.Hud != null)
        {
            renderState.Hud.WinningsLabel = GameManager.FormatWholeNumber(completedPatternWinnings);
        }

        theme1DisplayPresenter.Render(viewRoot, renderState);
        RegisterDedicatedTheme1RenderMetrics(viewRoot, renderState);
        PreserveTheme1RoundDisplayState(renderState);

        Dictionary<int, RealtimeNearWinState> activeNearWinStates = BuildNearWinStates(renderState);
        SyncLegacyTheme1MatchedPaylines(winningPatternsByCard);
        SyncRealtimeMatchedPatternVisuals(winningPatternsByCard);
        SyncRealtimeNearWinBlinking(activeNearWinStates);
        NumberGenerator.isPrizeMissedByOneCard = activeNearWinStates.Count > 0;
        RefreshRealtimeBonusFlow(currentGame, latestClaim, winningPatternsByCard);
    }

}
