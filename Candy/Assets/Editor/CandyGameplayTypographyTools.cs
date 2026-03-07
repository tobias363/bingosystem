#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TextCore.LowLevel;

public static class CandyGameplayTypographyTools
{
    private const string FredokaRootDirectory = "Assets/Resources/CandyTypography/Fredoka";
    private const string TmpOutputDirectory = "Assets/Resources/CandyTypography/TMP";

    private static readonly string[] GameplayScenePaths =
    {
        "Assets/Scenes/Theme1.unity",
        "Assets/Scenes/Theme2.unity",
        "Assets/Scenes/Bonus.unity"
    };

    [InitializeOnLoadMethod]
    private static void EnsureTypographyAssetsOnEditorLoad()
    {
        EditorApplication.delayCall += () =>
        {
            if (ResolveGeneratedFontAsset(CandyTypographyRole.Body) != null &&
                ResolveGeneratedFontAsset(CandyTypographyRole.Number) != null &&
                ResolveGeneratedFontAsset(CandyTypographyRole.Headline) != null &&
                ResolveGeneratedFontAsset(CandyTypographyRole.Body).material != null &&
                ResolveGeneratedFontAsset(CandyTypographyRole.Number).material != null &&
                ResolveGeneratedFontAsset(CandyTypographyRole.Headline).material != null)
            {
                return;
            }

            try
            {
                GenerateOrRefreshFredokaTmpAssets(logSummary: false);
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[CandyTypography] Klarte ikke autogenerere Fredoka TMP assets: " + ex.Message);
            }
        };
    }

    [MenuItem("Candy/Typography/Generate Fredoka TMP Assets")]
    public static void GenerateFredokaTmpAssetsMenu()
    {
        GenerateOrRefreshFredokaTmpAssets(logSummary: true);
    }

    [MenuItem("Candy/Typography/Apply Fredoka To Gameplay Scenes")]
    public static void ApplyFredokaToGameplayScenesMenu()
    {
        GenerateOrRefreshFredokaTmpAssets(logSummary: false);
        ApplyFredokaToGameplayScenes(logSummary: true);
    }

    [MenuItem("Candy/Typography/Audit Gameplay Typography")]
    public static void AuditGameplayTypographyMenu()
    {
        AuditGameplayTypography(logSummary: true);
    }

    [MenuItem("Candy/Typography/Validate Gameplay Typography")]
    public static void ValidateGameplayTypographyMenu()
    {
        ValidateGameplayTypography(logSummary: true);
    }

    public static void GenerateFredokaTmpAssetsCli()
    {
        GenerateOrRefreshFredokaTmpAssets(logSummary: true);
    }

    public static void ApplyFredokaToGameplayScenesCli()
    {
        GenerateOrRefreshFredokaTmpAssets(logSummary: false);
        ApplyFredokaToGameplayScenes(logSummary: true);
    }

    public static void AuditGameplayTypographyCli()
    {
        AuditGameplayTypography(logSummary: true);
    }

    public static void ValidateGameplayTypographyCli()
    {
        ValidateGameplayTypography(logSummary: true);
    }

    public static TMP_FontAsset ResolveGeneratedFontAsset(CandyTypographyRole role)
    {
        string assetPath = Path.Combine(TmpOutputDirectory, CandyTypographySystem.GetTmpAssetName(role) + ".asset").Replace("\\", "/");
        return AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(assetPath);
    }

    private static void GenerateOrRefreshFredokaTmpAssets(bool logSummary)
    {
        Directory.CreateDirectory(Path.Combine(Application.dataPath, "Resources/CandyTypography/TMP"));

        CreateFontAssetIfMissing("Fredoka-Regular.ttf", CandyTypographyRole.Body);
        CreateFontAssetIfMissing("Fredoka-SemiBold.ttf", CandyTypographyRole.Number);
        CreateFontAssetIfMissing("Fredoka-Bold.ttf", CandyTypographyRole.Headline);

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        CandyTypographySystem.ClearCaches();

        if (logSummary)
        {
            Debug.Log("[CandyTypography] Fredoka TMP assets generert eller bekreftet.");
        }
    }

    private static void ApplyFredokaToGameplayScenes(bool logSummary)
    {
        int totalUpdated = 0;
        for (int i = 0; i < GameplayScenePaths.Length; i++)
        {
            string scenePath = GameplayScenePaths[i];
            Scene scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            int updatedCount = CandyTypographySystem.ApplyToScene(scene);
            totalUpdated += updatedCount;
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
        }

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        ValidateGameplayTypography(logSummary: false);

        if (logSummary)
        {
            Debug.Log($"[CandyTypography] Oppdatert {totalUpdated} TMP-tekstobjekter i gameplay-scener.");
        }
    }

    private static void AuditGameplayTypography(bool logSummary)
    {
        Dictionary<string, int> countsByFontPath = new();
        for (int i = 0; i < GameplayScenePaths.Length; i++)
        {
            Scene scene = EditorSceneManager.OpenScene(GameplayScenePaths[i], OpenSceneMode.Single);
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                TMP_Text[] texts = root.GetComponentsInChildren<TMP_Text>(true);
                for (int j = 0; j < texts.Length; j++)
                {
                    TMP_Text label = texts[j];
                    string assetPath = label != null && label.font != null
                        ? AssetDatabase.GetAssetPath(label.font)
                        : "<null>";
                    countsByFontPath.TryGetValue(assetPath, out int currentCount);
                    countsByFontPath[assetPath] = currentCount + 1;
                }
            }
        }

