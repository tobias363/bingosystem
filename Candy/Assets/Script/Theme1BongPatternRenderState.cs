using System;

public enum Theme1WinLabelAnchor
{
    BottomCenter = 0,
    BottomLeft = 1,
    BottomRight = 2
}

public enum Theme1PatternOverlayKind
{
    None = 0,
    HorizontalLine = 1,
    SvgStroke = 2,
    SvgMask = 3
}

public enum Theme1CardCellVisualState
{
    Normal = 0,
    NearHit = 1,
    NearTarget = 2,
    WonHit = 3,
    WonPrize = 4
}

public sealed class Theme1CompletedPatternRenderState
{
    public int RawPatternIndex = -1;
    public int SlotIndex = -1;
    public int[] CellIndices = Array.Empty<int>();
    public int TriggerCellIndex = -1;
    public int TriggerNumber;
    public int PrizeAmountKr;
    public string PrizeLabel = string.Empty;
    public Theme1WinLabelAnchor PrizeAnchor = Theme1WinLabelAnchor.BottomCenter;
    public Theme1PatternOverlayKind OverlayKind = Theme1PatternOverlayKind.None;
}

public sealed class Theme1NearPatternRenderState
{
    public int RawPatternIndex = -1;
    public int SlotIndex = -1;
    public int[] CellIndices = Array.Empty<int>();
    public int[] MatchedCellIndices = Array.Empty<int>();
    public int TargetCellIndex = -1;
    public int TargetNumber;
    public int PrizeAmountKr;
    public string PrizeLabel = string.Empty;
    public Theme1WinLabelAnchor PrizeAnchor = Theme1WinLabelAnchor.BottomCenter;
    public Theme1PatternOverlayKind OverlayKind = Theme1PatternOverlayKind.None;
}
