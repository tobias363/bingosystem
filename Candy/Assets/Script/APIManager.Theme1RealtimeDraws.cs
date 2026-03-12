using System.Collections.Generic;
using SimpleJSON;
using UnityEngine;

public partial class APIManager
{
    private void ApplyDrawnNumbers(JSONNode currentGame, bool shouldMarkCards)
    {
        JSONNode drawnNumbers = currentGame["drawnNumbers"];
        if (drawnNumbers == null || drawnNumbers.IsNull || !drawnNumbers.IsArray)
        {
            return;
        }

        NumberGenerator generator = ResolveNumberGenerator();
        bool canMarkCards = shouldMarkCards && generator != null && generator.cardClasses != null;
        bool shouldTrace = ShouldLogRealtimeDrawTrace();

        int previousProcessedDrawCount = Mathf.Max(0, processedDrawCount);
        for (int drawIndex = 0; drawIndex < drawnNumbers.Count; drawIndex++)
        {
            int drawnNumber = drawnNumbers[drawIndex].AsInt;
            bool isValidTheme1Number = GameManager.IsValidTheme1BallNumber(drawnNumber);
            if (canMarkCards && isValidTheme1Number)
            {
                RealtimeTicketSetUtils.MarkDrawnNumberOnCards(generator, drawnNumber);
            }

            if (drawIndex < previousProcessedDrawCount)
            {
                continue;
            }

            if (!isValidTheme1Number)
            {
                PublishRuntimeStatus(
                    $"Ignorerer ugyldig Theme1 draw-nummer {drawnNumber}. Theme1 tillater kun 1-{GameManager.Theme1MaxBallNumber}.",
                    asError: true);
                continue;
            }

            RegisterRealtimeDrawObserved(drawnNumbers.Count, drawnNumber);
            ShowRealtimeDrawBall(drawIndex, drawnNumber);

            if (shouldTrace)
            {
                int markedCells = canMarkCards ? CountMarkedCells(generator) : 0;
                Debug.Log(
                    $"[candy-draw] game={activeGameId} drawIndex={drawIndex + 1} number={drawnNumber} " +
                    $"drawnCount={drawnNumbers.Count} markedCells={markedCells} canMark={canMarkCards}");
                Debug.Log(
                    $"[draw] draw_rendered game={activeGameId} idx={drawIndex + 1} " +
                    $"number={drawnNumber} markedCells={markedCells} canMark={canMarkCards}");
            }

            if (autoMarkDrawnNumbers &&
                shouldMarkCards &&
                RealtimeTicketSetUtils.TicketContainsInAnyTicketSet(activeTicketSets, drawnNumber) &&
                !string.IsNullOrWhiteSpace(activeRoomCode) &&
                !string.IsNullOrWhiteSpace(activePlayerId) &&
                realtimeClient != null &&
                realtimeClient.IsReady)
            {
                realtimeClient.MarkNumber(activeRoomCode, activePlayerId, drawnNumber, null);
            }
        }

        processedDrawCount = drawnNumbers.Count;
    }

    private void ClearRealtimeTicketTransientVisuals()
    {
        NumberGenerator generator = ResolveNumberGenerator();
        if (generator == null || generator.cardClasses == null)
        {
            return;
        }

        for (int cardIndex = 0; cardIndex < generator.cardClasses.Length; cardIndex++)
        {
            CardClass card = generator.cardClasses[cardIndex];
            if (card == null)
            {
                continue;
            }

            EnsureRealtimeCardBindings(card);
            card.selectedPayLineCanBe.Clear();
            card.paylineindex.Clear();

            for (int i = 0; i < card.payLinePattern.Count; i++)
            {
                card.payLinePattern[i] = 0;
            }

            for (int i = 0; i < card.selectionImg.Count; i++)
            {
                SetActiveIfChanged(card.selectionImg[i], false);
            }

            for (int i = 0; i < card.missingPatternImg.Count; i++)
            {
                SetActiveIfChanged(card.missingPatternImg[i], false);
            }

            for (int i = 0; i < card.matchPatternImg.Count; i++)
            {
                SetActiveIfChanged(card.matchPatternImg[i], false);
            }

            if (card.paylineObj != null)
            {
                for (int i = 0; i < card.paylineObj.Count; i++)
                {
                    SetActiveIfChanged(card.paylineObj[i], false);
                }
            }

            if (card.win != null)
            {
                SetActiveIfChanged(card.win.gameObject, false);
            }
        }

        GameManager gameManager = GameManager.instance;
        if (gameManager?.winAmtText != null)
        {
            Theme1PresentationTextUtils.ApplyHudText(gameManager.winAmtText, "0");
        }

        if (gameManager?.displayCardWinPoints == null)
        {
            return;
        }

        for (int i = 0; i < gameManager.displayCardWinPoints.Count; i++)
        {
            if (gameManager.displayCardWinPoints[i] != null)
            {
                SetActiveIfChanged(gameManager.displayCardWinPoints[i].gameObject, false);
            }
        }
    }

    private int CountMarkedCells(NumberGenerator generator)
    {
        if (generator == null || generator.cardClasses == null)
        {
            return 0;
        }

        int total = 0;
        for (int cardIndex = 0; cardIndex < generator.cardClasses.Length; cardIndex++)
        {
            CardClass card = generator.cardClasses[cardIndex];
            if (card == null || card.payLinePattern == null)
            {
                continue;
            }

            for (int cellIndex = 0; cellIndex < card.payLinePattern.Count; cellIndex++)
            {
                if (card.payLinePattern[cellIndex] == 1)
                {
                    total++;
                }
            }
        }

        return total;
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

            if (!GameManager.IsValidTheme1BallNumber(drawnNumber))
            {
                PublishRuntimeStatus(
                    $"Ignorerer ugyldig Theme1 draw-nummer {drawnNumber}. Theme1 tillater kun 1-{GameManager.Theme1MaxBallNumber}.",
                    asError: true);
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
            int normalized = GameManager.NormalizeTheme1BallNumber(drawnNumbersNode[i].AsInt);
            if (normalized > 0)
            {
                drawnNumbers.Add(normalized);
            }
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
}