        if (!logSummary)
        {
            return;
        }

        foreach (KeyValuePair<string, int> entry in countsByFontPath)
        {
            Debug.Log($"[CandyTypographyAudit] {entry.Key} => {entry.Value}");
        }
    }

    private static void ValidateGameplayTypography(bool logSummary)
    {
        List<string> errors = new();
        for (int i = 0; i < GameplayScenePaths.Length; i++)
        {
            Scene scene = EditorSceneManager.OpenScene(GameplayScenePaths[i], OpenSceneMode.Single);
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                TMP_Text[] texts = root.GetComponentsInChildren<TMP_Text>(true);
                for (int j = 0; j < texts.Length; j++)
                {
                    TMP_Text label = texts[j];
                    if (label == null)
                    {
                        continue;
                    }

                    string assetPath = label.font != null ? AssetDatabase.GetAssetPath(label.font) : string.Empty;
                    if (string.IsNullOrWhiteSpace(assetPath) ||
                        assetPath.StartsWith(TmpOutputDirectory, StringComparison.Ordinal))
                    {
                        continue;
                    }

                    errors.Add($"{scene.name}: {label.gameObject.name} bruker legacy font {assetPath}");
                }
            }
        }

        if (errors.Count == 0)
        {
            if (logSummary)
            {
                Debug.Log("[CandyTypography] Gameplay-typografi validert uten legacy font-referanser.");
            }

            return;
        }

        string message = "[CandyTypography] Legacy font-referanser funnet:\n" + string.Join("\n", errors);
        if (logSummary)
        {
            Debug.LogError(message);
        }

        throw new InvalidOperationException(message);
    }

    private static void CreateFontAssetIfMissing(string sourceFileName, CandyTypographyRole role)
    {
        string outputPath = Path.Combine(TmpOutputDirectory, CandyTypographySystem.GetTmpAssetName(role) + ".asset").Replace("\\", "/");
        TMP_FontAsset existing = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(outputPath);
        if (existing != null)
        {
            EnsurePersistentSubAssets(existing, outputPath);
            EditorUtility.SetDirty(existing);
            return;
        }

        string fontAssetPath = Path.Combine(FredokaRootDirectory, sourceFileName).Replace("\\", "/");
        Font sourceFont = AssetDatabase.LoadAssetAtPath<Font>(fontAssetPath);
        if (sourceFont == null)
        {
            throw new InvalidOperationException($"[CandyTypography] Fant ikke kildeskrift: {fontAssetPath}");
        }

        TMP_FontAsset generated = TMP_FontAsset.CreateFontAsset(
            sourceFont,
            role == CandyTypographyRole.Headline ? 120 : role == CandyTypographyRole.Number ? 112 : 96,
            8,
            GlyphRenderMode.SDFAA,
            role == CandyTypographyRole.Headline ? 4096 : 2048,
            role == CandyTypographyRole.Headline ? 4096 : 2048,
            AtlasPopulationMode.Dynamic,
            true);
        if (generated == null)
        {
            throw new InvalidOperationException($"[CandyTypography] Klarte ikke lage TMP asset for {fontAssetPath}");
        }

        generated.name = CandyTypographySystem.GetTmpAssetName(role);
        TMP_FontAsset fallback = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(
            "Assets/TextMesh Pro/Resources/Fonts _ Materials/LiberationSans SDF - Fallback.asset");
        if (fallback != null)
        {
            generated.fallbackFontAssetTable = new List<TMP_FontAsset> { fallback };
        }

        generated.TryAddCharacters(
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
            ".,:;!?%+-_=()[]{}<>/\\|@#$&*'\" æøåÆØÅ€£$krKRNeste rundeSpillere i rommetBONUSWINJACKPOT",
            out _,
            true);

        AssetDatabase.CreateAsset(generated, outputPath);
        EnsurePersistentSubAssets(generated, outputPath);
        EditorUtility.SetDirty(generated);
    }

    private static void EnsurePersistentSubAssets(TMP_FontAsset fontAsset, string outputPath)
    {
        if (fontAsset == null)
        {
            return;
        }

        if (fontAsset.atlasTexture != null)
        {
            fontAsset.atlasTexture.name = fontAsset.name + " Atlas";
            if (!AssetDatabase.Contains(fontAsset.atlasTexture))
            {
                AssetDatabase.AddObjectToAsset(fontAsset.atlasTexture, outputPath);
            }
        }

        if (fontAsset.material == null && fontAsset.atlasTexture != null)
        {
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
            material.SetTexture(ShaderUtilities.ID_MainTex, fontAsset.atlasTexture);
            material.SetFloat(ShaderUtilities.ID_TextureWidth, fontAsset.atlasTexture.width);
            material.SetFloat(ShaderUtilities.ID_TextureHeight, fontAsset.atlasTexture.height);
            material.SetFloat(ShaderUtilities.ID_GradientScale, 9f);
            material.SetFloat(ShaderUtilities.ID_WeightNormal, fontAsset.normalStyle);
            material.SetFloat(ShaderUtilities.ID_WeightBold, fontAsset.boldStyle);
            fontAsset.material = material;
        }

        if (fontAsset.material != null && !AssetDatabase.Contains(fontAsset.material))
        {
            AssetDatabase.AddObjectToAsset(fontAsset.material, outputPath);
        }
    }
}
#endif
