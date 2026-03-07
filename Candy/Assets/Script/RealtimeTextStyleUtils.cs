using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public enum GameplayTextSurface
{
    CardNumber,
    CardHeader,
    HudLabel,
    TopperValue,
    BallNumber
}

public static class RealtimeTextStyleUtils
{
    private static readonly Color DefaultCardNumberColor = new Color32(184, 51, 99, 255);
    private static readonly Color DefaultBallNumberColor = Color.white;
    private static readonly Color DefaultHudTextColor = Color.white;

    public static TMP_FontAsset ResolveFallbackFont()
    {
        return CandyTypographySystem.GetFont(CandyTypographyRole.Body);
    }

    public static TMP_FontAsset ResolvePreferredGameFont()
    {
        return CandyTypographySystem.GetFont(CandyTypographyRole.Number);
    }

    public static TMP_FontAsset ResolveStableFallbackFont()
    {
        TMP_FontAsset preferred = CandyTypographySystem.GetFont(CandyTypographyRole.Label);
        return preferred != null
            ? preferred
            : (TMP_Settings.defaultFontAsset != null ? TMP_Settings.defaultFontAsset : ResolveFallbackFont());
    }

    public static GameplayTextSurface ClassifyGameplaySurface(TMP_Text target)
    {
        if (target == null)
        {
            return GameplayTextSurface.HudLabel;
        }

        string objectPath = BuildObjectPath(target.transform).ToLowerInvariant();
        string value = (target.text ?? string.Empty).Trim().ToLowerInvariant();

        if ((objectPath.Contains("ball") &&
             !objectPath.Contains("countdown") &&
             !objectPath.Contains("playercount") &&
             !objectPath.Contains("roomplayer")) ||
            objectPath.Contains("bigball") ||
            objectPath.Contains("extraball"))
        {
            return GameplayTextSurface.BallNumber;
        }

        if (objectPath.Contains("topper") ||
            objectPath.Contains("prize") ||
            objectPath.Contains("payout") ||
            objectPath.Contains("displaycurrentpoints") ||
            objectPath.Contains("currentpoints") ||
            (value.Contains("kr") && !value.StartsWith("bet", StringComparison.Ordinal)))
        {
            return GameplayTextSurface.TopperValue;
        }

        if (value.StartsWith("card", StringComparison.Ordinal) ||
            objectPath.Contains("cardheader") ||
            objectPath.Contains("cardtitle") ||
            objectPath.Contains("cardname"))
        {
            return GameplayTextSurface.CardHeader;
        }

        if (objectPath.Contains("card") &&
            (objectPath.Contains("num") ||
             objectPath.Contains("number") ||
             LooksNumericLabel(value)))
        {
            return GameplayTextSurface.CardNumber;
        }

        return GameplayTextSurface.HudLabel;
    }

    public static void ApplyGameplayTextPresentation(
        TMP_Text target,
        CandyTypographyRole role,
        GameplayTextSurface surface,
        bool preserveExistingFont = false)
    {
        if (target == null)
        {
            return;
        }

        EnsureReasonableRect(target);
        if (Application.isPlaying)
        {
            target.enabled = true;
            if (!target.gameObject.activeSelf)
            {
                target.gameObject.SetActive(true);
            }
        }

        target.fontStyle = FontStyles.Normal;
        target.textWrappingMode = TextWrappingModes.NoWrap;
        target.overflowMode = TextOverflowModes.Overflow;

        if (surface == GameplayTextSurface.BallNumber)
        {
            target.characterSpacing = 0f;
            target.wordSpacing = 0f;
            target.lineSpacing = 0f;
        }

        CandyTypographySystem.ApplyGameplayRole(
            target,
            role,
            surface,
            preserveColor: true,
            preserveExistingFont: preserveExistingFont);
        ForceRefresh(target, forceTextReparsing: true);
    }

    public static void ApplyCardNumber(TextMeshProUGUI target, string value, TMP_FontAsset fallbackFont = null)
    {
        Apply(
            target,
            value,
            DefaultCardNumberColor,
            fallbackFont != null ? fallbackFont : CandyTypographySystem.GetFont(CandyTypographyRole.Number),
            forceStableFallback: false,
            preserveExistingFont: false);
        ApplyGameplayTextPresentation(target, CandyTypographyRole.Number, GameplayTextSurface.CardNumber);
    }

