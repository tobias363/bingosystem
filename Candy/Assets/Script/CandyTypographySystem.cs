using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TextCore.LowLevel;

public enum CandyTypographyRole
{
    Body,
    Label,
    Number,
    Headline
}

public static class CandyTypographySystem
{
    private const string RegularFontResourcePath = "CandyTypography/Fredoka/Fredoka-Regular";
    private const string SemiBoldFontResourcePath = "CandyTypography/Fredoka/Fredoka-SemiBold";
    private const string BoldFontResourcePath = "CandyTypography/Fredoka/Fredoka-Bold";

    private const string RegularTmpResourcePath = "CandyTypography/TMP/CandyFredokaRegularSDF";
    private const string SemiBoldTmpResourcePath = "CandyTypography/TMP/CandyFredokaSemiBoldSDF";
    private const string BoldTmpResourcePath = "CandyTypography/TMP/CandyFredokaBoldSDF";

    private static readonly string[] GameplaySceneNames =
    {
        "Theme1",
        "Theme2",
        "Bonus"
    };

    private static readonly string[] HeadlineKeywords =
    {
        "jackpot",
        "bonus",
        "title",
        "header",
        "logo",
        "topper",
        "prize",
        "collect",
        "winner"
    };

    private static readonly string[] NumberKeywords =
    {
        "card",
        "ball",
        "number",
        "bet",
        "credit",
        "win",
        "winning",
        "timer",
        "countdown",
        "room",
        "player",
        "spin",
        "extra",
        "missing",
        "payout",
        "deposit",
        "exit"
    };

    private static readonly Dictionary<CandyTypographyRole, TMP_FontAsset> CachedFonts = new();
    private static readonly Dictionary<CandyTypographyRole, Font> CachedSourceFonts = new();
    private static readonly string CommonCharacters =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
        ".,:;!?%+-_=()[]{}<>/\\|@#$&*'\" " +
        "æøåÆØÅ€£$krKRNeste rundeSpillere i rommetBONUSWINJACKPOT";

