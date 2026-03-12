using System;
using System.Collections.Generic;
using UnityEngine;

public sealed class Theme1StateBuilder
{
    private readonly Theme1PatternEngine patternEngine = new Theme1PatternEngine();

    public Theme1RoundRenderState Build(Theme1StateBuildInput input)
    {
        int cardCount = Mathf.Max(0, input?.CardSlotCount ?? 0);
        int topperCount = Mathf.Max(0, input?.TopperPrizeLabels?.Length ?? 0);
        Theme1RoundRenderState state = Theme1RoundRenderState.CreateEmpty(
            cardCount,
            Mathf.Max(0, input?.BallSlotCount ?? 0),
            topperCount);
        if (input == null)
        {
            return state;
        }

        state.GameId = input.GameId ?? string.Empty;
        int[] validDrawnNumbers = ExtractValidDrawnNumbers(input.DrawnNumbers);
        Dictionary<int, int> drawOrderByNumber = BuildDrawOrderLookup(validDrawnNumbers);
        int[][] visibleTickets = ResolveVisibleTickets(input);
        Theme1PatternEngine.Evaluation patternEvaluation = patternEngine.Evaluate(
            visibleTickets,
            validDrawnNumbers,
            input.ActivePatternIndexes,
            input.PatternMasks,
            input.TopperPayoutAmounts,
            topperCount);

        for (int cardIndex = 0; cardIndex < state.Cards.Length; cardIndex++)
        {
            Theme1CardRenderState cardState = Theme1CardRenderState.CreateEmpty();
            cardState.PaylinesActive = new bool[input.PatternMasks != null ? input.PatternMasks.Length : 0];

            int[] ticket = cardIndex < visibleTickets.Length ? visibleTickets[cardIndex] : null;
            Theme1PatternEngine.CardResult patternState = patternEvaluation.Cards != null && cardIndex < patternEvaluation.Cards.Length
                ? patternEvaluation.Cards[cardIndex]
                : null;
            HashSet<int> matchedPatterns = patternState?.MatchedPatternIndexes;
            int[] matchedPatternIndexes = ToSortedArray(matchedPatterns);
            int preferredNearPatternIndex = GetValue(input.PreferredNearPatternIndexesByCard, cardIndex, -1);
            Theme1CompletedPatternRenderState[] completedPatterns = BuildCompletedPatternStates(
                matchedPatternIndexes,
                ticket,
                drawOrderByNumber,
                input.PatternMasks,
                input.TopperPayoutAmounts,
                topperCount);
            Theme1NearPatternRenderState activeNearPattern = BuildActiveNearPatternState(
                cardIndex,
                patternState,
                ticket,
                preferredNearPatternIndex,
                input.PatternMasks,
                input.TopperPayoutAmounts,
                topperCount);
            int cardWinAmount = ResolveCardWinAmount(matchedPatterns, input.TopperPayoutAmounts);
            cardState.HeaderLabel = GetNonEmptyString(
                input.CardHeaderLabels,
                cardIndex,
                GameManager.FormatTheme1CardHeaderLabel(cardIndex));
            cardState.BetLabel = GetNonEmptyString(
                input.CardBetLabels,
                cardIndex,
                GameManager.FormatTheme1CardStakeLabel(0));
            cardState.WinLabel = Theme1CardLabelPolicy.ResolveWinLabel(
                gameManager: null,
                cardWinAmount,
                GetNonEmptyString(input.CardWinLabels, cardIndex, string.Empty),
                out bool showWinLabel);
            cardState.ShowWinLabel = showWinLabel;

            for (int cellIndex = 0; cellIndex < cardState.Cells.Length; cellIndex++)
            {
                int number = ticket != null && cellIndex < ticket.Length
                    ? NormalizeTheme1Number(ticket[cellIndex])
                    : 0;
                bool isSelected = number > 0 && Array.IndexOf(validDrawnNumbers, number) >= 0;
                bool isMatchedByCompletedPattern = IsCellMatchedByCompletedPatterns(cellIndex, completedPatterns);
                bool hasNearWinsForCell = TryGetCellNearWins(patternState, cellIndex, out List<Theme1PatternEngine.NearWinResult> nearWins);
                bool isNearTargetCell = activeNearPattern != null && activeNearPattern.TargetCellIndex == cellIndex;
                bool isMatchedByActiveNearPattern = IsCellMatchedByActiveNearPattern(cellIndex, activeNearPattern);
                int[] completedPatternIndexes = ExtractCompletedPatternIndexes(completedPatterns, cellIndex);
                int[] nearWinPatternIndexes = ExtractNearWinPatternIndexes(nearWins);
                int missingNumber = isNearTargetCell
                    ? activeNearPattern.TargetNumber
                    : ResolveMissingNumber(number, nearWins);
                Theme1CellPrizeLabelRenderState[] prizeLabels = BuildCellPrizeLabels(
                    completedPatterns,
                    activeNearPattern,
                    cellIndex);
                bool isPrizeCell = HasCompletedPrizeLabel(completedPatterns, cellIndex);

                Theme1CardCellVisualState visualState = ResolveCellVisualState(
                    isPrizeCell,
                    isNearTargetCell,
                    isMatchedByCompletedPattern,
                    isMatchedByActiveNearPattern);

                cardState.Cells[cellIndex] = new Theme1CardCellRenderState(
                    number > 0 ? number.ToString() : "-",
                    isSelected,
                    isNearTargetCell,
                    isMatchedByCompletedPattern,
                    isNearTargetCell && activeNearPattern != null
                        ? activeNearPattern.RawPatternIndex
                        : (nearWinPatternIndexes.Length > 0 ? nearWinPatternIndexes[0] : -1),
                    missingNumber,
                    isNearTargetCell && activeNearPattern != null
                        ? new[] { activeNearPattern.RawPatternIndex }
                        : (hasNearWinsForCell ? nearWinPatternIndexes : Array.Empty<int>()),
                    visualState,
                    isPrizeCell,
                    isNearTargetCell,
                    prizeLabels.Length > 0 ? prizeLabels[0].Text : string.Empty,
                    prizeLabels.Length > 0 ? prizeLabels[0].Anchor : Theme1WinLabelAnchor.BottomCenter,
                    completedPatternIndexes,
                    prizeLabels);
            }

            for (int patternListIndex = 0; patternListIndex < cardState.PaylinesActive.Length; patternListIndex++)
            {
                cardState.PaylinesActive[patternListIndex] =
                    matchedPatterns != null && matchedPatterns.Contains(patternListIndex);
            }

            cardState.MatchedPatternIndexes = matchedPatternIndexes;
            cardState.CompletedPatterns = completedPatterns;
            cardState.ActiveNearPattern = activeNearPattern;

            state.Cards[cardIndex] = cardState;
        }

        PopulateBallRack(state.BallRack, validDrawnNumbers, input.BallSlotCount);
        PopulateHud(state.Hud, input);
        PopulateTopper(state.Topper, input, patternEvaluation);
        return state;
    }

