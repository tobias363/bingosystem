using TMPro;
using UnityEngine;
using UnityEngine.UI;

public sealed class Theme1RealtimePresenter
{
    private static readonly Color MatchedPrizeColor = Color.green;
    private static readonly Color NearWinPrizeColor = new Color(1f, 0.92f, 0.3f, 1f);

    public void Render(Theme1GameplayViewRoot root, Theme1RoundRenderState state)
    {
        if (root == null || state == null)
        {
            return;
        }

        root.EnsurePresentationInitialized();
        RenderCards(root, state.Cards);
        RenderBallRack(root, state.BallRack);
        RenderHud(root, state.Hud);
        RenderTopper(root, state.Topper);
    }

    private static void RenderCards(Theme1GameplayViewRoot root, Theme1CardRenderState[] cards)
    {
        int cardCount = root.Cards != null ? root.Cards.Length : 0;
        for (int cardIndex = 0; cardIndex < cardCount; cardIndex++)
        {
            Theme1CardGridView view = root.Cards[cardIndex];
            Theme1CardRenderState state = cards != null && cardIndex < cards.Length
                ? cards[cardIndex]
                : Theme1CardRenderState.CreateEmpty();

            ApplyText(view.HeaderLabel, state.HeaderLabel);
            ApplyText(view.BetLabel, state.BetLabel);
            ApplyText(view.WinLabel, state.WinLabel);

            int cellCount = view.Cells != null ? view.Cells.Length : 0;
            for (int cellIndex = 0; cellIndex < cellCount; cellIndex++)
            {
                Theme1CardCellView cellView = view.Cells[cellIndex];
                Theme1CardCellRenderState cellState = state.Cells != null && cellIndex < state.Cells.Length
                    ? state.Cells[cellIndex]
                    : Theme1CardCellRenderState.Empty;

                ApplyCardNumberText(cellView.NumberLabel, cellState.NumberLabel);
                SetActive(cellView.SelectionOverlay, cellState.IsSelected);
                SetActive(cellView.MissingOverlay, cellState.IsMissing);
                SetActive(cellView.MatchedOverlay, cellState.IsMatched);
            }

            int paylineCount = view.PaylineObjects != null ? view.PaylineObjects.Length : 0;
            for (int paylineIndex = 0; paylineIndex < paylineCount; paylineIndex++)
            {
                bool isActive = state.PaylinesActive != null &&
                                paylineIndex < state.PaylinesActive.Length &&
                                state.PaylinesActive[paylineIndex];
                SetActive(view.PaylineObjects[paylineIndex], isActive);
            }
        }
    }

    private static void RenderBallRack(Theme1GameplayViewRoot root, Theme1BallRackRenderState state)
    {
        Theme1BallRackView view = root.BallRack;
        if (view == null || state == null)
        {
            return;
        }

        SetActive(view.BallOutMachineAnimParent, state.ShowBallOutMachine);
        SetActive(view.BallMachine, state.ShowBallMachine);
        SetActive(view.ExtraBallMachine, state.ShowExtraBallMachine);
        if (view.BigBallImage != null)
        {
            SetActive(view.BigBallImage.gameObject, state.ShowBigBall);
        }

        ApplyBallNumberText(view.BigBallText, state.BigBallNumber);

        int slotCount = view.Slots != null ? view.Slots.Length : 0;
        for (int slotIndex = 0; slotIndex < slotCount; slotIndex++)
        {
            Theme1BallSlotView slotView = view.Slots[slotIndex];
            Theme1BallSlotRenderState slotState = state.Slots != null && slotIndex < state.Slots.Length
                ? state.Slots[slotIndex]
                : Theme1BallSlotRenderState.Empty;

            SetActive(slotView.Root, slotState.IsVisible);
            ApplyBallNumberText(slotView.NumberLabel, slotState.NumberLabel);
        }
    }

