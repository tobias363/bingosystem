using System;

public enum Theme1PrizeVisualState
{
    Normal = 0,
    NearWin = 1,
    Matched = 2
}

public sealed class Theme1RoundRenderState
{
    public string GameId = string.Empty;
    public Theme1CardRenderState[] Cards = Array.Empty<Theme1CardRenderState>();
    public Theme1BallRackRenderState BallRack = new Theme1BallRackRenderState();
    public Theme1HudRenderState Hud = new Theme1HudRenderState();
    public Theme1TopperRenderState Topper = new Theme1TopperRenderState();

    public static Theme1RoundRenderState CreateEmpty(int cardCount, int ballSlotCount, int topperSlotCount)
    {
        Theme1RoundRenderState state = new Theme1RoundRenderState
        {
            Cards = new Theme1CardRenderState[Math.Max(0, cardCount)],
            BallRack = Theme1BallRackRenderState.CreateEmpty(ballSlotCount),
            Topper = Theme1TopperRenderState.CreateEmpty(topperSlotCount)
        };

        for (int i = 0; i < state.Cards.Length; i++)
        {
            state.Cards[i] = Theme1CardRenderState.CreateEmpty();
        }

        return state;
    }
}

public sealed class Theme1CardRenderState
{
    public string HeaderLabel = string.Empty;
    public string BetLabel = string.Empty;
    public string WinLabel = string.Empty;
    public bool ShowWinLabel;
    public Theme1CardCellRenderState[] Cells = new Theme1CardCellRenderState[15];
    public bool[] PaylinesActive = Array.Empty<bool>();
    public int[] MatchedPatternIndexes = Array.Empty<int>();
    public Theme1CompletedPatternRenderState[] CompletedPatterns = Array.Empty<Theme1CompletedPatternRenderState>();
    public Theme1NearPatternRenderState ActiveNearPattern;

    public static Theme1CardRenderState CreateEmpty()
    {
        Theme1CardRenderState state = new Theme1CardRenderState();
        for (int i = 0; i < state.Cells.Length; i++)
        {
            state.Cells[i] = Theme1CardCellRenderState.Empty;
        }

        return state;
    }
}

public readonly struct Theme1CellPrizeLabelRenderState
{
    public Theme1CellPrizeLabelRenderState(
        string text,
        Theme1WinLabelAnchor anchor,
        int prizeAmountKr,
        int rawPatternIndex)
    {
        Text = text ?? string.Empty;
        Anchor = anchor;
        PrizeAmountKr = prizeAmountKr;
        RawPatternIndex = rawPatternIndex;
    }

    public string Text { get; }
    public Theme1WinLabelAnchor Anchor { get; }
    public int PrizeAmountKr { get; }
    public int RawPatternIndex { get; }
}

public readonly struct Theme1CardCellRenderState
{
    public static readonly Theme1CardCellRenderState Empty =
        new Theme1CardCellRenderState(
            "-",
            false,
            false,
            false,
            -1,
            0,
            Array.Empty<int>(),
            Theme1CardCellVisualState.Normal,
            false,
            false,
            string.Empty,
            Theme1WinLabelAnchor.BottomCenter,
            Array.Empty<int>(),
            Array.Empty<Theme1CellPrizeLabelRenderState>());

    public Theme1CardCellRenderState(
        string numberLabel,
        bool isSelected,
        bool isMissing,
        bool isMatched,
        int nearWinPatternIndex = -1,
        int missingNumber = 0,
        int[] nearWinPatternIndexes = null,
        Theme1CardCellVisualState visualState = Theme1CardCellVisualState.Normal,
        bool isPrizeCell = false,
        bool isNearTargetCell = false,
        string prizeLabel = "",
        Theme1WinLabelAnchor prizeAnchor = Theme1WinLabelAnchor.BottomCenter,
        int[] completedPatternIndexes = null,
        Theme1CellPrizeLabelRenderState[] prizeLabels = null)
    {
        NumberLabel = numberLabel ?? string.Empty;
        IsSelected = isSelected;
        IsMissing = isMissing;
        IsMatched = isMatched;
        if (nearWinPatternIndexes != null && nearWinPatternIndexes.Length > 0)
        {
            NearWinPatternIndexes = (int[])nearWinPatternIndexes.Clone();
            NearWinPatternIndex = NearWinPatternIndexes[0];
        }
        else
        {
            NearWinPatternIndexes = nearWinPatternIndex >= 0 ? new[] { nearWinPatternIndex } : Array.Empty<int>();
            NearWinPatternIndex = nearWinPatternIndex;
        }
        MissingNumber = missingNumber;
        VisualState = visualState;
        IsPrizeCell = isPrizeCell;
        IsNearTargetCell = isNearTargetCell;
        PrizeLabels = prizeLabels != null && prizeLabels.Length > 0
            ? (Theme1CellPrizeLabelRenderState[])prizeLabels.Clone()
            : BuildLegacyPrizeLabels(prizeLabel, prizeAnchor, nearWinPatternIndex, completedPatternIndexes);
        if (PrizeLabels.Length > 0)
        {
            PrizeLabel = PrizeLabels[0].Text ?? string.Empty;
            PrizeAnchor = PrizeLabels[0].Anchor;
        }
        else
        {
            PrizeLabel = prizeLabel ?? string.Empty;
            PrizeAnchor = prizeAnchor;
        }
        CompletedPatternIndexes = completedPatternIndexes != null && completedPatternIndexes.Length > 0
            ? (int[])completedPatternIndexes.Clone()
            : Array.Empty<int>();
    }

    public string NumberLabel { get; }
    public bool IsSelected { get; }
    public bool IsMissing { get; }
    public bool IsMatched { get; }
    public int NearWinPatternIndex { get; }
    public int[] NearWinPatternIndexes { get; }
    public int MissingNumber { get; }
    public Theme1CardCellVisualState VisualState { get; }
    public bool IsPrizeCell { get; }
    public bool IsNearTargetCell { get; }
    public string PrizeLabel { get; }
    public Theme1WinLabelAnchor PrizeAnchor { get; }
    public Theme1CellPrizeLabelRenderState[] PrizeLabels { get; }
    public int[] CompletedPatternIndexes { get; }

    private static Theme1CellPrizeLabelRenderState[] BuildLegacyPrizeLabels(
        string prizeLabel,
        Theme1WinLabelAnchor prizeAnchor,
        int nearWinPatternIndex,
        int[] completedPatternIndexes)
    {
        if (string.IsNullOrWhiteSpace(prizeLabel))
        {
            return Array.Empty<Theme1CellPrizeLabelRenderState>();
        }

        int rawPatternIndex = nearWinPatternIndex;
        if (completedPatternIndexes != null && completedPatternIndexes.Length > 0)
        {
            rawPatternIndex = completedPatternIndexes[0];
        }

        return new[]
        {
            new Theme1CellPrizeLabelRenderState(prizeLabel, prizeAnchor, 0, rawPatternIndex)
        };
    }
}

