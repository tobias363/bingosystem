using TMPro;
using UnityEngine;

public sealed partial class Theme1GameplayViewRoot
{
    public Theme1RoundRenderState CaptureRenderedState()
    {
        EnsurePresentationInitialized();
        Theme1RoundRenderState state = Theme1RoundRenderState.CreateEmpty(
            cards != null ? cards.Length : 0,
            ballRack?.Slots != null ? ballRack.Slots.Length : 0,
            topperStrip?.Slots != null ? topperStrip.Slots.Length : 0);

        for (int cardIndex = 0; cards != null && cardIndex < cards.Length; cardIndex++)
        {
            Theme1CardGridView card = cards[cardIndex];
            Theme1CardRenderState cardState = Theme1CardRenderState.CreateEmpty();
            cardState.HeaderLabel = ReadText(card?.HeaderLabel);
            cardState.BetLabel = ReadText(card?.BetLabel);
            bool showWinLabel = Theme1CardLabelPolicy.IsVisible(card?.WinLabel);
            cardState.WinLabel = Theme1CardLabelPolicy.ReadVisibleWinLabel(card?.WinLabel);
            cardState.ShowWinLabel = showWinLabel;
            int paylineCount = card?.PaylineObjects != null ? card.PaylineObjects.Length : 0;
            cardState.PaylinesActive = new bool[paylineCount];
            for (int paylineIndex = 0; paylineIndex < paylineCount; paylineIndex++)
            {
                GameObject payline = card.PaylineObjects[paylineIndex];
                cardState.PaylinesActive[paylineIndex] = payline != null && payline.activeSelf;
            }

            for (int cellIndex = 0; card?.Cells != null && cellIndex < card.Cells.Length; cellIndex++)
            {
                Theme1CardCellView cell = card.Cells[cellIndex];
                cardState.Cells[cellIndex] = new Theme1CardCellRenderState(
                    ReadText(cell?.NumberLabel),
                    IsActive(cell?.SelectionOverlay),
                    IsActive(cell?.MissingOverlay),
                    IsActive(cell?.MatchedOverlay));
            }

            state.Cards[cardIndex] = cardState;
        }

        if (ballRack != null)
        {
            state.BallRack.ShowBigBall = ballRack.BigBallImage != null && ballRack.BigBallImage.gameObject.activeSelf;
            state.BallRack.BigBallNumber = ReadText(ballRack.BigBallText);
            state.BallRack.ShowBallMachine = IsActive(ballRack.BallMachine);
            state.BallRack.ShowExtraBallMachine = IsActive(ballRack.ExtraBallMachine);
            state.BallRack.ShowBallOutMachine = IsActive(ballRack.BallOutMachineAnimParent);
            for (int slotIndex = 0; ballRack.Slots != null && slotIndex < ballRack.Slots.Length; slotIndex++)
            {
                Theme1BallSlotView slot = ballRack.Slots[slotIndex];
                state.BallRack.Slots[slotIndex] = new Theme1BallSlotRenderState(
                    IsActive(slot?.Root),
                    ReadText(slot?.NumberLabel));
            }
        }

        if (hudBar != null)
        {
            state.Hud.CountdownLabel = ReadText(hudBar.CountdownText);
            state.Hud.PlayerCountLabel = ReadText(hudBar.RoomPlayerCountText);
            state.Hud.CreditLabel = ReadText(hudBar.CreditText);
            state.Hud.WinningsLabel = ReadText(hudBar.WinningsText);
            state.Hud.BetLabel = ReadText(hudBar.BetText);
        }

        for (int slotIndex = 0; topperStrip?.Slots != null && slotIndex < topperStrip.Slots.Length; slotIndex++)
        {
            Theme1TopperSlotView slot = topperStrip.Slots[slotIndex];
            Theme1TopperSlotRenderState slotState = new Theme1TopperSlotRenderState
            {
                PrizeLabel = ReadText(slot?.PrizeLabel),
                ShowPattern = IsActive(slot?.PatternRoot),
                ShowMatchedPattern = IsActive(slot?.MatchedPatternRoot),
                PrizeVisualState = ResolvePrizeVisualState(slot)
            };

            int missingCount = slot?.MissingCells != null ? slot.MissingCells.Length : 0;
            slotState.MissingCellsVisible = new bool[missingCount];
            for (int cellIndex = 0; cellIndex < missingCount; cellIndex++)
            {
                slotState.MissingCellsVisible[cellIndex] = IsActive(slot.MissingCells[cellIndex]);
            }

            state.Topper.Slots[slotIndex] = slotState;
        }

        return state;
    }

    private static string ReadText(TMP_Text target)
    {
        return target != null ? (target.text ?? string.Empty) : string.Empty;
    }

    private static bool IsActive(GameObject target)
    {
        return target != null && target.activeSelf;
    }

    private static Theme1PrizeVisualState ResolvePrizeVisualState(Theme1TopperSlotView slot)
    {
        if (slot == null || slot.PrizeLabel == null)
        {
            return Theme1PrizeVisualState.Normal;
        }

        if (slot.PrizeLabel.color == Color.green)
        {
            return Theme1PrizeVisualState.Matched;
        }

        return slot.PrizeLabel.color == slot.DefaultPrizeColor
            ? Theme1PrizeVisualState.Normal
            : Theme1PrizeVisualState.NearWin;
    }
}
