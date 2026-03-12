using System;
using System.Collections.Generic;
using SimpleJSON;
using TMPro;
using UnityEngine;

public partial class APIManager
{
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
            PreferredNearPatternIndexesByCard = CollectPreferredNearPatternIndexesByCard(viewRoot),
            PatternMasks = CollectPatternMasks(),
            CardHeaderLabels = CollectCardHeaderLabels(viewRoot),
            CardBetLabels = CollectCardBetLabels(viewRoot),
            CardWinLabels = CollectCardWinLabels(viewRoot),
            TopperPrizeLabels = CollectTopperPrizeLabels(viewRoot),
            TopperPayoutAmounts = CollectTopperPayoutAmounts(viewRoot),
            CountdownLabel = ReadText(viewRoot.HudBar?.CountdownText),
            PlayerCountLabel = ReadText(viewRoot.HudBar?.RoomPlayerCountText),
            CreditLabel = ResolveDedicatedHudValue(
                GameManager.instance != null ? GameManager.FormatWholeNumber(GameManager.instance.CreditBalance) : string.Empty,
                viewRoot.HudBar?.CreditText),
            WinningsLabel = ResolveDedicatedHudValue(
                GameManager.instance != null ? GameManager.FormatWholeNumber(GameManager.instance.RoundWinnings) : string.Empty,
                viewRoot.HudBar?.WinningsText),
            BetLabel = ResolveDedicatedHudValue(
                GameManager.instance != null ? GameManager.FormatWholeNumber(GameManager.instance.currentBet) : string.Empty,
                viewRoot.HudBar?.BetText)
        };

        Theme1DisplayState renderState = theme1RealtimeStateAdapter.Build(input);
        lastDedicatedTheme1RoundState = renderState?.ToRoundRenderState();
        return renderState;
    }

    private int[] CollectPreferredNearPatternIndexesByCard(Theme1GameplayViewRoot viewRoot)
    {
        int cardCount = viewRoot?.Cards != null ? viewRoot.Cards.Length : 0;
        if (cardCount <= 0)
        {
            return Array.Empty<int>();
        }

        int[] preferred = new int[cardCount];
        for (int i = 0; i < preferred.Length; i++)
        {
            preferred[i] = -1;
        }

        if (lastDedicatedTheme1RoundState?.Cards == null)
        {
            return preferred;
        }

        int limit = Mathf.Min(cardCount, lastDedicatedTheme1RoundState.Cards.Length);
        for (int cardIndex = 0; cardIndex < limit; cardIndex++)
        {
            preferred[cardIndex] = lastDedicatedTheme1RoundState.Cards[cardIndex]?.ActiveNearPattern?.RawPatternIndex ?? -1;
        }

        return preferred;
    }

    private static string ResolveDedicatedHudValue(string authoritativeValue, TMP_Text target)
    {
        if (!string.IsNullOrWhiteSpace(authoritativeValue))
        {
            return authoritativeValue;
        }

        string value = ReadText(target);
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        return "0";
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
            values[i] = GameManager.NormalizeTheme1BallNumber(drawnNumbersNode[i].AsInt);
        }

        return FilterValidTheme1Numbers(values);
    }

    private string[] CollectCardHeaderLabels(Theme1GameplayViewRoot viewRoot)
    {
        int cardCount = viewRoot.Cards != null ? viewRoot.Cards.Length : 0;
        string[] labels = new string[cardCount];
        GameManager gameManager = GameManager.instance;
        for (int i = 0; i < cardCount; i++)
        {
            labels[i] = gameManager != null
                ? gameManager.GetCardIndexLabel(i)
                : GameManager.FormatTheme1CardHeaderLabel(i);
        }

        return labels;
    }

    private string[] CollectCardBetLabels(Theme1GameplayViewRoot viewRoot)
    {
        int cardCount = viewRoot.Cards != null ? viewRoot.Cards.Length : 0;
        string[] labels = new string[cardCount];
        GameManager gameManager = GameManager.instance;
        for (int i = 0; i < cardCount; i++)
        {
            labels[i] = gameManager != null
                ? gameManager.GetCardStakeLabel()
                : GameManager.FormatTheme1CardStakeLabel(0);
        }

        return labels;
    }

    private string[] CollectCardWinLabels(Theme1GameplayViewRoot viewRoot)
    {
        int cardCount = viewRoot.Cards != null ? viewRoot.Cards.Length : 0;
        string[] labels = new string[cardCount];
        GameManager gameManager = GameManager.instance;
        for (int i = 0; i < cardCount; i++)
        {
            labels[i] = Theme1CardLabelPolicy.ResolveWinLabelForCard(gameManager, i, string.Empty, out _);
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

    private static int[] FilterValidTheme1Numbers(IReadOnlyList<int> values)
    {
        if (values == null || values.Count == 0)
        {
            return Array.Empty<int>();
        }

        List<int> filtered = new List<int>(values.Count);
        for (int i = 0; i < values.Count; i++)
        {
            int normalized = GameManager.NormalizeTheme1BallNumber(values[i]);
            if (normalized > 0)
            {
                filtered.Add(normalized);
            }
        }

        return filtered.ToArray();
    }
}
