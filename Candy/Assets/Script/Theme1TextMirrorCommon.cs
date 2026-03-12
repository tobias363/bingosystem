using TMPro;
using UnityEngine;
using UnityEngine.UI;

internal static class Theme1TextMirrorCommon
{
    public static void EnsureTarget(Text target, Font preferredFont, Color color, int minFontSize, int maxFontSize)
    {
        if (target == null)
        {
            return;
        }

        if (target.font == null)
        {
            target.font = preferredFont != null
                ? preferredFont
                : Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }

        target.color = color;
        target.supportRichText = false;
        target.alignment = TextAnchor.MiddleCenter;
        target.horizontalOverflow = HorizontalWrapMode.Overflow;
        target.verticalOverflow = VerticalWrapMode.Overflow;
        target.resizeTextForBestFit = true;
        target.resizeTextMinSize = minFontSize;
        target.resizeTextMaxSize = maxFontSize;
        target.raycastTarget = false;
    }

    public static void CopyRectTransform(TMP_Text source, Text target)
    {
        RectTransform sourceRect = source != null ? source.rectTransform : null;
        RectTransform targetRect = target != null ? target.rectTransform : null;
        if (sourceRect == null || targetRect == null)
        {
            return;
        }

        targetRect.anchorMin = sourceRect.anchorMin;
        targetRect.anchorMax = sourceRect.anchorMax;
        targetRect.pivot = sourceRect.pivot;
        targetRect.anchoredPosition = sourceRect.anchoredPosition;
        targetRect.sizeDelta = sourceRect.sizeDelta;
        targetRect.localScale = Vector3.one;
        targetRect.localRotation = Quaternion.identity;
    }

    public static bool CopyRectTransformIfChanged(
        TMP_Text source,
        Text target,
        ref Vector2 lastAnchoredPosition,
        ref Vector2 lastSizeDelta)
    {
        RectTransform sourceRect = source != null ? source.rectTransform : null;
        RectTransform targetRect = target != null ? target.rectTransform : null;
        if (sourceRect == null || targetRect == null)
        {
            return false;
        }

        bool changed = false;
        if (sourceRect.anchorMin != targetRect.anchorMin)
        {
            targetRect.anchorMin = sourceRect.anchorMin;
            changed = true;
        }

        if (sourceRect.anchorMax != targetRect.anchorMax)
        {
            targetRect.anchorMax = sourceRect.anchorMax;
            changed = true;
        }

        if (sourceRect.pivot != targetRect.pivot)
        {
            targetRect.pivot = sourceRect.pivot;
            changed = true;
        }

        if (lastAnchoredPosition != sourceRect.anchoredPosition || targetRect.anchoredPosition != sourceRect.anchoredPosition)
        {
            targetRect.anchoredPosition = sourceRect.anchoredPosition;
            lastAnchoredPosition = sourceRect.anchoredPosition;
            changed = true;
        }

        if (lastSizeDelta != sourceRect.sizeDelta || targetRect.sizeDelta != sourceRect.sizeDelta)
        {
            targetRect.sizeDelta = sourceRect.sizeDelta;
            lastSizeDelta = sourceRect.sizeDelta;
            changed = true;
        }

        if (targetRect.localScale != Vector3.one)
        {
            targetRect.localScale = Vector3.one;
            changed = true;
        }

        if (targetRect.localRotation != Quaternion.identity)
        {
            targetRect.localRotation = Quaternion.identity;
            changed = true;
        }

        return changed;
    }

    public static bool ShouldHide(TMP_Text source, bool hideWhenSourceInactive, bool hideWhenBlank, string value)
    {
        return source == null ||
               (hideWhenSourceInactive && (!source.gameObject.activeInHierarchy || !source.enabled || source.alpha <= 0f)) ||
               (hideWhenBlank && string.IsNullOrWhiteSpace(value));
    }

