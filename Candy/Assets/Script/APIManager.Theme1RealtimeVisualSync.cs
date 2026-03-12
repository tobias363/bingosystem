using System.Collections.Generic;
using UnityEngine;

public partial class APIManager
{
    private void ApplyTicketStateVisualsForCard(
        NumberGenerator generator,
        int cardNo,
        List<int> activePatternIndexes,
        HashSet<int> wonPatternIndexes,
        Dictionary<int, RealtimeNearWinState> activeNearWinStates)
    {
        if (generator == null || generator.cardClasses == null || cardNo < 0 || cardNo >= generator.cardClasses.Length)
        {
            return;
        }

        CardClass card = generator.cardClasses[cardNo];
        if (card == null)
        {
            return;
        }

        for (int i = 0; i < card.matchPatternImg.Count; i++)
        {
            if (card.matchPatternImg[i] != null)
            {
                SetActiveIfChanged(card.matchPatternImg[i], false);
            }
        }

        int paylineCount = card.paylineObj != null ? card.paylineObj.Count : 0;
        int visualPatternCount = Mathf.Min(generator.patternList.Count, paylineCount);
        RealtimePaylineUtils.EnsurePaylineIndexCapacity(card, visualPatternCount);

        for (int patternIndex = 0; patternIndex < visualPatternCount; patternIndex++)
        {
            bool isWinner = wonPatternIndexes != null && wonPatternIndexes.Contains(patternIndex);
            if (patternIndex < card.paylineindex.Count)
            {
                card.paylineindex[patternIndex] = isWinner;
            }

            RealtimePaylineUtils.SetPaylineVisual(
                generator.cardClasses,
                cardNo,
                patternIndex,
                isWinner,
                isWinner,
                generator.matchedMat,
                generator.unMatchedMat);
        }

        for (int i = 0; i < activePatternIndexes.Count; i++)
        {
            int patternIndex = activePatternIndexes[i];
            if (patternIndex < 0 || patternIndex >= generator.patternList.Count)
            {
                continue;
            }

            if (wonPatternIndexes != null && wonPatternIndexes.Contains(patternIndex))
            {
                continue;
            }

            if (!TryGetNearWinCellIndex(card, generator.patternList[patternIndex].pattern, out int missingCellIndex))
            {
                continue;
            }

            if (missingCellIndex < 0 ||
                missingCellIndex >= card.missingPatternImg.Count ||
                card.missingPatternImg[missingCellIndex] == null)
            {
                continue;
            }

            int nearWinKey = BuildNearWinKey(cardNo, patternIndex, missingCellIndex);
            int missingNumber = ResolveNearWinMissingNumber(card, missingCellIndex);
            activeNearWinStates[nearWinKey] =
                new RealtimeNearWinState(patternIndex, cardNo, missingCellIndex, missingNumber);
        }
    }

    private bool TryGetNearWinCellIndex(CardClass card, List<byte> mask, out int missingCellIndex)
    {
        missingCellIndex = -1;
        if (card == null || mask == null || card.payLinePattern == null)
        {
            return false;
        }

        int requiredCount = 0;
        int matchedCount = 0;
        int cellCount = Mathf.Min(mask.Count, card.payLinePattern.Count);
        for (int cellIndex = 0; cellIndex < cellCount; cellIndex++)
        {
            if (mask[cellIndex] != 1)
            {
                continue;
            }

            requiredCount++;
            if (card.payLinePattern[cellIndex] == 1)
            {
                matchedCount++;
            }
            else if (missingCellIndex < 0)
            {
                missingCellIndex = cellIndex;
            }
        }

        return requiredCount > 0 && matchedCount == requiredCount - 1 && missingCellIndex >= 0;
    }

    private int ResolveNearWinMissingNumber(CardClass card, int missingCellIndex)
    {
        if (card == null || card.numb == null || missingCellIndex < 0 || missingCellIndex >= card.numb.Count)
        {
            return 0;
        }

        return Mathf.Max(0, card.numb[missingCellIndex]);
    }

    private int BuildNearWinKey(int cardNo, int patternIndex, int cellIndex)
    {
        return (cardNo * 10000) + (patternIndex * 100) + cellIndex;
    }

    private static long BuildMatchedPatternKey(int cardNo, int patternIndex)
    {
        return ((long)(cardNo + 1) << 32) | (uint)patternIndex;
    }

    private static int ExtractMatchedPatternIndex(long key)
    {
        return unchecked((int)(key & 0xFFFFFFFF));
    }

    private static int ExtractMatchedPatternCardNo(long key)
    {
        return unchecked((int)((key >> 32) - 1L));
    }

