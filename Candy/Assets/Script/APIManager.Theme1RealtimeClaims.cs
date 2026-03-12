using System;
using System.Collections.Generic;
using SimpleJSON;
using UnityEngine;

public partial class APIManager
{
    private RealtimeClaimInfo GetLatestValidClaimForCurrentPlayer(JSONNode currentGame)
    {
        if (currentGame == null || currentGame.IsNull || string.IsNullOrWhiteSpace(activePlayerId))
        {
            return default;
        }

        JSONNode claims = currentGame["claims"];
        if (claims == null || claims.IsNull || !claims.IsArray)
        {
            return default;
        }

        for (int i = claims.Count - 1; i >= 0; i--)
        {
            JSONNode claim = claims[i];
            if (claim == null || claim.IsNull || !claim["valid"].AsBool)
            {
                continue;
            }

            string claimPlayerId = claim["playerId"];
            if (!string.Equals(claimPlayerId?.Trim(), activePlayerId, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string claimType = claim["type"];
            if (string.Equals(claimType, "LINE", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(claimType, "BINGO", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(claimType, "BONUS", StringComparison.OrdinalIgnoreCase))
            {
                if (ShouldLogRealtimeDrawTrace())
                {
                    Debug.Log(
                        $"[candy-claim] game={currentGame["id"]} playerId={activePlayerId} " +
                        $"claimId={claim["id"]} type={claimType} valid={claim["valid"]} " +
                        $"patternIndex={claim["patternIndex"]} winningPatternIndex={claim["winningPatternIndex"]}");
                }

                return new RealtimeClaimInfo
                {
                    ClaimId = claim["id"],
                    ClaimType = claimType.Trim().ToUpperInvariant(),
                    ClaimNode = claim
                };
            }
        }

        return default;
    }

    private void LogRealtimeWinningPatternResolution(
        JSONNode currentGame,
        RealtimeClaimInfo latestClaim,
        Dictionary<int, HashSet<int>> winningPatternsByCard)
    {
        if (!ShouldLogRealtimeDrawTrace())
        {
            return;
        }

        string gameId = currentGame?["id"];
        string gameStatus = currentGame?["status"];
        string claimId = string.IsNullOrWhiteSpace(latestClaim.ClaimId) ? "<none>" : latestClaim.ClaimId;
        string claimType = string.IsNullOrWhiteSpace(latestClaim.ClaimType) ? "<none>" : latestClaim.ClaimType;
        int totalWinningPatterns = CountMatchedPatterns(winningPatternsByCard);
        string cardSummary = BuildWinningPatternCardSummary(winningPatternsByCard);

        Debug.Log(
            $"[candy-claim] resolve game={gameId} status={gameStatus} playerId={activePlayerId} " +
            $"claimId={claimId} type={claimType} totalWinningPatterns={totalWinningPatterns} cards={cardSummary}");
    }

    private static string BuildWinningPatternCardSummary(Dictionary<int, HashSet<int>> winningPatternsByCard)
    {
        if (winningPatternsByCard == null || winningPatternsByCard.Count == 0)
        {
            return "<none>";
        }

        List<string> entries = new();
        foreach (KeyValuePair<int, HashSet<int>> entry in winningPatternsByCard)
        {
            if (entry.Value == null || entry.Value.Count == 0)
            {
                continue;
            }

            List<int> sortedIndexes = new(entry.Value);
            sortedIndexes.Sort();
            entries.Add($"card{entry.Key}=[{string.Join(",", sortedIndexes)}]");
        }

        return entries.Count > 0 ? string.Join(";", entries) : "<none>";
    }

    private List<int> GetActivePatternIndexes(NumberGenerator generator)
    {
        List<int> activePatternIndexes = new();
        if (generator == null || generator.patternList == null || generator.patternList.Count == 0)
        {
            return activePatternIndexes;
        }

        bool preferAllRealtimePatterns = useRealtimeBackend &&
                                         (NumberManager.instance == null ||
                                          NumberManager.instance.currentPatternIndex == null ||
                                          NumberManager.instance.currentPatternIndex.Count == 0);
        if (preferAllRealtimePatterns)
        {
            for (int patternIndex = 0; patternIndex < generator.patternList.Count; patternIndex++)
            {
                activePatternIndexes.Add(patternIndex);
            }

            return activePatternIndexes;
        }

        HashSet<int> uniquePatternIndexes = new();
        List<int> selectedPatterns = generator.totalSelectedPatterns;
        if (selectedPatterns != null)
        {
            for (int i = 0; i < selectedPatterns.Count; i++)
            {
                int patternIndex = selectedPatterns[i];
                if (patternIndex < 0 || patternIndex >= generator.patternList.Count)
                {
                    continue;
                }

                if (uniquePatternIndexes.Add(patternIndex))
                {
                    activePatternIndexes.Add(patternIndex);
                }
            }
        }

        if (activePatternIndexes.Count == 0)
        {
            for (int patternIndex = 0; patternIndex < generator.patternList.Count; patternIndex++)
            {
                activePatternIndexes.Add(patternIndex);
            }
        }

        return activePatternIndexes;
    }

    private Dictionary<int, HashSet<int>> ResolveWinningPatternsByCard(
        NumberGenerator generator,
        List<int> activePatternIndexes,
        RealtimeClaimInfo latestClaim,
        JSONNode currentGame)
    {
        Dictionary<int, HashSet<int>> winningPatternsByCard = new();
        if (generator == null || generator.cardClasses == null || generator.patternList == null)
        {
            return winningPatternsByCard;
        }

        for (int cardNo = 0; cardNo < generator.cardClasses.Length; cardNo++)
        {
            winningPatternsByCard[cardNo] = new HashSet<int>();
        }

        HashSet<int> explicitWinningPatternIndexes = ExtractWinningPatternIndexes(
            latestClaim.ClaimNode,
            generator.patternList.Count);

        List<int> candidatePatternIndexes = explicitWinningPatternIndexes.Count > 0
            ? BuildOrderedPatternPriority(activePatternIndexes, explicitWinningPatternIndexes)
            : activePatternIndexes;

        for (int cardNo = 0; cardNo < generator.cardClasses.Length; cardNo++)
        {
            CardClass card = generator.cardClasses[cardNo];
            if (card == null)
            {
                continue;
            }

            winningPatternsByCard[cardNo] = FindMatchedPatternIndexes(
                card,
                generator.patternList,
                candidatePatternIndexes);
        }

        if (latestClaim.ClaimNode != null &&
            !latestClaim.ClaimNode.IsNull &&
            CountMatchedPatterns(winningPatternsByCard) == 0)
        {
            List<int> allPatternIndexes = new(generator.patternList.Count);
            for (int patternIndex = 0; patternIndex < generator.patternList.Count; patternIndex++)
            {
                allPatternIndexes.Add(patternIndex);
            }

            for (int cardNo = 0; cardNo < generator.cardClasses.Length; cardNo++)
            {
                CardClass card = generator.cardClasses[cardNo];
                if (card == null)
                {
                    continue;
                }

                winningPatternsByCard[cardNo] = FindMatchedPatternIndexes(
                    card,
                    generator.patternList,
                    allPatternIndexes);
            }

            if (CountMatchedPatterns(winningPatternsByCard) == 0)
            {
                bool assignedFromBackendClaim = TryAssignBackendClaimPatternVisual(
                    currentGame,
                    latestClaim,
                    generator.patternList.Count,
                    winningPatternsByCard);

                if (!assignedFromBackendClaim)
                {
                    TryAssignFallbackClaimVisual(generator, latestClaim, winningPatternsByCard);
                }
            }
        }

        return winningPatternsByCard;
    }

    private static int CountMatchedPatterns(Dictionary<int, HashSet<int>> winningPatternsByCard)
    {
        if (winningPatternsByCard == null)
        {
            return 0;
        }

        int total = 0;
        foreach (HashSet<int> winningPatterns in winningPatternsByCard.Values)
        {
            if (winningPatterns == null)
            {
                continue;
            }

            total += winningPatterns.Count;
        }

        return total;
    }

    private bool TryAssignFallbackClaimVisual(
        NumberGenerator generator,
        RealtimeClaimInfo latestClaim,
        Dictionary<int, HashSet<int>> winningPatternsByCard)
    {
        if (generator == null ||
            generator.cardClasses == null ||
            generator.patternList == null ||
            latestClaim.ClaimNode == null ||
            latestClaim.ClaimNode.IsNull)
        {
            return false;
        }

        List<int> candidatePatternIndexes = BuildFallbackPatternCandidates(latestClaim, generator.patternList.Count);
        if (candidatePatternIndexes.Count == 0)
        {
            return false;
        }

        int bestCardNo = -1;
        int bestPatternIndex = -1;
        int bestMatchedCells = -1;
        int bestRequiredCells = int.MaxValue;

        for (int cardNo = 0; cardNo < generator.cardClasses.Length; cardNo++)
        {
            CardClass card = generator.cardClasses[cardNo];
            if (card == null)
            {
                continue;
            }

            for (int i = 0; i < candidatePatternIndexes.Count; i++)
            {
                int patternIndex = candidatePatternIndexes[i];
                if (patternIndex < 0 || patternIndex >= generator.patternList.Count)
                {
                    continue;
                }

                int matchedCells = CountMatchedPatternCells(card, generator.patternList[patternIndex].pattern, out int requiredCells);
                if (matchedCells <= 0)
                {
                    continue;
                }

                bool isBetterCandidate = matchedCells > bestMatchedCells ||
                                         (matchedCells == bestMatchedCells && requiredCells < bestRequiredCells) ||
                                         (matchedCells == bestMatchedCells &&
                                          requiredCells == bestRequiredCells &&
                                          (bestPatternIndex < 0 || patternIndex < bestPatternIndex));
                if (!isBetterCandidate)
                {
                    continue;
                }

                bestCardNo = cardNo;
                bestPatternIndex = patternIndex;
                bestMatchedCells = matchedCells;
                bestRequiredCells = requiredCells;
            }
        }

        if (bestCardNo < 0 || bestPatternIndex < 0)
        {
            return false;
        }

        if (!winningPatternsByCard.TryGetValue(bestCardNo, out HashSet<int> winningPatterns) || winningPatterns == null)
        {
            winningPatterns = new HashSet<int>();
            winningPatternsByCard[bestCardNo] = winningPatterns;
        }

        winningPatterns.Add(bestPatternIndex);
        return true;
    }

    private bool TryAssignBackendClaimPatternVisual(
        JSONNode currentGame,
        RealtimeClaimInfo latestClaim,
        int generatorPatternCount,
        Dictionary<int, HashSet<int>> winningPatternsByCard)
    {
        if (currentGame == null ||
            currentGame.IsNull ||
            latestClaim.ClaimNode == null ||
            latestClaim.ClaimNode.IsNull ||
            generatorPatternCount <= 0 ||
            string.IsNullOrWhiteSpace(activePlayerId))
        {
            return false;
        }

        HashSet<int> claimPatternIndexes = ExtractWinningPatternIndexes(latestClaim.ClaimNode, generatorPatternCount);
        if (claimPatternIndexes.Count == 0)
        {
            return false;
        }

        JSONNode playerTickets = currentGame["tickets"]?[activePlayerId];
        if (playerTickets == null || playerTickets.IsNull || !playerTickets.IsArray)
        {
            return false;
        }

        HashSet<int> drawnNumbers = ExtractPositiveIntSet(currentGame["drawnNumbers"]);
        if (drawnNumbers.Count == 0)
        {
            return false;
        }

        bool assigned = false;
        foreach (int patternIndex in claimPatternIndexes)
        {
            int resolvedPatternIndex = Mathf.Clamp(patternIndex, 0, generatorPatternCount - 1);
            int bestCardIndex = -1;
            int bestMatchCount = -1;
            bool hasCompleteMatch = false;

            for (int ticketIndex = 0; ticketIndex < playerTickets.Count; ticketIndex++)
            {
                JSONNode ticketNode = playerTickets[ticketIndex];
                int matchedCells = CountMatchedBackendClaimPatternCells(ticketNode?["grid"], patternIndex, drawnNumbers, out bool isComplete);
                if (matchedCells <= 0 && !isComplete)
                {
                    continue;
                }

                if (isComplete)
                {
                    if (!winningPatternsByCard.TryGetValue(ticketIndex, out HashSet<int> winningPatterns) || winningPatterns == null)
                    {
                        winningPatterns = new HashSet<int>();
                        winningPatternsByCard[ticketIndex] = winningPatterns;
                    }

                    winningPatterns.Add(resolvedPatternIndex);
                    assigned = true;
                    hasCompleteMatch = true;
                }
                else if (!hasCompleteMatch && matchedCells > bestMatchCount)
                {
                    bestMatchCount = matchedCells;
                    bestCardIndex = ticketIndex;
                }
            }

            if (!hasCompleteMatch && bestCardIndex >= 0)
            {
                if (!winningPatternsByCard.TryGetValue(bestCardIndex, out HashSet<int> winningPatterns) || winningPatterns == null)
                {
                    winningPatterns = new HashSet<int>();
                    winningPatternsByCard[bestCardIndex] = winningPatterns;
                }

                winningPatterns.Add(resolvedPatternIndex);
                assigned = true;
            }
        }

        return assigned;
    }

    private static HashSet<int> ExtractPositiveIntSet(JSONNode valuesNode)
    {
        HashSet<int> values = new();
        if (valuesNode == null || valuesNode.IsNull || !valuesNode.IsArray)
        {
            return values;
        }

        for (int i = 0; i < valuesNode.Count; i++)
        {
            int value = valuesNode[i].AsInt;
            if (value > 0)
            {
                values.Add(value);
            }
        }

        return values;
    }

    private static int CountMatchedBackendClaimPatternCells(
        JSONNode gridNode,
        int patternIndex,
        HashSet<int> drawnNumbers,
        out bool isComplete)
    {
        isComplete = false;
        List<int> patternNumbers = ExtractBackendClaimPatternNumbers(gridNode, patternIndex);
        if (patternNumbers.Count == 0 || drawnNumbers == null || drawnNumbers.Count == 0)
        {
            return 0;
        }

        int matchedCells = 0;
        for (int i = 0; i < patternNumbers.Count; i++)
        {
            if (drawnNumbers.Contains(patternNumbers[i]))
            {
                matchedCells += 1;
            }
        }

        isComplete = matchedCells >= patternNumbers.Count;
        return matchedCells;
    }

    private static List<int> ExtractBackendClaimPatternNumbers(JSONNode gridNode, int patternIndex)
    {
        List<int> numbers = new();
        if (gridNode == null || gridNode.IsNull || !gridNode.IsArray || gridNode.Count == 0)
        {
            return numbers;
        }

        int rowCount = gridNode.Count;
        int colCount = gridNode[0] != null && gridNode[0].IsArray ? gridNode[0].Count : 0;
        if (colCount <= 0)
        {
            return numbers;
        }

        if (patternIndex >= 0 && patternIndex < rowCount)
        {
            AppendPositivePatternNumbers(gridNode[patternIndex], numbers);
            return numbers;
        }

        int columnPatternOffset = rowCount;
        if (patternIndex >= columnPatternOffset && patternIndex < columnPatternOffset + colCount)
        {
            int columnIndex = patternIndex - columnPatternOffset;
            for (int rowIndex = 0; rowIndex < rowCount; rowIndex++)
            {
                int value = gridNode[rowIndex]?[columnIndex].AsInt ?? 0;
                if (value > 0)
                {
                    numbers.Add(value);
                }
            }

            return numbers;
        }

        int diagonalPatternOffset = rowCount + colCount;
        if (patternIndex == diagonalPatternOffset)
        {
            int diagonalLength = Mathf.Min(rowCount, colCount);
            for (int i = 0; i < diagonalLength; i++)
            {
                int value = gridNode[i]?[i].AsInt ?? 0;
                if (value > 0)
                {
                    numbers.Add(value);
                }
            }

            return numbers;
        }

        if (patternIndex == diagonalPatternOffset + 1)
        {
            int diagonalLength = Mathf.Min(rowCount, colCount);
            for (int i = 0; i < diagonalLength; i++)
            {
                int value = gridNode[i]?[colCount - 1 - i].AsInt ?? 0;
                if (value > 0)
                {
                    numbers.Add(value);
                }
            }
        }

        return numbers;
    }

    private static void AppendPositivePatternNumbers(JSONNode rowNode, List<int> target)
    {
        if (rowNode == null || rowNode.IsNull || !rowNode.IsArray || target == null)
        {
            return;
        }

        for (int i = 0; i < rowNode.Count; i++)
        {
            int value = rowNode[i].AsInt;
            if (value > 0)
            {
                target.Add(value);
            }
        }
    }

    private List<int> BuildFallbackPatternCandidates(RealtimeClaimInfo latestClaim, int patternCount)
    {
        List<int> candidates = new();
        if (patternCount <= 0)
        {
            return candidates;
        }

        HashSet<int> seen = new();
        HashSet<int> explicitWinningPatternIndexes = ExtractWinningPatternIndexes(latestClaim.ClaimNode, patternCount);
        foreach (int patternIndex in explicitWinningPatternIndexes)
        {
            if (seen.Add(patternIndex))
            {
                candidates.Add(patternIndex);
            }

            int payoutSlotIndex = GameManager.ResolvePayoutSlotIndex(patternIndex, patternCount);
            if (payoutSlotIndex >= 0 && seen.Add(payoutSlotIndex))
            {
                candidates.Add(payoutSlotIndex);
            }
        }

        for (int patternIndex = 0; patternIndex < patternCount; patternIndex++)
        {
            if (seen.Add(patternIndex))
            {
                candidates.Add(patternIndex);
            }
        }

        return candidates;
    }

    private int CountMatchedPatternCells(CardClass card, List<byte> patternMask, out int requiredCells)
    {
        requiredCells = 0;
        if (card == null || patternMask == null || card.payLinePattern == null)
        {
            return 0;
        }

        int matchedCells = 0;
        int cellCount = Mathf.Min(patternMask.Count, card.payLinePattern.Count);
        for (int cellIndex = 0; cellIndex < cellCount; cellIndex++)
        {
            if (patternMask[cellIndex] != 1)
            {
                continue;
            }

            requiredCells += 1;
            if (card.payLinePattern[cellIndex] == 1)
            {
                matchedCells += 1;
            }
        }

        return matchedCells;
    }

    private HashSet<int> ExtractWinningPatternIndexes(JSONNode claimNode, int patternCount)
    {
        HashSet<int> winningIndexes = new();
        if (claimNode == null || claimNode.IsNull || patternCount <= 0)
        {
            return winningIndexes;
        }

        AddWinningPatternIndex(claimNode["patternIndex"], patternCount, winningIndexes);
        AddWinningPatternIndex(claimNode["winningPatternIndex"], patternCount, winningIndexes);
        AddWinningPatternIndex(claimNode["lineIndex"], patternCount, winningIndexes);
        AddWinningPatternIndexesFromArray(claimNode["patternIndexes"], patternCount, winningIndexes);
        AddWinningPatternIndexesFromArray(claimNode["winningPatternIndexes"], patternCount, winningIndexes);

        JSONNode payloadNode = claimNode["payload"];
        if (payloadNode != null && !payloadNode.IsNull)
        {
            AddWinningPatternIndex(payloadNode["patternIndex"], patternCount, winningIndexes);
            AddWinningPatternIndex(payloadNode["winningPatternIndex"], patternCount, winningIndexes);
            AddWinningPatternIndex(payloadNode["lineIndex"], patternCount, winningIndexes);
            AddWinningPatternIndexesFromArray(payloadNode["patternIndexes"], patternCount, winningIndexes);
            AddWinningPatternIndexesFromArray(payloadNode["winningPatternIndexes"], patternCount, winningIndexes);
        }

        return winningIndexes;
    }

    private void AddWinningPatternIndexesFromArray(JSONNode node, int patternCount, HashSet<int> target)
    {
        if (node == null || node.IsNull || !node.IsArray)
        {
            return;
        }

        for (int i = 0; i < node.Count; i++)
        {
            AddWinningPatternIndex(node[i], patternCount, target);
        }
    }

    private void AddWinningPatternIndex(JSONNode node, int patternCount, HashSet<int> target)
    {
        if (!TryParsePatternIndex(node, patternCount, out int patternIndex))
        {
            return;
        }

        target.Add(patternIndex);
    }

    private bool TryParsePatternIndex(JSONNode node, int patternCount, out int patternIndex)
    {
        patternIndex = -1;
        if (node == null || node.IsNull || patternCount <= 0)
        {
            return false;
        }

        string rawValue = node.Value;
        if (!int.TryParse(rawValue, out int parsed))
        {
            return false;
        }

        if (parsed >= 0 && parsed < patternCount)
        {
            patternIndex = parsed;
            return true;
        }

        if (parsed > 0 && parsed <= patternCount)
        {
            patternIndex = parsed - 1;
            return true;
        }

        return false;
    }

    private List<int> BuildOrderedPatternPriority(List<int> activePatternIndexes, HashSet<int> explicitPatternIndexes)
    {
        List<int> orderedPatterns = new();
        HashSet<int> seen = new();

        if (activePatternIndexes != null)
        {
            for (int i = 0; i < activePatternIndexes.Count; i++)
            {
                int patternIndex = activePatternIndexes[i];
                if (!explicitPatternIndexes.Contains(patternIndex))
                {
                    continue;
                }

                if (seen.Add(patternIndex))
                {
                    orderedPatterns.Add(patternIndex);
                }
            }
        }

        foreach (int patternIndex in explicitPatternIndexes)
        {
            if (seen.Add(patternIndex))
            {
                orderedPatterns.Add(patternIndex);
            }
        }

        return orderedPatterns;
    }

    private HashSet<int> FindMatchedPatternIndexes(CardClass card, List<Patterns> patternList, List<int> candidatePatternIndexes)
    {
        HashSet<int> matchedPatternIndexes = new();
        if (card == null || patternList == null || candidatePatternIndexes == null)
        {
            return matchedPatternIndexes;
        }

        for (int i = 0; i < candidatePatternIndexes.Count; i++)
        {
            int patternIndex = candidatePatternIndexes[i];
            if (patternIndex < 0 || patternIndex >= patternList.Count)
            {
                continue;
            }

            if (RealtimePaylineUtils.IsPatternMatchedOnCard(card, patternList, patternIndex))
            {
                matchedPatternIndexes.Add(patternIndex);
            }
        }

        return matchedPatternIndexes;
    }
}