    public static void ApplyBallNumber(TextMeshProUGUI target, string value, TMP_FontAsset fallbackFont = null)
    {
        Apply(
            target,
            value,
            DefaultBallNumberColor,
            fallbackFont != null ? fallbackFont : CandyTypographySystem.GetFont(CandyTypographyRole.Number),
            forceStableFallback: true,
            preserveExistingFont: false);
        ApplyGameplayTextPresentation(target, CandyTypographyRole.Number, GameplayTextSurface.BallNumber);
    }

    public static void ApplyHudText(
        TextMeshProUGUI target,
        string value,
        TMP_FontAsset fallbackFont = null,
        Color? preferredColor = null)
    {
        Color color = preferredColor ?? DefaultHudTextColor;
        if (Mathf.Approximately(color.a, 0f))
        {
            color.a = 1f;
        }

        Apply(
            target,
            value,
            color,
            fallbackFont != null ? fallbackFont : CandyTypographySystem.GetFont(CandyTypographyRole.Label),
            forceStableFallback: true,
            preserveExistingFont: false);
        ApplyGameplayTextPresentation(target, CandyTypographyRole.Label, GameplayTextSurface.HudLabel);
    }

    public static void ApplyReadableTypography(
        TextMeshProUGUI target,
        TMP_FontAsset preferredFont = null,
        float minFontSize = 18f,
        float maxFontSize = 56f)
    {
        if (target == null)
        {
            return;
        }

        CandyTypographyRole role = CandyTypographySystem.Classify(target);
        GameplayTextSurface surface = ClassifyGameplaySurface(target);
        TMP_FontAsset resolvedFont = preferredFont != null ? preferredFont : CandyTypographySystem.GetFont(role);
        if (target.font == null && resolvedFont != null)
        {
            target.font = resolvedFont;
        }

        target.textWrappingMode = TextWrappingModes.NoWrap;
        target.enableAutoSizing = true;
        target.fontSizeMin = Mathf.Clamp(minFontSize, 10f, 72f);
        target.fontSizeMax = Mathf.Clamp(maxFontSize, target.fontSizeMin, 96f);
        target.overflowMode = TextOverflowModes.Overflow;
        ApplyGameplayTextPresentation(
            target,
            role,
            surface,
            preserveExistingFont: preferredFont != null && target.font == resolvedFont);
    }

    private static void Apply(
        TMP_Text target,
        string value,
        Color preferredColor,
        TMP_FontAsset fallbackFont,
        bool forceStableFallback,
        bool preserveExistingFont)
    {
        if (target == null)
        {
            return;
        }

        EnsureReasonableRect(target);
        if (Application.isPlaying)
        {
            target.enabled = true;
            if (!target.gameObject.activeSelf)
            {
                target.gameObject.SetActive(true);
            }
        }

        TMP_FontAsset resolvedFallback = forceStableFallback
            ? ResolveStableFallbackFont()
            : (fallbackFont != null ? fallbackFont : ResolveFallbackFont());

        bool shouldReplaceFont = !preserveExistingFont || target.font == null;
        if (resolvedFallback != null && shouldReplaceFont)
        {
            if (target.font != resolvedFallback)
            {
                target.font = resolvedFallback;
            }
        }

        Color color = preferredColor;
        color.a = 1f;
        target.color = color;
        target.fontStyle = FontStyles.Normal;
        target.fontWeight = FontWeight.Regular;
        target.textWrappingMode = TextWrappingModes.NoWrap;
        target.overflowMode = TextOverflowModes.Overflow;

        target.alpha = 1f;
        target.text = value;
        target.havePropertiesChanged = true;
        target.SetVerticesDirty();
        target.SetMaterialDirty();
        target.SetLayoutDirty();
        ForceRefresh(target, forceTextReparsing: true);

        if (ShouldForceStableFallback(target, value))
        {
            TMP_FontAsset stableFallback = ResolveStableFallbackFont();
            if (stableFallback != null && target.font != stableFallback)
            {
                target.font = stableFallback;
                ForceRefresh(target, forceTextReparsing: true);
            }
        }
    }