    private static bool TryGetCellNearWins(
        Theme1PatternEngine.CardResult patternState,
        int cellIndex,
        out List<Theme1PatternEngine.NearWinResult> nearWins)
    {
        nearWins = null;
        return patternState != null &&
               patternState.NearWinsByCell != null &&
               patternState.NearWinsByCell.TryGetValue(cellIndex, out nearWins) &&
               nearWins != null &&
               nearWins.Count > 0;
    }

    private static int[] ExtractNearWinPatternIndexes(List<Theme1PatternEngine.NearWinResult> nearWins)
    {
        if (nearWins == null || nearWins.Count == 0)
        {
            return Array.Empty<int>();
        }

        HashSet<int> unique = new HashSet<int>();
        for (int i = 0; i < nearWins.Count; i++)
        {
            unique.Add(nearWins[i].RawPatternIndex);
        }

        int[] values = new int[unique.Count];
        unique.CopyTo(values);
        Array.Sort(values);
        return values;
    }

    private static int ResolveMissingNumber(int fallbackNumber, List<Theme1PatternEngine.NearWinResult> nearWins)
    {
        if (nearWins == null || nearWins.Count == 0)
        {
            return fallbackNumber;
        }

        for (int i = 0; i < nearWins.Count; i++)
        {
            if (nearWins[i].MissingNumber > 0)
            {
                return nearWins[i].MissingNumber;
            }
        }

        return fallbackNumber;
    }

    private static int ResolveCardWinAmount(IReadOnlyCollection<int> matchedPatterns, IReadOnlyList<int> payoutAmounts)
    {
        if (matchedPatterns == null || matchedPatterns.Count == 0 || payoutAmounts == null || payoutAmounts.Count == 0)
        {
            return 0;
        }

        int total = 0;
        foreach (int rawPatternIndex in matchedPatterns)
        {
            int slotIndex = GameManager.ResolvePayoutSlotIndex(rawPatternIndex, payoutAmounts.Count);
            if (slotIndex >= 0 && slotIndex < payoutAmounts.Count)
            {
                total += Mathf.Max(0, payoutAmounts[slotIndex]);
            }
        }

        return total;
    }

