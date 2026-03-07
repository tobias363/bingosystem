using System.Linq;
using TMPro;
using UnityEngine;

public sealed class Theme1LocalStateAdapter
{
    public Theme1DisplayState Build(
        Theme1GameplayViewRoot viewRoot,
        NumberGenerator generator,
        BallManager ballManager,
        GameManager gameManager)
    {
        int cardCount = viewRoot?.Cards != null ? viewRoot.Cards.Length : 0;
        int ballSlotCount = viewRoot?.BallRack?.Slots != null ? viewRoot.BallRack.Slots.Length : 0;
        int topperCount = viewRoot?.TopperStrip?.Slots != null ? viewRoot.TopperStrip.Slots.Length : 0;
        Theme1DisplayState state = Theme1DisplayState.CreateEmpty(cardCount, ballSlotCount, topperCount);

        PopulateCards(state, viewRoot, generator);
        PopulateHud(state, viewRoot, generator, gameManager);
        PopulateTopper(state, viewRoot, gameManager);
        PopulateBallRack(state, viewRoot, generator);
        return state;
    }

    private static void PopulateCards(Theme1DisplayState state, Theme1GameplayViewRoot viewRoot, NumberGenerator generator)
    {
        CardClass[] cards = generator != null ? generator.cardClasses : null;
        for (int cardIndex = 0; cardIndex < state.Cards.Length; cardIndex++)
        {
            Theme1CardGridView contractCard = viewRoot?.Cards != null && cardIndex < viewRoot.Cards.Length
                ? viewRoot.Cards[cardIndex]
                : null;
            CardClass legacyCard = cards != null && cardIndex < cards.Length ? cards[cardIndex] : null;

            Theme1CardRenderState cardState = Theme1CardRenderState.CreateEmpty();
            cardState.HeaderLabel = ReadText(contractCard?.HeaderLabel, $"Card -{cardIndex + 1}");
            cardState.BetLabel = ReadText(contractCard?.BetLabel, "BET - 0");
            cardState.WinLabel = ReadText(contractCard?.WinLabel, "WIN - 0");

            int paylineCount = contractCard?.PaylineObjects != null ? contractCard.PaylineObjects.Length : 0;
            cardState.PaylinesActive = new bool[paylineCount];
            for (int paylineIndex = 0; paylineIndex < paylineCount; paylineIndex++)
            {
                cardState.PaylinesActive[paylineIndex] = contractCard.PaylineObjects[paylineIndex] != null &&
                                                         contractCard.PaylineObjects[paylineIndex].activeSelf;
            }

            for (int cellIndex = 0; cellIndex < cardState.Cells.Length; cellIndex++)
            {
                int number = legacyCard != null &&
                             legacyCard.numb != null &&
                             cellIndex < legacyCard.numb.Count
                    ? Mathf.Max(0, legacyCard.numb[cellIndex])
                    : 0;

                Theme1CardCellView contractCell = contractCard?.Cells != null && cellIndex < contractCard.Cells.Length
                    ? contractCard.Cells[cellIndex]
                    : null;

                cardState.Cells[cellIndex] = new Theme1CardCellRenderState(
                    number > 0 ? number.ToString() : "-",
                    contractCell?.SelectionOverlay != null && contractCell.SelectionOverlay.activeSelf,
                    contractCell?.MissingOverlay != null && contractCell.MissingOverlay.activeSelf,
                    contractCell?.MatchedOverlay != null && contractCell.MatchedOverlay.activeSelf);
            }

            state.Cards[cardIndex] = cardState;
        }
    }

    private static void PopulateHud(Theme1DisplayState state, Theme1GameplayViewRoot viewRoot, NumberGenerator generator, GameManager gameManager)
    {
        Theme1HudBarView hud = viewRoot?.HudBar;
        state.Hud.CountdownLabel = ReadText(generator != null ? generator.autoSpinRemainingPlayText : null, ReadText(hud?.CountdownText, string.Empty));
        state.Hud.PlayerCountLabel = ReadText(hud?.RoomPlayerCountText, string.Empty);
        state.Hud.CreditLabel = ReadText(gameManager != null ? gameManager.displayTotalMoney : null, ReadText(hud?.CreditText, "0"));
        state.Hud.WinningsLabel = ReadText(gameManager != null ? gameManager.winAmtText : null, ReadText(hud?.WinningsText, "0"));
        state.Hud.BetLabel = ReadText(gameManager != null ? gameManager.displayCurrentBets : null, ReadText(hud?.BetText, "0"));
    }