public sealed class Theme1BallRackRenderState
{
    public bool ShowBigBall;
    public string BigBallNumber = string.Empty;
    public bool ShowBallMachine;
    public bool ShowExtraBallMachine;
    public bool ShowBallOutMachine = true;
    public Theme1BallSlotRenderState[] Slots = Array.Empty<Theme1BallSlotRenderState>();

    public static Theme1BallRackRenderState CreateEmpty(int slotCount)
    {
        Theme1BallRackRenderState state = new Theme1BallRackRenderState
        {
            Slots = new Theme1BallSlotRenderState[Math.Max(0, slotCount)]
        };

        for (int i = 0; i < state.Slots.Length; i++)
        {
            state.Slots[i] = Theme1BallSlotRenderState.Empty;
        }

        return state;
    }
}

public readonly struct Theme1BallSlotRenderState
{
    public static readonly Theme1BallSlotRenderState Empty = new Theme1BallSlotRenderState(false, string.Empty);

    public Theme1BallSlotRenderState(bool isVisible, string numberLabel)
    {
        IsVisible = isVisible;
        NumberLabel = numberLabel ?? string.Empty;
    }

    public bool IsVisible { get; }
    public string NumberLabel { get; }
}

public sealed class Theme1HudRenderState
{
    public string CountdownLabel = string.Empty;
    public string PlayerCountLabel = string.Empty;
    public string CreditLabel = string.Empty;
    public string WinningsLabel = string.Empty;
    public string BetLabel = string.Empty;
}

public sealed class Theme1TopperRenderState
{
    public Theme1TopperSlotRenderState[] Slots = Array.Empty<Theme1TopperSlotRenderState>();

    public static Theme1TopperRenderState CreateEmpty(int slotCount)
    {
        Theme1TopperRenderState state = new Theme1TopperRenderState
        {
            Slots = new Theme1TopperSlotRenderState[Math.Max(0, slotCount)]
        };

        for (int i = 0; i < state.Slots.Length; i++)
        {
            state.Slots[i] = Theme1TopperSlotRenderState.Empty;
        }

        return state;
    }
}

public sealed class Theme1TopperSlotRenderState
{
    public static readonly Theme1TopperSlotRenderState Empty = new Theme1TopperSlotRenderState();

    public string PrizeLabel = string.Empty;
    public bool ShowPattern = true;
    public bool ShowMatchedPattern;
    public bool[] MissingCellsVisible = Array.Empty<bool>();
    public Theme1PrizeVisualState PrizeVisualState = Theme1PrizeVisualState.Normal;
    public int[] ActivePatternIndexes = Array.Empty<int>();
    public int[] ActiveCardIndexes = Array.Empty<int>();
}

public sealed class Theme1StateBuildInput
{
    public string GameId = string.Empty;
    public int CardSlotCount = 4;
    public int VisibleCardCount = 4;
    public int CurrentTicketPage;
    public bool DuplicateSingleTicketAcrossCards = true;
    public int BallSlotCount = 30;
    public int[] DrawnNumbers = Array.Empty<int>();
    public int[][] TicketSets = Array.Empty<int[]>();
    public int[] ActivePatternIndexes = Array.Empty<int>();
    public int[] PreferredNearPatternIndexesByCard = Array.Empty<int>();
    public byte[][] PatternMasks = Array.Empty<byte[]>();
    public string[] CardHeaderLabels = Array.Empty<string>();
    public string[] CardBetLabels = Array.Empty<string>();
    public string[] CardWinLabels = Array.Empty<string>();
    public string[] TopperPrizeLabels = Array.Empty<string>();
    public int[] TopperPayoutAmounts = Array.Empty<int>();
    public string CountdownLabel = string.Empty;
    public string PlayerCountLabel = string.Empty;
    public string CreditLabel = string.Empty;
    public string WinningsLabel = string.Empty;
    public string BetLabel = string.Empty;
}