    private static Theme1CompletedPatternRenderState[] BuildCompletedPatternStates(
        IReadOnlyList<int> matchedPatternIndexes,
        IReadOnlyList<int> ticket,
        IReadOnlyDictionary<int, int> drawOrderByNumber,
        IReadOnlyList<byte[]> patternMasks,
        IReadOnlyList<int> payoutAmounts,
        int topperCount)
    {
        if (matchedPatternIndexes == null || matchedPatternIndexes.Count == 0)
        {
            return Array.Empty<Theme1CompletedPatternRenderState>();
        }

        List<Theme1CompletedPatternRenderState> patterns = new List<Theme1CompletedPatternRenderState>(matchedPatternIndexes.Count);
        for (int i = 0; i < matchedPatternIndexes.Count; i++)
        {
            int rawPatternIndex = matchedPatternIndexes[i];
            int[] cellIndices = ExtractPatternCells(patternMasks, rawPatternIndex);
            if (cellIndices.Length == 0)
            {
                continue;
            }

            int slotIndex = ResolvePatternSlotIndex(rawPatternIndex, topperCount);
            int prizeAmount = ResolvePatternPrizeAmount(rawPatternIndex, payoutAmounts, topperCount);
            int triggerCellIndex = ResolveTriggerCellIndex(ticket, cellIndices, drawOrderByNumber);
            patterns.Add(new Theme1CompletedPatternRenderState
            {
                RawPatternIndex = rawPatternIndex,
                SlotIndex = slotIndex,
                CellIndices = cellIndices,
                TriggerCellIndex = triggerCellIndex,
                TriggerNumber = ResolveCellNumber(ticket, triggerCellIndex),
                PrizeAmountKr = prizeAmount,
                PrizeLabel = prizeAmount > 0 ? GameManager.FormatKrAmount(prizeAmount) : string.Empty,
                PrizeAnchor = ResolvePrizeAnchor(triggerCellIndex),
                OverlayKind = ResolveOverlayKind(rawPatternIndex, cellIndices)
            });
        }

        patterns.Sort((left, right) =>
        {
            int leftDrawOrder = ResolveTriggerDrawOrder(left, ticket, drawOrderByNumber);
            int rightDrawOrder = ResolveTriggerDrawOrder(right, ticket, drawOrderByNumber);
            int drawOrderCompare = leftDrawOrder.CompareTo(rightDrawOrder);
            return drawOrderCompare != 0
                ? drawOrderCompare
                : left.RawPatternIndex.CompareTo(right.RawPatternIndex);
        });

        return patterns.ToArray();
    }

    private static Theme1NearPatternRenderState BuildActiveNearPatternState(
        int cardIndex,
        Theme1PatternEngine.CardResult cardResult,
        IReadOnlyList<int> ticket,
        int preferredRawPatternIndex,
        IReadOnlyList<byte[]> patternMasks,
        IReadOnlyList<int> payoutAmounts,
        int topperCount)
    {
        if (cardResult?.NearWins == null || cardResult.NearWins.Count == 0)
        {
            return null;
        }

        Theme1PatternEngine.NearWinResult? preferredCandidate = null;
        Theme1PatternEngine.NearWinResult? fallbackCandidate = null;

        for (int i = 0; i < cardResult.NearWins.Count; i++)
        {
            Theme1PatternEngine.NearWinResult candidate = cardResult.NearWins[i];
            if (candidate.CardIndex != cardIndex)
            {
                continue;
            }

            if (candidate.RawPatternIndex == preferredRawPatternIndex)
            {
                preferredCandidate = candidate;
                break;
            }

            if (!fallbackCandidate.HasValue ||
                candidate.PayoutAmount > fallbackCandidate.Value.PayoutAmount ||
                (candidate.PayoutAmount == fallbackCandidate.Value.PayoutAmount &&
                 candidate.RawPatternIndex < fallbackCandidate.Value.RawPatternIndex))
            {
                fallbackCandidate = candidate;
            }
        }

        Theme1PatternEngine.NearWinResult selected = preferredCandidate ?? fallbackCandidate ?? default(Theme1PatternEngine.NearWinResult);
        if (selected.RawPatternIndex < 0)
        {
            return null;
        }

        int[] cellIndices = ExtractPatternCells(patternMasks, selected.RawPatternIndex);
        if (cellIndices.Length == 0)
        {
            return null;
        }

        int[] matchedCellIndices = ExtractMatchedCellIndices(cellIndices, selected.CellIndex);
        int prizeAmount = selected.PayoutAmount > 0
            ? selected.PayoutAmount
            : ResolvePatternPrizeAmount(selected.RawPatternIndex, payoutAmounts, topperCount);
        return new Theme1NearPatternRenderState
        {
            RawPatternIndex = selected.RawPatternIndex,
            SlotIndex = ResolvePatternSlotIndex(selected.RawPatternIndex, topperCount),
            CellIndices = cellIndices,
            MatchedCellIndices = matchedCellIndices,
            TargetCellIndex = selected.CellIndex,
            TargetNumber = selected.MissingNumber > 0
                ? selected.MissingNumber
                : ResolveCellNumber(ticket, selected.CellIndex),
            PrizeAmountKr = prizeAmount,
            PrizeLabel = prizeAmount > 0 ? GameManager.FormatKrAmount(prizeAmount) : string.Empty,
            PrizeAnchor = ResolvePrizeAnchor(selected.CellIndex),
            OverlayKind = ResolveOverlayKind(selected.RawPatternIndex, cellIndices)
        };
    }