    public static bool IsGameplayScene(Scene scene)
    {
        if (!scene.IsValid())
        {
            return false;
        }

        string sceneName = scene.name ?? string.Empty;
        for (int i = 0; i < GameplaySceneNames.Length; i++)
        {
            if (string.Equals(sceneName, GameplaySceneNames[i], StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    public static TMP_FontAsset GetFont(CandyTypographyRole role)
    {
        if (CachedFonts.TryGetValue(role, out TMP_FontAsset cached) && IsFontAssetUsable(cached))
        {
            return cached;
        }

        TMP_FontAsset persistent = Resources.Load<TMP_FontAsset>(GetTmpResourcePath(role));
        if (IsFontAssetUsable(persistent))
        {
            EnsureRuntimeMaterial(persistent);
            EnsureFallbacks(persistent);
            CachedFonts[role] = persistent;
            return persistent;
        }

        Font sourceFont = GetSourceFont(role);
        if (sourceFont == null)
        {
            TMP_FontAsset fallback = ResolveSafeFallbackFontAsset();
            if (fallback != null)
            {
                CachedFonts[role] = fallback;
            }

            return fallback;
        }

        TMP_FontAsset generated = TMP_FontAsset.CreateFontAsset(
            sourceFont,
            GetSamplingPointSize(role),
            8,
            GlyphRenderMode.SDFAA,
            GetAtlasSize(role),
            GetAtlasSize(role),
            AtlasPopulationMode.Dynamic,
            true);

        if (generated == null)
        {
            TMP_FontAsset fallback = ResolveSafeFallbackFontAsset();
            if (fallback != null)
            {
                CachedFonts[role] = fallback;
            }

            return fallback;
        }

        generated.name = "Runtime " + GetTmpAssetName(role);
        EnsureRuntimeMaterial(generated);
        EnsureFallbacks(generated);
        TryAddCommonCharacters(generated);
        if (IsFontAssetUsable(generated))
        {
            CachedFonts[role] = generated;
            return generated;
        }

        TMP_FontAsset safeFallback = ResolveSafeFallbackFontAsset();
        if (safeFallback != null)
        {
            CachedFonts[role] = safeFallback;
        }

        return safeFallback;
    }

    public static void ApplyRole(TMP_Text target, CandyTypographyRole role, bool preserveColor = true)
    {
        if (target == null)
        {
            return;
        }

        TMP_FontAsset fontAsset = GetFont(role);
        if (fontAsset == null)
        {
            return;
        }

        Color existingColor = target.color;
        bool wasWrapping = target.enableWordWrapping;
        float currentSize = target.fontSize;
        bool wasAutoSizing = target.enableAutoSizing;

        target.font = fontAsset;
        if (fontAsset.material != null)
        {
            target.fontSharedMaterial = fontAsset.material;
        }

        target.fontStyle = FontStyles.Normal;
        target.fontWeight = ResolveWeight(role);
        target.enableWordWrapping = role == CandyTypographyRole.Body && wasWrapping;
        target.textWrappingMode = role == CandyTypographyRole.Body
            ? TextWrappingModes.Normal
            : TextWrappingModes.NoWrap;
        target.overflowMode = role == CandyTypographyRole.Body
            ? TextOverflowModes.Overflow
            : TextOverflowModes.Overflow;
        target.enableAutoSizing = wasAutoSizing;
        ApplyRoleSizeBounds(target, role, currentSize);

        if (preserveColor)
        {
            target.color = existingColor;
        }

        target.havePropertiesChanged = true;
        target.UpdateMeshPadding();
        target.SetVerticesDirty();
        target.SetLayoutDirty();
        target.ForceMeshUpdate(ignoreActiveState: true, forceTextReparsing: true);
    }

    public static CandyTypographyRole Classify(TMP_Text target)
    {
        if (target == null)
        {
            return CandyTypographyRole.Body;
        }

        string objectPath = BuildObjectPath(target.transform).ToLowerInvariant();
        string currentFontName = target.font != null ? target.font.name.ToLowerInvariant() : string.Empty;
        string value = target.text != null ? target.text.ToLowerInvariant() : string.Empty;
        float size = Mathf.Max(target.fontSize, target.fontSizeMax);

        if (ContainsAny(currentFontName, "impact", "impacted") ||
            ContainsAny(objectPath, HeadlineKeywords) ||
            size >= 42f)
        {
            return CandyTypographyRole.Headline;
        }

        if (ContainsAny(currentFontName, "fredokaone", "oswald", "roboto-bold") ||
            ContainsAny(objectPath, NumberKeywords) ||
            ContainsAny(value, "jackpot", "bonus", "win", "bet", "credit", "kr", "€") ||
            LooksNumeric(value) ||
            size >= 22f)
        {
            return CandyTypographyRole.Number;
        }

        if (ContainsAny(objectPath, "button", "btn", "label", "rules", "play", "auto", "collect"))
        {
            return CandyTypographyRole.Label;
        }

        return CandyTypographyRole.Body;
    }

    public static int ApplyToScene(Scene scene)
    {
        if (!IsGameplayScene(scene))
        {
            return 0;
        }

        int updatedCount = 0;
        GameObject[] roots = scene.GetRootGameObjects();
        for (int i = 0; i < roots.Length; i++)
        {
            TMP_Text[] texts = roots[i].GetComponentsInChildren<TMP_Text>(true);
            for (int j = 0; j < texts.Length; j++)
            {
                TMP_Text text = texts[j];
                if (text == null)
                {
                    continue;
                }

                ApplyRole(text, Classify(text));
                updatedCount += 1;
            }
        }

        return updatedCount;
    }

    public static void ClearCaches()
    {
        CachedFonts.Clear();
        CachedSourceFonts.Clear();
    }

    public static string GetTmpAssetName(CandyTypographyRole role)
    {
        return role switch
        {
            CandyTypographyRole.Headline => "CandyFredokaBoldSDF",
            CandyTypographyRole.Number => "CandyFredokaSemiBoldSDF",
            CandyTypographyRole.Label => "CandyFredokaSemiBoldSDF",
            _ => "CandyFredokaRegularSDF"
        };
    }

    private static string GetTmpResourcePath(CandyTypographyRole role)
    {
        return role switch
        {
            CandyTypographyRole.Headline => BoldTmpResourcePath,
            CandyTypographyRole.Number => SemiBoldTmpResourcePath,
            CandyTypographyRole.Label => SemiBoldTmpResourcePath,
            _ => RegularTmpResourcePath
        };
    }

    private static Font GetSourceFont(CandyTypographyRole role)
    {
        if (CachedSourceFonts.TryGetValue(role, out Font cached) && cached != null)
        {
            return cached;
        }

        string resourcePath = role switch
        {
            CandyTypographyRole.Headline => BoldFontResourcePath,
            CandyTypographyRole.Number => SemiBoldFontResourcePath,
            CandyTypographyRole.Label => SemiBoldFontResourcePath,
            _ => RegularFontResourcePath
        };

        Font font = Resources.Load<Font>(resourcePath);
        if (font != null)
        {
            CachedSourceFonts[role] = font;
        }

        return font;
    }

    private static int GetSamplingPointSize(CandyTypographyRole role)
    {
        return role switch
        {
            CandyTypographyRole.Headline => 120,
            CandyTypographyRole.Number => 112,
            CandyTypographyRole.Label => 104,
            _ => 96
        };
    }

    private static int GetAtlasSize(CandyTypographyRole role)
    {
        return role switch
        {
            CandyTypographyRole.Headline => 4096,
            CandyTypographyRole.Number => 2048,
            CandyTypographyRole.Label => 2048,
            _ => 2048
        };
    }

    private static FontWeight ResolveWeight(CandyTypographyRole role)
    {
        return role switch
        {
            CandyTypographyRole.Headline => FontWeight.Bold,
            CandyTypographyRole.Number => FontWeight.SemiBold,
            CandyTypographyRole.Label => FontWeight.SemiBold,
            _ => FontWeight.Regular
        };
    }

    private static void ApplyRoleSizeBounds(TMP_Text target, CandyTypographyRole role, float currentSize)
    {
        float safeCurrentSize = Mathf.Max(10f, currentSize);
        switch (role)
        {
            case CandyTypographyRole.Headline:
                target.fontSize = safeCurrentSize;
                target.fontSizeMin = Mathf.Max(20f, Mathf.Min(safeCurrentSize, 30f));
                target.fontSizeMax = Mathf.Max(target.fontSizeMin + 8f, 120f);
                break;
            case CandyTypographyRole.Number:
                target.fontSize = safeCurrentSize;
                target.fontSizeMin = Mathf.Max(14f, Mathf.Min(safeCurrentSize, 22f));
                target.fontSizeMax = Mathf.Max(target.fontSizeMin + 8f, 72f);
                break;
            case CandyTypographyRole.Label:
                target.fontSize = safeCurrentSize;
                target.fontSizeMin = Mathf.Max(12f, Mathf.Min(safeCurrentSize, 18f));
                target.fontSizeMax = Mathf.Max(target.fontSizeMin + 8f, 56f);
                break;
            default:
                target.fontSize = safeCurrentSize;
                target.fontSizeMin = Mathf.Max(10f, Mathf.Min(safeCurrentSize, 16f));
                target.fontSizeMax = Mathf.Max(target.fontSizeMin + 8f, 40f);
                break;
        }
    }

    private static void TryAddCommonCharacters(TMP_FontAsset fontAsset)
    {
        if (fontAsset == null)
        {
            return;
        }

        try
        {
            fontAsset.TryAddCharacters(CommonCharacters, out _, true);
        }
        catch
        {
        }
    }

    private static void EnsureFallbacks(TMP_FontAsset fontAsset)
    {
        if (fontAsset == null)
        {
            return;
        }

        TMP_FontAsset fallback = ResolveSafeFallbackFontAsset();

        if (fallback == null || fallback == fontAsset)
        {
            return;
        }

        fontAsset.fallbackFontAssetTable ??= new List<TMP_FontAsset>();
        if (!fontAsset.fallbackFontAssetTable.Contains(fallback))
        {
            fontAsset.fallbackFontAssetTable.Add(fallback);
        }
    }

    private static void EnsureRuntimeMaterial(TMP_FontAsset fontAsset)
    {
        if (fontAsset == null || fontAsset.material != null || !TryGetAtlasTexture(fontAsset, out Texture2D atlasTexture))
        {
            return;
        }

        ShaderUtilities.GetShaderPropertyIDs();
        Shader distanceFieldShader = Shader.Find("TextMeshPro/Mobile/Distance Field") ??
                                     Shader.Find("TextMeshPro/Distance Field");
        if (distanceFieldShader == null)
        {
            return;
        }

        Material material = new Material(distanceFieldShader)
        {
            name = fontAsset.name + " Material"
        };
        material.SetTexture(ShaderUtilities.ID_MainTex, atlasTexture);
        material.SetFloat(ShaderUtilities.ID_TextureWidth, atlasTexture.width);
        material.SetFloat(ShaderUtilities.ID_TextureHeight, atlasTexture.height);
        material.SetFloat(ShaderUtilities.ID_GradientScale, 9f);
        material.SetFloat(ShaderUtilities.ID_WeightNormal, fontAsset.normalStyle);
        material.SetFloat(ShaderUtilities.ID_WeightBold, fontAsset.boldStyle);
        fontAsset.material = material;
    }

    private static TMP_FontAsset ResolveSafeFallbackFontAsset()
    {
        TMP_FontAsset liberationSans = Resources.Load<TMP_FontAsset>("Fonts _ Materials/LiberationSans SDF");
        if (IsFontAssetUsable(liberationSans))
        {
            return liberationSans;
        }

        TMP_FontAsset liberationSansFallback = Resources.Load<TMP_FontAsset>("Fonts _ Materials/LiberationSans SDF - Fallback");
        if (IsFontAssetUsable(liberationSansFallback))
        {
            return liberationSansFallback;
        }

        return IsFontAssetUsable(TMP_Settings.defaultFontAsset) ? TMP_Settings.defaultFontAsset : null;
    }

    private static bool IsFontAssetUsable(TMP_FontAsset fontAsset)
    {
        return TryGetAtlasTexture(fontAsset, out _);
    }

    private static bool TryGetAtlasTexture(TMP_FontAsset fontAsset, out Texture2D atlasTexture)
    {
        atlasTexture = null;
        if (fontAsset == null)
        {
            return false;
        }

        try
        {
            atlasTexture = fontAsset.atlasTexture;
            return atlasTexture != null;
        }
        catch (Exception)
        {
            return false;
        }
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

    private static bool ContainsAny(string value, params string[] needles)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        for (int i = 0; i < needles.Length; i++)
        {
            if (value.IndexOf(needles[i], StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }
        }

        return false;
    }

    private static bool LooksNumeric(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        int digitCount = 0;
        for (int i = 0; i < value.Length; i++)
        {
            if (char.IsDigit(value[i]))
            {
                digitCount += 1;
            }
        }

        return digitCount >= 1 && digitCount >= value.Length / 2;
    }
}
