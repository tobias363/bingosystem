using UnityEngine;

public static class Theme1BongStyle
{
    // Primary tune file for the runtime-generated Theme1 bong visuals.
    // Keep these values aligned with the CSS preview when tightening the Unity render.

    // Header/bet labels are part of the production contract and must remain active.
    public const bool ShowCardOverlayLabels = true;

    public const float ReferenceBoardWidth = 560f;
    public const float ReferenceBoardHeight = 373.33334f;

    public static readonly Color32 NumberColor = new(132, 3, 93, 255);
    public static readonly Color32 VisibleNumberMirrorColor = new(132, 3, 93, 255);
    public static readonly Color32 PrizeTextColor = new(132, 3, 93, 255);

    public static readonly Color32 ShellColor = new(255, 153, 220, 255);
    public static readonly Color32 ShellOutlineColor = new(255, 214, 238, 184);
    public static readonly Vector2 ShellOutlineDistance = new(2f, -2f);

    public static readonly Color32 ShellInnerColor = new(248, 88, 184, 255);
    public static readonly Color32 ShellInnerOutlineColor = new(218, 14, 126, 150);
    public static readonly Vector2 ShellInnerOutlineDistance = new(1f, -1f);
    public static readonly Color32 ShellChromeOuterColor = new(255, 214, 238, 164);
    public static readonly Color32 ShellChromeInnerColor = new(255, 120, 198, 92);
    public static readonly Color32 ShellGlossColor = new(255, 255, 255, 16);

    public static readonly Color32 TopPanelColor = new(251, 64, 172, 255);
    public static readonly Color32 TopPanelOutlineColor = new(173, 10, 102, 220);
    public static readonly Vector2 TopPanelOutlineDistance = new(2f, -2f);
    public static readonly Color32 TopPanelGlossColor = new(255, 255, 255, 30);

    public static readonly Color32 BottomPanelColor = new(248, 111, 199, 236);
    public static readonly Color32 BottomPanelOutlineColor = new(255, 171, 223, 110);
    public static readonly Vector2 BottomPanelOutlineDistance = new(1f, -1f);
    public static readonly Color32 BottomPanelGlossColor = new(255, 255, 255, 24);

    public static readonly Color32 BottomTabColor = new(251, 64, 172, 255);
    public static readonly Color32 BottomTabOutlineColor = new(173, 10, 102, 220);
    public static readonly Vector2 BottomTabOutlineDistance = new(2f, -2f);

    public static readonly Color32 GridFrameColor = new(255, 255, 255, 0);
    public static readonly Color32 GridFrameOutlineColor = new(255, 255, 255, 0);
    public static readonly Vector2 GridFrameOutlineDistance = new(1f, -1f);

    public static readonly Color32 NormalCellColor = new(244, 244, 244, 255);
    public static readonly Color32 SelectedCellColor = new(235, 213, 230, 255);
    public static readonly Color32 HighlightCellColor = new(143, 72, 133, 255);
    public static readonly Color32 HighlightCellTopColor = new(166, 96, 156, 255);
    public static readonly Color32 HighlightCellBottomColor = new(122, 58, 113, 255);
    public static readonly Color32 PrizeCellColor = new(233, 224, 112, 255);
    public static readonly Color32 PrizeCellTopColor = new(240, 231, 118, 255);
    public static readonly Color32 PrizeCellBottomColor = new(228, 214, 91, 255);
    public static readonly Color32 CellBorderColor = new(255, 255, 255, 0);
    public static readonly Vector2 CellOutlineDistance = new(1f, -1f);

    public static readonly Color32 SoftGlowColor = new(255, 255, 255, 255);
    public static readonly Color32 PaylineColor = new(116, 21, 149, 255);
    public const float PulseDuration = 0.92f;
    public const float PulsePeak = 0.48f;
    public const float PreviewPulseEmphasis = 0.84f;
    public const float PulseContentScaleMax = 1.14f;
    public const float PulseGlowScaleMin = 1.0f;
    public const float PulseGlowScaleMax = 1.14f;
    public const float PulseGlowAlphaMin = 0.5f;
    public const float PulseGlowAlphaMax = 1f;
    public const float PulseNumberOffsetY = -4f;
    public const float GlowMaterialStrengthIdle = 1.18f;
    public const float GlowMaterialStrengthPeak = 1.68f;
    public const float GlowMaterialPowerIdle = 1.55f;
    public const float GlowMaterialPowerPeak = 0.92f;
    public const float GlowBlurIntensityIdle = 0.56f;
    public const float GlowBlurIntensityPeak = 1f;
    public const float GlowBlurWidthIdle = 1.8f;
    public const float GlowBlurWidthPeak = 3.35f;
    public const float GlowBlendSoftAddIdle = 0.72f;
    public const float GlowBlendSoftAddPeak = 1f;

    public const float TopPanelHorizontalInset = 12f;
    public const float TopPanelHeight = 52f;
    public const float TopPanelTopOffset = 12f;

    public const float BottomPanelHorizontalInset = 14f;
    public const float BottomPanelHeight = 44f;
    public const float BottomPanelBottomOffset = 10f;

    public const float BottomTabWidth = 158f;
    public const float BottomTabHeight = 39f;
    public const float BottomTabBottomOffset = 13f;

    public const float GridLeftInset = 20f;
    public const float GridRightInset = 20f;
    public const float GridTopInset = 64f;
    public const float GridBottomInset = 58f;
    public const float GridGap = 2f;
    public const float ShellChromeOuterInset = 7f;
    public const float ShellChromeInnerInset = 14f;
    public const float GridFramePadding = 2f;
    public const float CellGlowWidthPadding = 68f;
    public const float CellGlowHeightPadding = 52f;
    public const float PaylineThickness = 10f;

    public static readonly Vector2 PrizeLabelSize = new(84f, 24f);
    public static readonly Vector2 PrizeLabelBottomCenter = new(0f, 5f);
    public static readonly Vector2 PrizeLabelBottomLeft = new(8f, 5f);
    public static readonly Vector2 PrizeLabelBottomRight = new(-8f, 5f);
    public const float PrizeLabelStackOffsetY = 18f;
}