    private static int[] ExtractPatternCells(IReadOnlyList<byte[]> patternMasks, int rawPatternIndex)
    {
        if (patternMasks == null || rawPatternIndex < 0 || rawPatternIndex >= patternMasks.Count)
        {
            return Array.Empty<int>();
        }

        byte[] mask = patternMasks[rawPatternIndex];
        if (mask == null || mask.Length == 0)
        {
            return Array.Empty<int>();
        }

        List<int> values = new List<int>(mask.Length);
        for (int cellIndex = 0; cellIndex < mask.Length; cellIndex++)
        {
            if (mask[cellIndex] == 1)
            {
                values.Add(cellIndex);
            }
        }

        return values.ToArray();
    }

    private static int ResolvePatternSlotIndex(int rawPatternIndex, int topperCount)
    {
        return GameManager.ResolvePayoutSlotIndex(rawPatternIndex, topperCount);
    }

    private static int ResolvePatternPrizeAmount(int rawPatternIndex, IReadOnlyList<int> payoutAmounts, int topperCount)
    {
        if (payoutAmounts == null || payoutAmounts.Count == 0)
        {
            return 0;
        }

        int slotIndex = ResolvePatternSlotIndex(rawPatternIndex, topperCount);
        return slotIndex >= 0 && slotIndex < payoutAmounts.Count
            ? Mathf.Max(0, payoutAmounts[slotIndex])
            : 0;
    }

    private static int ResolveTriggerCellIndex(
        IReadOnlyList<int> ticket,
        IReadOnlyList<int> cellIndices,
        IReadOnlyDictionary<int, int> drawOrderByNumber)
    {
        int triggerCellIndex = cellIndices != null && cellIndices.Count > 0 ? cellIndices[0] : -1;
        int bestDrawOrder = int.MinValue;

        if (ticket == null || cellIndices == null || drawOrderByNumber == null)
        {
            return triggerCellIndex;
        }

        for (int i = 0; i < cellIndices.Count; i++)
        {
            int cellIndex = cellIndices[i];
            int number = ResolveCellNumber(ticket, cellIndex);
            if (number <= 0 || !drawOrderByNumber.TryGetValue(number, out int drawOrder))
            {
                continue;
            }

            if (drawOrder > bestDrawOrder)
            {
                bestDrawOrder = drawOrder;
                triggerCellIndex = cellIndex;
            }
        }

        return triggerCellIndex;
    }

    private static int ResolveTriggerDrawOrder(
        Theme1CompletedPatternRenderState pattern,
        IReadOnlyList<int> ticket,
        IReadOnlyDictionary<int, int> drawOrderByNumber)
    {
        if (pattern == null || ticket == null || drawOrderByNumber == null)
        {
            return int.MaxValue;
        }

        int triggerNumber = ResolveCellNumber(ticket, pattern.TriggerCellIndex);
        return triggerNumber > 0 && drawOrderByNumber.TryGetValue(triggerNumber, out int drawOrder)
            ? drawOrder
            : int.MaxValue;
    }

    private static int ResolveCellNumber(IReadOnlyList<int> ticket, int cellIndex)
    {
        return ticket != null && cellIndex >= 0 && cellIndex < ticket.Count
            ? NormalizeTheme1Number(ticket[cellIndex])
            : 0;
    }

    private static Dictionary<int, int> BuildDrawOrderLookup(IReadOnlyList<int> drawnNumbers)
    {
        Dictionary<int, int> lookup = new Dictionary<int, int>();
        if (drawnNumbers == null)
        {
            return lookup;
        }

        for (int drawIndex = 0; drawIndex < drawnNumbers.Count; drawIndex++)
        {
            int number = NormalizeTheme1Number(drawnNumbers[drawIndex]);
            if (number > 0)
            {
                lookup[number] = drawIndex;
            }
        }

        return lookup;
    }

