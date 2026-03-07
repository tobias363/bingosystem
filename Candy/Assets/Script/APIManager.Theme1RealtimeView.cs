using System;
using System.Collections.Generic;
using SimpleJSON;
using TMPro;
using UnityEngine;

public partial class APIManager
{
    private bool ShouldUseDedicatedTheme1RealtimeView()
    {
        return useRealtimeBackend && theme1RealtimeViewMode != Theme1RealtimeViewMode.LegacyOnly;
    }

    private bool TryResolveDedicatedTheme1GameplayView(out Theme1GameplayViewRoot viewRoot)
    {
        if (!TryResolveTheme1GameplayViewContract(out viewRoot))
        {
            ReportRealtimeRenderMismatch("Theme1GameplayViewRoot mangler eller er ugyldig. Faller tilbake til legacy-render.", asError: true);
            return false;
        }

        return true;
    }

    private void HandleRealtimeRoomUpdateDedicated(JSONNode snapshot, Theme1GameplayViewRoot viewRoot)
    {
        if (snapshot == null || snapshot.IsNull)
        {
            return;
        }

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
            RenderDedicatedTheme1State(viewRoot, currentGame: null);
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

        if (!string.Equals(activeGameId, gameId, StringComparison.Ordinal))
        {
            string previousGameId = activeGameId;
            activeGameId = gameId;
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
        ProcessRealtimeDrawUpdatesDedicated(currentGame, isActiveRoundParticipant);
        RefreshRealtimeCountdownLabel(forceRefresh: true);

        if (isActiveRoundParticipant)
        {
            RenderDedicatedTheme1State(viewRoot, currentGame);
        }
        else
        {
            ResetRealtimeBonusState(closeBonusPanel: true);
            RenderDedicatedTheme1State(viewRoot, currentGame: null);
        }
    }

    private bool ApplyVisibleTicketSetsForCurrentSnapshotDedicated(JSONNode currentGame, JSONNode snapshot)
    {
        if (TryApplyCurrentRoundTicketsDedicated(currentGame, snapshot))
        {
            return true;
        }

        if (TryApplyPreRoundTicketSetsFromSnapshotDedicated(snapshot))
        {
            return false;
        }

        if (TryApplyCachedStableTicketsDedicated())
        {
            return false;
        }

        activeTicketSets.Clear();
        cachedStableTicketSets.Clear();
        realtimeTicketFallbackLogKey = string.Empty;
        return false;
    }

    private bool TryApplyCurrentRoundTicketsDedicated(JSONNode currentGame, JSONNode snapshot)
    {
        return TryApplyTicketSetsFromNodeDedicated(currentGame?["tickets"], snapshot, allowFallbackTicketSource: true);
    }

    private bool TryApplyPreRoundTicketSetsFromSnapshotDedicated(JSONNode snapshot)
    {
        if (snapshot == null || snapshot.IsNull)
        {
            return false;
        }

        return TryApplyTicketSetsFromNodeDedicated(snapshot["preRoundTickets"], snapshot, allowFallbackTicketSource: true);
    }

    private bool TryApplyTicketSetsFromNodeDedicated(JSONNode tickets, JSONNode snapshot, bool allowFallbackTicketSource)
    {
        if (tickets == null || tickets.IsNull)
        {
            return false;
        }

        string ticketSourcePlayerId = ResolveRealtimePlayerIdFromSnapshot(snapshot, syncField: true);
        JSONNode myTicketsNode = null;
        if (!string.IsNullOrWhiteSpace(activePlayerId))
        {
            myTicketsNode = tickets[activePlayerId];
        }

        if ((myTicketsNode == null || myTicketsNode.IsNull) &&
            !string.IsNullOrWhiteSpace(ticketSourcePlayerId) &&
            !string.Equals(ticketSourcePlayerId, activePlayerId, StringComparison.Ordinal))
        {
            myTicketsNode = tickets[ticketSourcePlayerId];
        }

        bool usedFallbackTicketSource = false;
        if (allowFallbackTicketSource &&
            (myTicketsNode == null || myTicketsNode.IsNull) &&
            string.IsNullOrWhiteSpace(ticketSourcePlayerId))
        {
            usedFallbackTicketSource = TryResolveFallbackTicketSource(
                tickets,
                out myTicketsNode,
                out ticketSourcePlayerId);
        }

        if (myTicketsNode == null || myTicketsNode.IsNull)
        {
            return false;
        }

        List<List<int>> ticketSets = RealtimeTicketSetUtils.ExtractTicketSets(myTicketsNode);
        if (ticketSets.Count == 0)
        {
            return false;
        }

        if (usedFallbackTicketSource)
        {
            LogTicketSourceFallbackOnce(ticketSourcePlayerId, ticketSets.Count);
        }

        activeTicketSets = RealtimeTicketSetUtils.CloneTicketSets(ticketSets);
        cachedStableTicketSets = RealtimeTicketSetUtils.CloneTicketSets(ticketSets);
        return true;
    }

    private bool TryApplyCachedStableTicketsDedicated()
    {
        if (!preserveTicketNumbersOnTransientSnapshotGaps ||
            cachedStableTicketSets == null ||
            cachedStableTicketSets.Count == 0)
        {
            TryRequestRealtimeTicketStateResync();
            return false;
        }

        activeTicketSets = RealtimeTicketSetUtils.CloneTicketSets(cachedStableTicketSets);
        PublishRuntimeStatus(
            "Bruker siste gyldige preround-bonger fordi snapshotet midlertidig manglet preRoundTickets.",
            asError: false);
        TryRequestRealtimeTicketStateResync();
        return true;
    }

    private void ProcessRealtimeDrawUpdatesDedicated(JSONNode currentGame, bool shouldAutoMarkCards)
    {
        JSONNode drawnNumbersNode = currentGame?["drawnNumbers"];
        if (drawnNumbersNode == null || drawnNumbersNode.IsNull || !drawnNumbersNode.IsArray)
        {
            processedDrawCount = 0;
            return;
        }

        bool shouldTrace = ShouldLogRealtimeDrawTrace();
        int previousProcessedDrawCount = Mathf.Max(0, processedDrawCount);
        for (int drawIndex = 0; drawIndex < drawnNumbersNode.Count; drawIndex++)
        {
            int drawnNumber = drawnNumbersNode[drawIndex].AsInt;
            if (drawIndex < previousProcessedDrawCount)
            {
                continue;
            }

            RegisterRealtimeDrawObserved(drawnNumbersNode.Count, drawnNumber);

            if (shouldTrace)
            {
                int markedCells = CountMarkedCellsForDedicatedDrawState(drawnNumbersNode, drawIndex + 1);
                Debug.Log(
                    $"[candy-draw] game={activeGameId} drawIndex={drawIndex + 1} number={drawnNumber} " +
                    $"drawnCount={drawnNumbersNode.Count} markedCells={markedCells} canMark={shouldAutoMarkCards}");
                Debug.Log(
                    $"[draw] draw_rendered game={activeGameId} idx={drawIndex + 1} " +
                    $"number={drawnNumber} markedCells={markedCells} canMark={shouldAutoMarkCards}");
            }

            if (autoMarkDrawnNumbers &&
                shouldAutoMarkCards &&
                RealtimeTicketSetUtils.TicketContainsInAnyTicketSet(activeTicketSets, drawnNumber) &&
                !string.IsNullOrWhiteSpace(activeRoomCode) &&
                !string.IsNullOrWhiteSpace(activePlayerId) &&
                realtimeClient != null &&
                realtimeClient.IsReady)
            {
                realtimeClient.MarkNumber(activeRoomCode, activePlayerId, drawnNumber, null);
            }
        }

        processedDrawCount = drawnNumbersNode.Count;
    }

    private int CountMarkedCellsForDedicatedDrawState(JSONNode drawnNumbersNode, int drawCount)
    {
        if (drawnNumbersNode == null || drawnNumbersNode.IsNull || !drawnNumbersNode.IsArray || drawCount <= 0)
        {
            return 0;
        }

        HashSet<int> drawnNumbers = new HashSet<int>();
        int count = Mathf.Min(drawCount, drawnNumbersNode.Count);
        for (int i = 0; i < count; i++)
        {
            drawnNumbers.Add(drawnNumbersNode[i].AsInt);
        }

        if (activeTicketSets == null || activeTicketSets.Count == 0)
        {
            return 0;
        }

        int markedCells = 0;
        for (int ticketIndex = 0; ticketIndex < activeTicketSets.Count; ticketIndex++)
        {
            List<int> ticket = activeTicketSets[ticketIndex];
            if (ticket == null)
            {
                continue;
            }

            for (int cellIndex = 0; cellIndex < ticket.Count; cellIndex++)
            {
                int cellNumber = ticket[cellIndex];
                if (cellNumber > 0 && drawnNumbers.Contains(cellNumber))
                {
                    markedCells += 1;
                }
            }
        }

        return markedCells;
    }

    private void RenderDedicatedTheme1State(Theme1GameplayViewRoot viewRoot, JSONNode currentGame)
    {
        Theme1DisplayState renderState = BuildDedicatedTheme1DisplayState(currentGame, viewRoot);
        theme1DisplayPresenter.Render(viewRoot, renderState);
        RegisterDedicatedTheme1RenderMetrics(viewRoot, renderState);

        if (currentGame != null && !currentGame.IsNull)
        {
            Dictionary<int, HashSet<int>> winningPatternsByCard = BuildWinningPatternsByCard(renderState);
            RefreshRealtimeBonusFlow(currentGame, GetLatestValidClaimForCurrentPlayer(currentGame), winningPatternsByCard);
        }
    }

    private Theme1DisplayState BuildDedicatedTheme1DisplayState(JSONNode currentGame, Theme1GameplayViewRoot viewRoot)
    {
        Theme1StateBuildInput input = new Theme1StateBuildInput
        {
            GameId = currentGame?["id"] ?? activeGameId,
            CardSlotCount = viewRoot.Cards != null ? viewRoot.Cards.Length : Mathf.Max(1, GetCardSlotsCount()),
            VisibleCardCount = GetRealtimeVisibleCardCount(),
            CurrentTicketPage = currentTicketPage,
            DuplicateSingleTicketAcrossCards = duplicateTicketAcrossAllCards,
            BallSlotCount = viewRoot.BallRack != null && viewRoot.BallRack.Slots != null ? viewRoot.BallRack.Slots.Length : 30,
            DrawnNumbers = ExtractDrawnNumbers(currentGame),
            TicketSets = CloneTicketSetsForBuilder(activeTicketSets),
            ActivePatternIndexes = CollectActivePatternIndexes(),
            PatternMasks = CollectPatternMasks(),
            CardHeaderLabels = CollectCardHeaderLabels(viewRoot),
            CardBetLabels = CollectCardBetLabels(viewRoot),
            CardWinLabels = CollectCardWinLabels(viewRoot),
            TopperPrizeLabels = CollectTopperPrizeLabels(viewRoot),
            TopperPayoutAmounts = CollectTopperPayoutAmounts(viewRoot),
            CountdownLabel = ReadText(viewRoot.HudBar?.CountdownText),
            PlayerCountLabel = ReadText(viewRoot.HudBar?.RoomPlayerCountText),
            CreditLabel = ResolveDedicatedHudValue(viewRoot.HudBar?.CreditText, GameManager.instance != null ? GameManager.instance.CreditBalance.ToString() : "0"),
            WinningsLabel = ResolveDedicatedHudValue(viewRoot.HudBar?.WinningsText, GameManager.instance != null ? GameManager.instance.RoundWinnings.ToString() : "0"),
            BetLabel = ResolveDedicatedHudValue(viewRoot.HudBar?.BetText, GameManager.instance != null ? GameManager.instance.currentBet.ToString() : "0")
        };

        return theme1RealtimeStateAdapter.Build(input);
    }

    private static string ResolveDedicatedHudValue(TMP_Text target, string fallback)
    {
        string value = ReadText(target);
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        return fallback ?? string.Empty;
    }

    private int[] CollectActivePatternIndexes()
    {
        NumberGenerator generator = ResolveNumberGenerator();
        List<int> activePatternIndexes = GetActivePatternIndexes(generator);
        return activePatternIndexes.ToArray();
    }

    private byte[][] CollectPatternMasks()
    {
        NumberGenerator generator = ResolveNumberGenerator();
        if (generator == null || generator.patternList == null)
        {
            return Array.Empty<byte[]>();
        }

        byte[][] masks = new byte[generator.patternList.Count][];
        for (int i = 0; i < masks.Length; i++)
        {
            List<byte> pattern = generator.patternList[i] != null ? generator.patternList[i].pattern : null;
            masks[i] = pattern != null ? pattern.ToArray() : Array.Empty<byte>();
        }

        return masks;
    }

    private static int[][] CloneTicketSetsForBuilder(List<List<int>> ticketSets)
    {
        if (ticketSets == null || ticketSets.Count == 0)
        {
            return Array.Empty<int[]>();
        }

        int[][] clone = new int[ticketSets.Count][];
        for (int i = 0; i < ticketSets.Count; i++)
        {
            clone[i] = RealtimeTicketSetUtils.NormalizeTicketNumbers(ticketSets[i]).ToArray();
        }

        return clone;
    }

    private int[] ExtractDrawnNumbers(JSONNode currentGame)
    {
        JSONNode drawnNumbersNode = currentGame?["drawnNumbers"];
        if (drawnNumbersNode == null || drawnNumbersNode.IsNull || !drawnNumbersNode.IsArray)
        {
            return Array.Empty<int>();
        }

        int[] values = new int[drawnNumbersNode.Count];
        for (int i = 0; i < drawnNumbersNode.Count; i++)
        {
            values[i] = drawnNumbersNode[i].AsInt;
        }

        return values;
    }

    private string[] CollectCardHeaderLabels(Theme1GameplayViewRoot viewRoot)
    {
        int cardCount = viewRoot.Cards != null ? viewRoot.Cards.Length : 0;
        string[] labels = new string[cardCount];
        for (int i = 0; i < cardCount; i++)
        {
            labels[i] = ReadText(viewRoot.Cards[i]?.HeaderLabel);
            if (string.IsNullOrWhiteSpace(labels[i]))
            {
                labels[i] = $"Card -{i + 1}";
            }
        }

        return labels;
    }

    private string[] CollectCardBetLabels(Theme1GameplayViewRoot viewRoot)
    {
        int cardCount = viewRoot.Cards != null ? viewRoot.Cards.Length : 0;
        string[] labels = new string[cardCount];
        for (int i = 0; i < cardCount; i++)
        {
            labels[i] = ReadText(viewRoot.Cards[i]?.BetLabel);
            if (string.IsNullOrWhiteSpace(labels[i]))
            {
                labels[i] = "BET - 0";
            }
        }

        return labels;
    }

    private string[] CollectCardWinLabels(Theme1GameplayViewRoot viewRoot)
    {
        int cardCount = viewRoot.Cards != null ? viewRoot.Cards.Length : 0;
        string[] labels = new string[cardCount];
        for (int i = 0; i < cardCount; i++)
        {
            labels[i] = ReadText(viewRoot.Cards[i]?.WinLabel);
            if (string.IsNullOrWhiteSpace(labels[i]))
            {
                labels[i] = "WIN - 0";
            }
        }

        return labels;
    }

    private string[] CollectTopperPrizeLabels(Theme1GameplayViewRoot viewRoot)
    {
        int slotCount = viewRoot.TopperStrip != null && viewRoot.TopperStrip.Slots != null ? viewRoot.TopperStrip.Slots.Length : 0;
        string[] labels = new string[slotCount];
        GameManager gameManager = GameManager.instance;
        for (int i = 0; i < slotCount; i++)
        {
            if (gameManager != null && gameManager.TryGetFormattedPayoutLabel(i, out string runtimeLabel))
            {
                labels[i] = runtimeLabel;
            }
            else
            {
                labels[i] = ReadText(viewRoot.TopperStrip.Slots[i]?.PrizeLabel);
            }
        }

        return labels;
    }

    private int[] CollectTopperPayoutAmounts(Theme1GameplayViewRoot viewRoot)
    {
        int slotCount = viewRoot.TopperStrip != null && viewRoot.TopperStrip.Slots != null ? viewRoot.TopperStrip.Slots.Length : 0;
        int[] payoutAmounts = new int[slotCount];
        GameManager gameManager = GameManager.instance;
        for (int i = 0; i < slotCount; i++)
        {
            payoutAmounts[i] = gameManager != null ? gameManager.GetPayoutForPatternSlot(i) : 0;
        }

        return payoutAmounts;
    }

    private void RegisterDedicatedTheme1RenderMetrics(Theme1GameplayViewRoot viewRoot, Theme1DisplayState renderState)
    {
        int renderedCardCellCount = 0;
        for (int cardIndex = 0; viewRoot.Cards != null && cardIndex < viewRoot.Cards.Length; cardIndex++)
        {
            Theme1CardGridView card = viewRoot.Cards[cardIndex];
            for (int cellIndex = 0; card?.Cells != null && cellIndex < card.Cells.Length; cellIndex++)
            {
                TextMeshProUGUI label = card.Cells[cellIndex]?.NumberLabel;
                if (label == null)
                {
                    continue;
                }

                renderedCardCellCount += 1;
                if (renderedCardCellCount == 1)
                {
                    RegisterRealtimeCardTarget(label);
                }
            }
        }

        RegisterRealtimeTicketRender(activeTicketSets != null ? activeTicketSets.Count : 0, renderedCardCellCount);

        Theme1BallRackView ballRackView = viewRoot.BallRack;
        if (renderState?.BallRack == null || ballRackView == null)
        {
            return;
        }

        int lastVisibleSlot = -1;
        for (int slotIndex = 0; renderState.BallRack.Slots != null && slotIndex < renderState.BallRack.Slots.Length; slotIndex++)
        {
            if (renderState.BallRack.Slots[slotIndex].IsVisible)
            {
                lastVisibleSlot = slotIndex;
            }
        }

        if (lastVisibleSlot < 0 || renderState.BallRack.Slots == null || lastVisibleSlot >= renderState.BallRack.Slots.Length)
        {
            return;
        }

        int renderedTextTargetCount = ballRackView.Slots != null ? ballRackView.Slots.Length : 0;
        Theme1BallSlotView slotView = ballRackView.Slots != null && lastVisibleSlot < ballRackView.Slots.Length
            ? ballRackView.Slots[lastVisibleSlot]
            : null;
        int drawnNumber = int.TryParse(renderState.BallRack.Slots[lastVisibleSlot].NumberLabel, out int parsedDrawnNumber)
            ? parsedDrawnNumber
            : 0;
        RegisterRealtimeBallRendered(
            drawnNumber,
            lastVisibleSlot,
            renderedTextTargetCount,
            slotView?.NumberLabel,
            ballRackView.BigBallText);
    }

    private static Dictionary<int, HashSet<int>> BuildWinningPatternsByCard(Theme1DisplayState renderState)
    {
        Dictionary<int, HashSet<int>> winningPatterns = new Dictionary<int, HashSet<int>>();
        if (renderState?.Cards == null)
        {
            return winningPatterns;
        }

        for (int cardIndex = 0; cardIndex < renderState.Cards.Length; cardIndex++)
        {
            Theme1CardRenderState card = renderState.Cards[cardIndex];
            HashSet<int> matched = new HashSet<int>();
            if (card?.PaylinesActive != null)
            {
                for (int paylineIndex = 0; paylineIndex < card.PaylinesActive.Length; paylineIndex++)
                {
                    if (card.PaylinesActive[paylineIndex])
                    {
                        matched.Add(paylineIndex);
                    }
                }
            }

            winningPatterns[cardIndex] = matched;
        }

        return winningPatterns;
    }

    private static string ReadText(TMP_Text label)
    {
        return label != null ? (label.text ?? string.Empty) : string.Empty;
    }
}