    private static void RenderHud(Theme1GameplayViewRoot root, Theme1HudRenderState state)
    {
        Theme1HudBarView view = root.HudBar;
        if (view == null || state == null)
        {
            return;
        }

        ApplyHudText(view.CountdownText, state.CountdownLabel);
        ApplyHudText(view.RoomPlayerCountText, state.PlayerCountLabel);
        ApplyHudText(view.CreditText, state.CreditLabel);
        ApplyHudText(view.WinningsText, state.WinningsLabel);
        ApplyHudText(view.BetText, state.BetLabel);
    }

    private static void RenderTopper(Theme1GameplayViewRoot root, Theme1TopperRenderState state)
    {
        Theme1TopperStripView view = root.TopperStrip;
        if (view == null || state == null || view.Slots == null)
        {
            return;
        }

        int slotCount = view.Slots.Length;
        for (int slotIndex = 0; slotIndex < slotCount; slotIndex++)
        {
            Theme1TopperSlotView slotView = view.Slots[slotIndex];
            Theme1TopperSlotRenderState slotState = state.Slots != null && slotIndex < state.Slots.Length
                ? state.Slots[slotIndex]
                : Theme1TopperSlotRenderState.Empty;

            SetActive(slotView.PatternRoot, slotState.ShowPattern);
            SetActive(slotView.MatchedPatternRoot, slotState.ShowMatchedPattern);
            ApplyTopperText(slotView.PrizeLabel, slotState.PrizeLabel, slotView.DefaultPrizeColor);

            if (slotView.PrizeLabel != null)
            {
                slotView.PrizeLabel.color = slotState.PrizeVisualState switch
                {
                    Theme1PrizeVisualState.Matched => MatchedPrizeColor,
                    Theme1PrizeVisualState.NearWin => NearWinPrizeColor,
                    _ => slotView.DefaultPrizeColor
                };
            }

            int missingCount = slotView.MissingCells != null ? slotView.MissingCells.Length : 0;
            for (int cellIndex = 0; cellIndex < missingCount; cellIndex++)
            {
                bool visible = slotState.MissingCellsVisible != null &&
                               cellIndex < slotState.MissingCellsVisible.Length &&
                               slotState.MissingCellsVisible[cellIndex];
                SetActive(slotView.MissingCells[cellIndex], visible);
            }
        }
    }

    private static void ApplyText(TMP_Text target, string value)
    {
        if (target == null)
        {
            return;
        }

        string normalizedValue = value ?? string.Empty;
        if (!target.enabled)
        {
            target.enabled = true;
        }

        if (!target.gameObject.activeSelf)
        {
            target.gameObject.SetActive(true);
        }

        if (!string.Equals(target.text, normalizedValue))
        {
            target.text = normalizedValue;
        }

        target.alpha = 1f;
        target.havePropertiesChanged = true;
        target.SetVerticesDirty();
        target.SetMaterialDirty();
        target.SetLayoutDirty();
    }

    private static void ApplyCardNumberText(TMP_Text target, string value)
    {
        if (target is TextMeshProUGUI label)
        {
            RealtimeTextStyleUtils.ApplyCardNumber(label, value ?? string.Empty);
            return;
        }

        ApplyText(target, value);
    }

    private static void ApplyBallNumberText(TMP_Text target, string value)
    {
        if (target is TextMeshProUGUI label)
        {
            RealtimeTextStyleUtils.ApplyBallNumber(label, value ?? string.Empty);
            return;
        }

        ApplyText(target, value);
    }

    private static void ApplyHudText(TMP_Text target, string value)
    {
        if (target is TextMeshProUGUI label)
        {
            RealtimeTextStyleUtils.ApplyHudText(label, value ?? string.Empty, preferredColor: label.color);
            return;
        }

        ApplyText(target, value);
    }

    private static void ApplyTopperText(TMP_Text target, string value, Color defaultColor)
    {
        if (target is TextMeshProUGUI label)
        {
            RealtimeTextStyleUtils.ApplyHudText(label, value ?? string.Empty, preferredColor: defaultColor);
            return;
        }

        ApplyText(target, value);
    }

    private static void SetActive(GameObject target, bool active)
    {
        if (target != null && target.activeSelf != active)
        {
            target.SetActive(active);
        }
    }
}