    private static int[] ExtractMatchedCellIndices(IReadOnlyList<int> cellIndices, int targetCellIndex)
    {
        if (cellIndices == null || cellIndices.Count == 0)
        {
            return Array.Empty<int>();
        }

        List<int> values = new List<int>(cellIndices.Count);
        for (int i = 0; i < cellIndices.Count; i++)
        {
            if (cellIndices[i] != targetCellIndex)
            {
                values.Add(cellIndices[i]);
            }
        }

        return values.ToArray();
    }

    private static bool IsCellMatchedByCompletedPatterns(int cellIndex, IReadOnlyList<Theme1CompletedPatternRenderState> completedPatterns)
    {
        if (completedPatterns == null)
        {
            return false;
        }

        for (int i = 0; i < completedPatterns.Count; i++)
        {
            if (ContainsCell(completedPatterns[i]?.CellIndices, cellIndex))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsCellMatchedByActiveNearPattern(int cellIndex, Theme1NearPatternRenderState activeNearPattern)
    {
        return activeNearPattern != null && ContainsCell(activeNearPattern.MatchedCellIndices, cellIndex);
    }

    private static int[] ExtractCompletedPatternIndexes(IReadOnlyList<Theme1CompletedPatternRenderState> completedPatterns, int cellIndex)
    {
        if (completedPatterns == null || completedPatterns.Count == 0)
        {
            return Array.Empty<int>();
        }

        List<int> values = new List<int>();
        for (int i = 0; i < completedPatterns.Count; i++)
        {
            Theme1CompletedPatternRenderState pattern = completedPatterns[i];
            if (pattern != null && ContainsCell(pattern.CellIndices, cellIndex))
            {
                values.Add(pattern.RawPatternIndex);
            }
        }

        return values.Count > 0 ? values.ToArray() : Array.Empty<int>();
    }

    private static bool HasCompletedPrizeLabel(
        IReadOnlyList<Theme1CompletedPatternRenderState> completedPatterns,
        int cellIndex)
    {
        if (completedPatterns == null || completedPatterns.Count == 0)
        {
            return false;
        }

        for (int i = 0; i < completedPatterns.Count; i++)
        {
            Theme1CompletedPatternRenderState pattern = completedPatterns[i];
            if (pattern != null && pattern.TriggerCellIndex == cellIndex)
            {
                return true;
            }
        }

        return false;
    }

    private static Theme1CellPrizeLabelRenderState[] BuildCellPrizeLabels(
        IReadOnlyList<Theme1CompletedPatternRenderState> completedPatterns,
        Theme1NearPatternRenderState activeNearPattern,
        int cellIndex)
    {
        List<Theme1CellPrizeLabelRenderState> labels = new List<Theme1CellPrizeLabelRenderState>();
        if (completedPatterns != null)
        {
            List<Theme1CompletedPatternRenderState> triggerPatterns = new List<Theme1CompletedPatternRenderState>();
            for (int i = 0; i < completedPatterns.Count; i++)
            {
                Theme1CompletedPatternRenderState pattern = completedPatterns[i];
                if (pattern != null && pattern.TriggerCellIndex == cellIndex)
                {
                    triggerPatterns.Add(pattern);
                }
            }

            triggerPatterns.Sort(CompareCompletedPatternPrizePriority);
            for (int i = 0; i < triggerPatterns.Count; i++)
            {
                Theme1CompletedPatternRenderState pattern = triggerPatterns[i];
                labels.Add(new Theme1CellPrizeLabelRenderState(
                    pattern.PrizeLabel,
                    pattern.PrizeAnchor,
                    pattern.PrizeAmountKr,
                    pattern.RawPatternIndex));
            }
        }

        if (labels.Count == 0 &&
            activeNearPattern != null &&
            activeNearPattern.TargetCellIndex == cellIndex &&
            !string.IsNullOrWhiteSpace(activeNearPattern.PrizeLabel))
        {
            labels.Add(new Theme1CellPrizeLabelRenderState(
                activeNearPattern.PrizeLabel,
                activeNearPattern.PrizeAnchor,
                activeNearPattern.PrizeAmountKr,
                activeNearPattern.RawPatternIndex));
        }

        return labels.Count > 0 ? labels.ToArray() : Array.Empty<Theme1CellPrizeLabelRenderState>();
    }

    private static int CompareCompletedPatternPrizePriority(
        Theme1CompletedPatternRenderState left,
        Theme1CompletedPatternRenderState right)
    {
        int leftPrize = left != null ? left.PrizeAmountKr : int.MinValue;
        int rightPrize = right != null ? right.PrizeAmountKr : int.MinValue;
        int prizeCompare = rightPrize.CompareTo(leftPrize);
        if (prizeCompare != 0)
        {
            return prizeCompare;
        }

        int leftPattern = left != null ? left.RawPatternIndex : int.MaxValue;
        int rightPattern = right != null ? right.RawPatternIndex : int.MaxValue;
        return leftPattern.CompareTo(rightPattern);
    }

    private static Theme1CardCellVisualState ResolveCellVisualState(
        bool isPrizeCell,
        bool isNearTargetCell,
        bool isMatchedByCompletedPattern,
        bool isMatchedByActiveNearPattern)
    {
        if (isPrizeCell)
        {
            return Theme1CardCellVisualState.WonPrize;
        }

        if (isNearTargetCell)
        {
            return Theme1CardCellVisualState.NearTarget;
        }

        if (isMatchedByCompletedPattern)
        {
            return Theme1CardCellVisualState.WonHit;
        }

        if (isMatchedByActiveNearPattern)
        {
            return Theme1CardCellVisualState.NearHit;
        }

        return Theme1CardCellVisualState.Normal;
    }

    private static Theme1WinLabelAnchor ResolvePrizeAnchor(int cellIndex)
    {
        if (cellIndex < 0)
        {
            return Theme1WinLabelAnchor.BottomCenter;
        }

        int column = cellIndex / 3;
        return column switch
        {
            0 => Theme1WinLabelAnchor.BottomLeft,
            4 => Theme1WinLabelAnchor.BottomRight,
            _ => Theme1WinLabelAnchor.BottomCenter
        };
    }

    private static Theme1PatternOverlayKind ResolveOverlayKind(int rawPatternIndex, IReadOnlyList<int> cellIndices)
    {
        if (cellIndices == null || cellIndices.Count == 0)
        {
            return Theme1PatternOverlayKind.None;
        }

        if (IsSingleRowPattern(cellIndices))
        {
            return Theme1PatternOverlayKind.HorizontalLine;
        }

        if (rawPatternIndex >= 0 && rawPatternIndex < 16 && cellIndices.Count <= 6)
        {
            return Theme1PatternOverlayKind.SvgStroke;
        }

        return Theme1PatternOverlayKind.SvgMask;
    }

    private static bool IsSingleRowPattern(IReadOnlyList<int> cellIndices)
    {
        if (cellIndices == null || cellIndices.Count == 0)
        {
            return false;
        }

        int row = cellIndices[0] % 3;
        for (int i = 1; i < cellIndices.Count; i++)
        {
            if (cellIndices[i] % 3 != row)
            {
                return false;
            }
        }

        return cellIndices.Count >= 5;
    }

    private static bool ContainsCell(IReadOnlyList<int> cellIndices, int cellIndex)
    {
        if (cellIndices == null)
        {
            return false;
        }

        for (int i = 0; i < cellIndices.Count; i++)
        {
            if (cellIndices[i] == cellIndex)
            {
                return true;
            }
        }

        return false;
    }

    private static int[] ExtractValidDrawnNumbers(IReadOnlyList<int> drawnNumbers)
    {
        if (drawnNumbers == null || drawnNumbers.Count == 0)
        {
            return Array.Empty<int>();
        }

        List<int> validValues = new List<int>(drawnNumbers.Count);
        for (int i = 0; i < drawnNumbers.Count; i++)
        {
            int normalized = NormalizeTheme1Number(drawnNumbers[i]);
            if (normalized > 0)
            {
                validValues.Add(normalized);
            }
        }

        return validValues.ToArray();
    }

    private static int[][] ResolveVisibleTickets(Theme1StateBuildInput input)
    {
        int cardCount = Mathf.Max(0, input.CardSlotCount);
        int[][] visibleTickets = new int[cardCount][];
        int ticketCount = input.TicketSets != null ? input.TicketSets.Length : 0;
        int pageStartIndex = Mathf.Max(0, input.CurrentTicketPage) * Mathf.Max(1, cardCount);

        for (int cardIndex = 0; cardIndex < cardCount; cardIndex++)
        {
            int ticketIndex = pageStartIndex + cardIndex;
            int[] source = null;
            if (ticketIndex < ticketCount)
            {
                source = input.TicketSets[ticketIndex];
            }
            else if (ticketCount == 1 && input.DuplicateSingleTicketAcrossCards)
            {
                source = input.TicketSets[0];
            }

            visibleTickets[cardIndex] = NormalizeTicket(source);
        }

        return visibleTickets;
    }

    private static int[] NormalizeTicket(int[] source)
    {
        int[] normalized = new int[15];
        if (source == null)
        {
            return normalized;
        }

        int limit = Mathf.Min(15, source.Length);
        for (int i = 0; i < limit; i++)
        {
            normalized[i] = NormalizeTheme1Number(source[i]);
        }

        return normalized;
    }

    private static bool IsCellMatched(int cellIndex, IReadOnlyCollection<int> matchedPatterns, IReadOnlyList<byte[]> patternMasks)
    {
        if (matchedPatterns == null || matchedPatterns.Count == 0 || patternMasks == null)
        {
            return false;
        }

        foreach (int patternIndex in matchedPatterns)
        {
            if (patternIndex < 0 || patternIndex >= patternMasks.Count)
            {
                continue;
            }

            byte[] mask = patternMasks[patternIndex];
            if (mask != null && cellIndex >= 0 && cellIndex < mask.Length && mask[cellIndex] == 1)
            {
                return true;
            }
        }

        return false;
    }

    private static void PopulateBallRack(Theme1BallRackRenderState ballRack, IReadOnlyList<int> drawnNumbers, int ballSlotCount)
    {
        if (ballRack == null)
        {
            return;
        }

        int count = Mathf.Max(0, drawnNumbers != null ? drawnNumbers.Count : 0);
        ballRack.ShowBallMachine = count > 0;
        ballRack.ShowExtraBallMachine = false;
        ballRack.ShowBallOutMachine = true;
        ballRack.ShowBigBall = count > 0;
        ballRack.BigBallNumber = count > 0 ? drawnNumbers[count - 1].ToString() : string.Empty;
        ballRack.Slots = new Theme1BallSlotRenderState[Mathf.Max(0, ballSlotCount)];

        for (int slotIndex = 0; slotIndex < ballRack.Slots.Length; slotIndex++)
        {
            if (drawnNumbers != null && slotIndex < drawnNumbers.Count)
            {
                int value = drawnNumbers[slotIndex];
                ballRack.Slots[slotIndex] = new Theme1BallSlotRenderState(value > 0, value > 0 ? value.ToString() : string.Empty);
            }
            else
            {
                ballRack.Slots[slotIndex] = Theme1BallSlotRenderState.Empty;
            }
        }
    }

    private static void PopulateHud(Theme1HudRenderState hud, Theme1StateBuildInput input)
    {
        if (hud == null || input == null)
        {
            return;
        }

        hud.CountdownLabel = input.CountdownLabel ?? string.Empty;
        hud.PlayerCountLabel = input.PlayerCountLabel ?? string.Empty;
        hud.CreditLabel = string.IsNullOrWhiteSpace(input.CreditLabel) ? "0" : input.CreditLabel;
        hud.WinningsLabel = string.IsNullOrWhiteSpace(input.WinningsLabel) ? "0" : input.WinningsLabel;
        hud.BetLabel = string.IsNullOrWhiteSpace(input.BetLabel) ? "0" : input.BetLabel;
    }

    private static void PopulateTopper(
        Theme1TopperRenderState topper,
        Theme1StateBuildInput input,
        Theme1PatternEngine.Evaluation patternEvaluation)
    {
        if (topper == null || input == null)
        {
            return;
        }

        int slotCount = input.TopperPrizeLabels != null ? input.TopperPrizeLabels.Length : 0;
        topper.Slots = new Theme1TopperSlotRenderState[slotCount];

        Dictionary<int, HashSet<int>> matchedCardsBySlot = new Dictionary<int, HashSet<int>>();
        Dictionary<int, HashSet<int>> matchedPatternsBySlot = new Dictionary<int, HashSet<int>>();
        if (patternEvaluation?.Cards != null)
        {
            for (int cardIndex = 0; cardIndex < patternEvaluation.Cards.Length; cardIndex++)
            {
                Theme1PatternEngine.CardResult card = patternEvaluation.Cards[cardIndex];
                if (card?.MatchedPatternIndexes == null)
                {
                    continue;
                }

                foreach (int rawPatternIndex in card.MatchedPatternIndexes)
                {
                    int slotIndex = GameManager.ResolvePayoutSlotIndex(rawPatternIndex, slotCount);
                    if (slotIndex < 0)
                    {
                        continue;
                    }

                    if (!matchedCardsBySlot.TryGetValue(slotIndex, out HashSet<int> matchedCards))
                    {
                        matchedCards = new HashSet<int>();
                        matchedCardsBySlot[slotIndex] = matchedCards;
                    }

                    if (!matchedPatternsBySlot.TryGetValue(slotIndex, out HashSet<int> matchedPatterns))
                    {
                        matchedPatterns = new HashSet<int>();
                        matchedPatternsBySlot[slotIndex] = matchedPatterns;
                    }

                    matchedCards.Add(cardIndex);
                    matchedPatterns.Add(rawPatternIndex);
                }
            }
        }

        for (int slotIndex = 0; slotIndex < slotCount; slotIndex++)
        {
            Theme1TopperSlotRenderState slotState = new Theme1TopperSlotRenderState
            {
                PrizeLabel = GetValue(input.TopperPrizeLabels, slotIndex, string.Empty),
                ShowPattern = true,
                ShowMatchedPattern = matchedCardsBySlot.ContainsKey(slotIndex),
                PrizeVisualState = Theme1PrizeVisualState.Normal
            };

            if (matchedCardsBySlot.TryGetValue(slotIndex, out HashSet<int> matchedCards))
            {
                slotState.ActiveCardIndexes = ToSortedArray(matchedCards);
            }

            if (matchedPatternsBySlot.TryGetValue(slotIndex, out HashSet<int> matchedPatterns))
            {
                slotState.ActivePatternIndexes = ToSortedArray(matchedPatterns);
            }

            if (slotState.ShowMatchedPattern)
            {
                slotState.PrizeVisualState = Theme1PrizeVisualState.Matched;
                slotState.MissingCellsVisible = Array.Empty<bool>();
            }
            else if (patternEvaluation != null &&
                     patternEvaluation.NearWinsByTopperSlot.TryGetValue(slotIndex, out List<Theme1PatternEngine.NearWinResult> nearWins) &&
                     nearWins != null &&
                     nearWins.Count > 0)
            {
                slotState.MissingCellsVisible = BuildTopperMissingCells(nearWins);
                slotState.PrizeVisualState = Theme1PrizeVisualState.NearWin;
                slotState.ActivePatternIndexes = ExtractActivePatternIndexes(nearWins);
                slotState.ActiveCardIndexes = ExtractActiveCardIndexes(nearWins);
            }
            else
            {
                slotState.MissingCellsVisible = Array.Empty<bool>();
                slotState.ActivePatternIndexes = Array.Empty<int>();
                slotState.ActiveCardIndexes = Array.Empty<int>();
            }

            topper.Slots[slotIndex] = slotState;
        }
    }

    private static bool[] BuildTopperMissingCells(IReadOnlyList<Theme1PatternEngine.NearWinResult> nearWins)
    {
        bool[] visible = new bool[15];
        if (nearWins == null)
        {
            return visible;
        }

        for (int i = 0; i < nearWins.Count; i++)
        {
            int cellIndex = nearWins[i].CellIndex;
            if (cellIndex >= 0 && cellIndex < visible.Length)
            {
                visible[cellIndex] = true;
            }
        }

        return visible;
    }

    private static int[] ExtractActivePatternIndexes(IReadOnlyList<Theme1PatternEngine.NearWinResult> nearWins)
    {
        if (nearWins == null || nearWins.Count == 0)
        {
            return Array.Empty<int>();
        }

        HashSet<int> values = new HashSet<int>();
        for (int i = 0; i < nearWins.Count; i++)
        {
            values.Add(nearWins[i].RawPatternIndex);
        }

        return ToSortedArray(values);
    }

    private static int[] ExtractActiveCardIndexes(IReadOnlyList<Theme1PatternEngine.NearWinResult> nearWins)
    {
        if (nearWins == null || nearWins.Count == 0)
        {
            return Array.Empty<int>();
        }

        HashSet<int> values = new HashSet<int>();
        for (int i = 0; i < nearWins.Count; i++)
        {
            values.Add(nearWins[i].CardIndex);
        }

        return ToSortedArray(values);
    }

    private static int[] ToSortedArray(HashSet<int> values)
    {
        if (values == null || values.Count == 0)
        {
            return Array.Empty<int>();
        }

        int[] array = new int[values.Count];
        values.CopyTo(array);
        Array.Sort(array);
        return array;
    }

    private static T GetValue<T>(IReadOnlyList<T> values, int index, T fallback)
    {
        if (values == null || index < 0 || index >= values.Count)
        {
            return fallback;
        }

        return values[index];
    }

    private static string GetNonEmptyString(IReadOnlyList<string> values, int index, string fallback)
    {
        string value = GetValue(values, index, string.Empty);
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private static int NormalizeTheme1Number(int value)
    {
        return GameManager.NormalizeTheme1BallNumber(value);
    }
}