    public static void ApplySourceFormatting(Text target, TMP_Text source, bool useColorOverride, Color colorOverride)
    {
        if (target == null || source == null)
        {
            return;
        }

        target.color = useColorOverride ? colorOverride : source.color;
        target.fontStyle = ConvertFontStyle(source.fontStyle);
        target.fontSize = Mathf.RoundToInt(source.fontSize > 0f ? source.fontSize : 36f);
        target.resizeTextMinSize = Mathf.RoundToInt(source.fontSizeMin > 0f ? source.fontSizeMin : 12f);
        target.resizeTextMaxSize = Mathf.RoundToInt(source.fontSizeMax > 0f ? source.fontSizeMax : 64f);
        target.alignment = ConvertAlignment(source.alignment);
    }

    public static bool ApplySourceFormattingIfChanged(
        Text target,
        TMP_Text source,
        bool useColorOverride,
        Color colorOverride,
        ref Color lastColor,
        ref FontStyle lastFontStyle,
        ref int lastFontSize,
        ref TextAnchor lastAlignment)
    {
        if (target == null || source == null)
        {
            return false;
        }

        bool changed = false;
        Color nextColor = useColorOverride ? colorOverride : source.color;
        if (lastColor != nextColor || target.color != nextColor)
        {
            target.color = nextColor;
            lastColor = nextColor;
            changed = true;
        }

        FontStyle nextFontStyle = ConvertFontStyle(source.fontStyle);
        if (lastFontStyle != nextFontStyle || target.fontStyle != nextFontStyle)
        {
            target.fontStyle = nextFontStyle;
            lastFontStyle = nextFontStyle;
            changed = true;
        }

        int nextFontSize = Mathf.RoundToInt(source.fontSize > 0f ? source.fontSize : 36f);
        if (lastFontSize != nextFontSize || target.fontSize != nextFontSize)
        {
            target.fontSize = nextFontSize;
            target.resizeTextMinSize = Mathf.RoundToInt(source.fontSizeMin > 0f ? source.fontSizeMin : 12f);
            target.resizeTextMaxSize = Mathf.RoundToInt(source.fontSizeMax > 0f ? source.fontSizeMax : 64f);
            lastFontSize = nextFontSize;
            changed = true;
        }

        TextAnchor nextAlignment = ConvertAlignment(source.alignment);
        if (lastAlignment != nextAlignment || target.alignment != nextAlignment)
        {
            target.alignment = nextAlignment;
            lastAlignment = nextAlignment;
            changed = true;
        }

        return changed;
    }

    public static void ApplyVisibility(Text target, bool shouldHide)
    {
        if (target == null)
        {
            return;
        }

        target.enabled = !shouldHide;
        if (target.gameObject.activeSelf != !shouldHide)
        {
            target.gameObject.SetActive(!shouldHide);
        }
    }

    public static FontStyle ConvertFontStyle(FontStyles sourceStyle)
    {
        bool bold = (sourceStyle & FontStyles.Bold) != 0;
        bool italic = (sourceStyle & FontStyles.Italic) != 0;
        if (bold && italic)
        {
            return FontStyle.BoldAndItalic;
        }

        if (bold)
        {
            return FontStyle.Bold;
        }

        if (italic)
        {
            return FontStyle.Italic;
        }

        return FontStyle.Normal;
    }

    public static TextAnchor ConvertAlignment(TextAlignmentOptions sourceAlignment)
    {
        return sourceAlignment switch
        {
            TextAlignmentOptions.TopLeft => TextAnchor.UpperLeft,
            TextAlignmentOptions.Top => TextAnchor.UpperCenter,
            TextAlignmentOptions.TopRight => TextAnchor.UpperRight,
            TextAlignmentOptions.Left => TextAnchor.MiddleLeft,
            TextAlignmentOptions.Right => TextAnchor.MiddleRight,
            TextAlignmentOptions.BottomLeft => TextAnchor.LowerLeft,
            TextAlignmentOptions.Bottom => TextAnchor.LowerCenter,
            TextAlignmentOptions.BottomRight => TextAnchor.LowerRight,
            _ => TextAnchor.MiddleCenter,
        };
    }
}