    private static void PopulateTopper(Theme1DisplayState state, Theme1GameplayViewRoot viewRoot, GameManager gameManager)
    {
        int slotCount = state.Topper.Slots != null ? state.Topper.Slots.Length : 0;
        for (int slotIndex = 0; slotIndex < slotCount; slotIndex++)
        {
            Theme1TopperSlotView contractSlot = viewRoot?.TopperStrip?.Slots != null && slotIndex < viewRoot.TopperStrip.Slots.Length
                ? viewRoot.TopperStrip.Slots[slotIndex]
                : null;

            Theme1TopperSlotRenderState slotState = new Theme1TopperSlotRenderState
            {
                PrizeLabel = ResolvePrizeLabel(contractSlot?.PrizeLabel, gameManager, slotIndex),
                ShowPattern = contractSlot?.PatternRoot == null || contractSlot.PatternRoot.activeSelf,
                ShowMatchedPattern = contractSlot?.MatchedPatternRoot != null && contractSlot.MatchedPatternRoot.activeSelf
            };

            int missingCount = contractSlot?.MissingCells != null ? contractSlot.MissingCells.Length : 0;
            slotState.MissingCellsVisible = new bool[missingCount];
            bool hasNearWin = false;
            for (int cellIndex = 0; cellIndex < missingCount; cellIndex++)
            {
                bool visible = contractSlot.MissingCells[cellIndex] != null && contractSlot.MissingCells[cellIndex].activeSelf;
                slotState.MissingCellsVisible[cellIndex] = visible;
                hasNearWin |= visible;
            }

            slotState.PrizeVisualState = slotState.ShowMatchedPattern
                ? Theme1PrizeVisualState.Matched
                : (hasNearWin ? Theme1PrizeVisualState.NearWin : Theme1PrizeVisualState.Normal);
            state.Topper.Slots[slotIndex] = slotState;
        }
    }

    private static void PopulateBallRack(Theme1DisplayState state, Theme1GameplayViewRoot viewRoot, NumberGenerator generator)
    {
        Theme1BallRackView rack = viewRoot?.BallRack;
        state.BallRack.ShowBallMachine = rack?.BallMachine != null && rack.BallMachine.activeSelf;
        state.BallRack.ShowExtraBallMachine = rack?.ExtraBallMachine != null && rack.ExtraBallMachine.activeSelf;
        state.BallRack.ShowBallOutMachine = rack?.BallOutMachineAnimParent == null || rack.BallOutMachineAnimParent.activeSelf;
        state.BallRack.ShowBigBall = rack?.BigBallImage != null && rack.BigBallImage.gameObject.activeSelf;

        int[] drawnNumbers = generator != null && generator.generatedNO != null
            ? generator.generatedNO.ToArray()
            : System.Array.Empty<int>();
        int lastVisibleDrawIndex = -1;

        int slotCount = state.BallRack.Slots != null ? state.BallRack.Slots.Length : 0;
        for (int slotIndex = 0; slotIndex < slotCount; slotIndex++)
        {
            bool isVisible = rack?.Slots != null &&
                             slotIndex < rack.Slots.Length &&
                             rack.Slots[slotIndex] != null &&
                             rack.Slots[slotIndex].Root != null &&
                             rack.Slots[slotIndex].Root.activeSelf;
            int ballNumber = slotIndex < drawnNumbers.Length ? drawnNumbers[slotIndex] : 0;
            if (isVisible)
            {
                lastVisibleDrawIndex = slotIndex;
            }

            state.BallRack.Slots[slotIndex] = new Theme1BallSlotRenderState(
                isVisible,
                ballNumber > 0 ? ballNumber.ToString() : string.Empty);
        }

        if (lastVisibleDrawIndex >= 0 && lastVisibleDrawIndex < drawnNumbers.Length)
        {
            state.BallRack.BigBallNumber = drawnNumbers[lastVisibleDrawIndex].ToString();
        }
        else
        {
            state.BallRack.BigBallNumber = ReadText(rack?.BigBallText, string.Empty);
        }
    }

    private static string ResolvePrizeLabel(TMP_Text currentPrizeLabel, GameManager gameManager, int slotIndex)
    {
        string current = ReadText(currentPrizeLabel, string.Empty);
        if (!string.IsNullOrWhiteSpace(current) && current.IndexOf("kr", System.StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return current;
        }

        if (gameManager != null && gameManager.TryGetFormattedPayoutLabel(slotIndex, out string payoutLabel))
        {
            return payoutLabel;
        }

        return current;
    }

    private static string ReadText(TMP_Text target, string fallback)
    {
        string value = target != null ? (target.text ?? string.Empty) : string.Empty;
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }
}