    private void SyncRealtimeMatchedPatternVisuals(Dictionary<int, HashSet<int>> winningPatternsByCard)
    {
        HashSet<long> activeMatchedPatterns = new();
        if (winningPatternsByCard != null)
        {
            foreach (KeyValuePair<int, HashSet<int>> entry in winningPatternsByCard)
            {
                if (entry.Value == null)
                {
                    continue;
                }

                foreach (int patternIndex in entry.Value)
                {
                    activeMatchedPatterns.Add(BuildMatchedPatternKey(entry.Key, patternIndex));
                }
            }
        }

        List<long> patternsToDisable = new();
        foreach (long matchedPatternKey in realtimeMatchedPatternIndexes)
        {
            if (!activeMatchedPatterns.Contains(matchedPatternKey))
            {
                patternsToDisable.Add(matchedPatternKey);
            }
        }

        for (int i = 0; i < patternsToDisable.Count; i++)
        {
            long matchedPatternKey = patternsToDisable[i];
            EventManager.ShowMatchedPattern(
                ExtractMatchedPatternIndex(matchedPatternKey),
                ExtractMatchedPatternCardNo(matchedPatternKey),
                false);
            realtimeMatchedPatternIndexes.Remove(matchedPatternKey);
        }

        foreach (long matchedPatternKey in activeMatchedPatterns)
        {
            if (realtimeMatchedPatternIndexes.Add(matchedPatternKey))
            {
                EventManager.ShowMatchedPattern(
                    ExtractMatchedPatternIndex(matchedPatternKey),
                    ExtractMatchedPatternCardNo(matchedPatternKey),
                    true);
            }
        }
    }

    private void SyncRealtimeNearWinBlinking(Dictionary<int, RealtimeNearWinState> activeNearWinStates)
    {
        List<int> keysToStop = new List<int>();
        foreach (int key in realtimeNearWinStates.Keys)
        {
            if (!activeNearWinStates.ContainsKey(key))
            {
                keysToStop.Add(key);
            }
        }

        for (int i = 0; i < keysToStop.Count; i++)
        {
            int key = keysToStop[i];
            if (realtimeNearWinStates.TryGetValue(key, out RealtimeNearWinState nearWinState))
            {
                EventManager.ShowMissingPattern(
                    nearWinState.PatternIndex,
                    nearWinState.CellIndex,
                    false,
                    0,
                    nearWinState.CardNo);
            }

            realtimeNearWinStates.Remove(key);
        }

        foreach (KeyValuePair<int, RealtimeNearWinState> entry in activeNearWinStates)
        {
            int key = entry.Key;
            RealtimeNearWinState state = entry.Value;

            bool shouldNotify = !realtimeNearWinStates.TryGetValue(key, out RealtimeNearWinState previousState) ||
                                previousState.MissingNumber != state.MissingNumber;

            if (shouldNotify)
            {
                EventManager.ShowMissingPattern(
                    state.PatternIndex,
                    state.CellIndex,
                    true,
                    state.MissingNumber,
                    state.CardNo);
            }

            realtimeNearWinStates[key] = state;
        }
    }

    private void HideAllMissingPatternVisuals(CardClass[] cards)
    {
        if (cards == null)
        {
            return;
        }

        for (int cardNo = 0; cardNo < cards.Length; cardNo++)
        {
            CardClass card = cards[cardNo];
            if (card == null || card.missingPatternImg == null)
            {
                continue;
            }

            for (int cellIndex = 0; cellIndex < card.missingPatternImg.Count; cellIndex++)
            {
                GameObject missingCell = card.missingPatternImg[cellIndex];
                if (missingCell != null)
                {
                    SetActiveIfChanged(missingCell, false);
                }
            }
        }
    }

    private void StopRealtimeNearWinBlinking()
    {
        CardClass[] cards = ResolveNumberGenerator()?.cardClasses;
        foreach (KeyValuePair<int, RealtimeNearWinState> entry in realtimeNearWinStates)
        {
            RealtimeNearWinState state = entry.Value;
            EventManager.ShowMissingPattern(state.PatternIndex, state.CellIndex, false, 0, state.CardNo);
        }

        realtimeNearWinStates.Clear();
        HideAllMissingPatternVisuals(cards);
    }

    private void StopRealtimeMatchedPatternVisuals()
    {
        foreach (long matchedPatternKey in realtimeMatchedPatternIndexes)
        {
            EventManager.ShowMatchedPattern(
                ExtractMatchedPatternIndex(matchedPatternKey),
                ExtractMatchedPatternCardNo(matchedPatternKey),
                false);
        }

        realtimeMatchedPatternIndexes.Clear();
    }

    private static void SetActiveIfChanged(GameObject target, bool active)
    {
        if (target != null && target.activeSelf != active)
        {
            target.SetActive(active);
        }
    }
}