    public static string BuildHealthSummary(TextMeshProUGUI target)
    {
        if (target == null)
        {
            return "target=null";
        }

        string fontName = target.font != null ? target.font.name : "null";
        Material material = target.fontSharedMaterial;
        string materialName = material != null ? material.name : "null";
        RectTransform rect = TryGetRectTransform(target);
        string rectSize = rect != null
            ? $"{rect.rect.width:0.#}x{rect.rect.height:0.#}"
            : "no-rect";
        string value = target.text ?? string.Empty;
        if (value.Length > 24)
        {
            value = value.Substring(0, 24) + "...";
        }

        int characterCount = 0;
        try
        {
            target.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: false);
            characterCount = target.textInfo != null ? target.textInfo.characterCount : 0;
        }
        catch
        {
            characterCount = -1;
        }

        return
            $"name={target.gameObject.name} active={target.gameObject.activeInHierarchy} enabled={target.enabled} " +
            $"alpha={target.alpha:0.##} color={target.color.r:0.##}/{target.color.g:0.##}/{target.color.b:0.##}/{target.color.a:0.##} " +
            $"font={fontName} material={materialName} faceA={ReadFaceAlpha(material):0.##} rect={rectSize} autosize={target.enableAutoSizing} " +
            $"chars={characterCount} text='{value}'";
    }

    private static void ForceRefresh(TMP_Text target, bool forceTextReparsing)
    {
        if (target == null)
        {
            return;
        }

        target.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: forceTextReparsing);
        RectTransform rect = TryGetRectTransform(target);
        if (rect != null)
        {
            LayoutRebuilder.ForceRebuildLayoutImmediate(rect);
            Canvas.ForceUpdateCanvases();
        }

        target.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: false);
    }

    private static bool ShouldForceStableFallback(TMP_Text target, string value)
    {
        if (target == null || string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (target.textInfo == null || target.textInfo.characterCount > 0)
        {
            return false;
        }

        return true;
    }

    private static void EnsureReasonableRect(TMP_Text target)
    {
        RectTransform rect = TryGetRectTransform(target);
        if (rect == null)
        {
            return;
        }

        Rect currentRect = rect.rect;
        if (currentRect.width > 1f && currentRect.height > 1f)
        {
            return;
        }

        Vector2 preferredSize = Vector2.zero;
        if (rect.parent != null)
        {
            GridLayoutGroup grid = rect.parent.GetComponent<GridLayoutGroup>();
            if (grid != null)
            {
                preferredSize = grid.cellSize;
            }

            if (preferredSize.x <= 1f || preferredSize.y <= 1f)
            {
                RectTransform parentRect = rect.parent as RectTransform;
                if (parentRect != null && parentRect.rect.width > 1f && parentRect.rect.height > 1f)
                {
                    preferredSize = parentRect.rect.size;
                }
            }
        }

        if (preferredSize.x <= 1f)
        {
            preferredSize.x = 36f;
        }

        if (preferredSize.y <= 1f)
        {
            preferredSize.y = 24f;
        }

        rect.sizeDelta = preferredSize;
        rect.localScale = Vector3.one;
    }

    private static RectTransform TryGetRectTransform(TMP_Text target)
    {
        if (target is TextMeshProUGUI uiText)
        {
            return uiText.rectTransform;
        }

        return target != null ? target.transform as RectTransform : null;
    }

    private static string BuildObjectPath(Transform target)
    {
        if (target == null)
        {
            return string.Empty;
        }

        string path = target.name;
        Transform current = target.parent;
        while (current != null)
        {
            path = current.name + "/" + path;
            current = current.parent;
        }

        return path;
    }

    private static bool LooksNumericLabel(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        bool sawDigit = false;
        for (int i = 0; i < value.Length; i++)
        {
            char current = value[i];
            if (char.IsDigit(current))
            {
                sawDigit = true;
                continue;
            }

            if (!char.IsWhiteSpace(current) &&
                current != '-' &&
                current != '+' &&
                current != '=' &&
                current != ':' &&
                current != '.' &&
                current != ',' &&
                current != 'k' &&
                current != 'r')
            {
                return false;
            }
        }

        return sawDigit;
    }

    private static float ReadFaceAlpha(Material material)
    {
        if (material == null)
        {
            return 0f;
        }

        if (material.HasProperty("_FaceColor"))
        {
            return material.GetColor("_FaceColor").a;
        }

        return 1f;
    }
}
