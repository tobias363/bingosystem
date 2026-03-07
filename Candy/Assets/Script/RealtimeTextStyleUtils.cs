using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public static class RealtimeTextStyleUtils
{
    private static readonly Color DefaultCardNumberColor = new Color32(184, 51, 99, 255);
    private static readonly Color DefaultBallNumberColor = Color.white;
    private static readonly Color DefaultHudTextColor = Color.white;
    private static readonly Dictionary<int, Material> BallTextMaterials = new Dictionary<int, Material>();

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

    public static void ApplyCardNumber(TextMeshProUGUI target, string value, TMP_FontAsset fallbackFont = null)
    {
        Apply(
            target,
            value,
            DefaultCardNumberColor,
            fallbackFont != null ? fallbackFont : CandyTypographySystem.GetFont(CandyTypographyRole.Number),
            forceStableFallback: false,
            preserveExistingFont: false);
        CandyTypographySystem.ApplyRole(target, CandyTypographyRole.Number);
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
        CandyTypographySystem.ApplyRole(target, CandyTypographyRole.Number);
        ApplyBallTextPresentation(target);
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
        CandyTypographySystem.ApplyRole(target, CandyTypographyRole.Label);
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

        TMP_FontAsset resolvedFont = preferredFont != null ? preferredFont : CandyTypographySystem.GetFont(CandyTypographyRole.Body);
        if (target.font == null && resolvedFont != null)
        {
            target.font = resolvedFont;
            if (resolvedFont.material != null)
            {
                target.fontSharedMaterial = resolvedFont.material;
            }
        }

        target.textWrappingMode = TextWrappingModes.NoWrap;
        target.enableAutoSizing = true;
        target.fontSizeMin = Mathf.Clamp(minFontSize, 10f, 72f);
        target.fontSizeMax = Mathf.Clamp(maxFontSize, target.fontSizeMin, 96f);
        target.overflowMode = TextOverflowModes.Overflow;
        CandyTypographySystem.ApplyRole(target, CandyTypographyRole.Body);
    }

    private static void Apply(
        TextMeshProUGUI target,
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
        target.enabled = true;
        if (!target.gameObject.activeSelf)
        {
            target.gameObject.SetActive(true);
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

            if (resolvedFallback.material != null && target.fontSharedMaterial != resolvedFallback.material)
            {
                target.fontSharedMaterial = resolvedFallback.material;
            }
        }
        else if (target.font != null && target.font.material != null)
        {
            target.fontSharedMaterial = target.font.material;
        }

        if (preserveExistingFont &&
            target.fontSharedMaterial == null &&
            target.font != null &&
            target.font.material != null)
        {
            target.fontSharedMaterial = target.font.material;
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
                if (stableFallback.material != null)
                {
                    target.fontSharedMaterial = stableFallback.material;
                }

                ForceRefresh(target, forceTextReparsing: true);
            }
        }
    }

    private static void ApplyBallTextPresentation(TextMeshProUGUI target)
    {
        if (target == null)
        {
            return;
        }

        target.fontStyle = FontStyles.Normal;
        target.fontWeight = FontWeight.Regular;
        target.textWrappingMode = TextWrappingModes.NoWrap;
        target.characterSpacing = 0f;
        target.wordSpacing = 0f;
        target.lineSpacing = 0f;

        Material sourceMaterial = target.fontSharedMaterial != null
            ? target.fontSharedMaterial
            : (target.font != null ? target.font.material : null);
        if (sourceMaterial == null)
        {
            return;
        }

        int targetId = target.GetInstanceID();
        if (!BallTextMaterials.TryGetValue(targetId, out Material runtimeMaterial) ||
            runtimeMaterial == null)
        {
            runtimeMaterial = new Material(sourceMaterial)
            {
                name = sourceMaterial.name + " (CandyBallRuntime)"
            };
            BallTextMaterials[targetId] = runtimeMaterial;
        }

        DisableKeyword(runtimeMaterial, "UNDERLAY_ON");
        DisableKeyword(runtimeMaterial, "UNDERLAY_INNER");
        DisableKeyword(runtimeMaterial, "OUTLINE_ON");
        SetFloatIfPresent(runtimeMaterial, "_OutlineWidth", 0f);
        SetFloatIfPresent(runtimeMaterial, "_OutlineSoftness", 0f);
        SetFloatIfPresent(runtimeMaterial, "_FaceDilate", 0f);
        SetFloatIfPresent(runtimeMaterial, "_UnderlaySoftness", 0f);
        SetFloatIfPresent(runtimeMaterial, "_UnderlayDilate", 0f);
        SetFloatIfPresent(runtimeMaterial, "_UnderlayOffsetX", 0f);
        SetFloatIfPresent(runtimeMaterial, "_UnderlayOffsetY", 0f);
        SetColorIfPresent(runtimeMaterial, "_UnderlayColor", new Color(0f, 0f, 0f, 0f));
        SetColorIfPresent(runtimeMaterial, "_OutlineColor", new Color(0f, 0f, 0f, 0f));

        if (target.fontMaterial != runtimeMaterial)
        {
            target.fontMaterial = runtimeMaterial;
        }

        target.UpdateMeshPadding();
        ForceRefresh(target, forceTextReparsing: false);
    }

    private static void DisableKeyword(Material material, string keyword)
    {
        if (material == null || string.IsNullOrWhiteSpace(keyword))
        {
            return;
        }

        material.DisableKeyword(keyword);
    }

    private static void SetFloatIfPresent(Material material, string propertyName, float value)
    {
        if (material != null && material.HasProperty(propertyName))
        {
            material.SetFloat(propertyName, value);
        }
    }

    private static void SetColorIfPresent(Material material, string propertyName, Color value)
    {
        if (material != null && material.HasProperty(propertyName))
        {
            material.SetColor(propertyName, value);
        }
    }

    public static string BuildHealthSummary(TextMeshProUGUI target)
    {
        if (target == null)
        {
            return "target=null";
        }

        string fontName = target.font != null ? target.font.name : "null";
        string materialName = target.fontSharedMaterial != null ? target.fontSharedMaterial.name : "null";
        string rectSize = target.rectTransform != null
            ? $"{target.rectTransform.rect.width:0.#}x{target.rectTransform.rect.height:0.#}"
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
            $"font={fontName} material={materialName} rect={rectSize} autosize={target.enableAutoSizing} " +
            $"chars={characterCount} text='{value}'";
    }

    private static void ForceRefresh(TextMeshProUGUI target, bool forceTextReparsing)
    {
        if (target == null)
        {
            return;
        }

        target.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: forceTextReparsing);
        if (target.rectTransform != null)
        {
            LayoutRebuilder.ForceRebuildLayoutImmediate(target.rectTransform);
        }

        Canvas.ForceUpdateCanvases();
        target.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: false);
    }

    private static bool ShouldForceStableFallback(TextMeshProUGUI target, string value)
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

    private static void EnsureReasonableRect(TextMeshProUGUI target)
    {
        if (target == null || target.rectTransform == null)
        {
            return;
        }

        RectTransform rect = target.rectTransform;
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
}
