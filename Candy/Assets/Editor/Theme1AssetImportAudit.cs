using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

public static class Theme1AssetImportAudit
{
    private const string Prefix = "[Theme1AssetAudit]";
    private const int TargetMaxTextureSize = 4096;
    private const int TargetSvgPixelsPerUnit = 256;
    private const int TargetSvgGradientResolution = 1024;
    private static readonly string[] Roots =
    {
        "Assets/Resources/Theme1",
        "Assets/UI/UI_Theme1"
    };

    [MenuItem("Candy/Theme1/Audit Theme1 Asset Imports")]
    public static void AuditTheme1AssetImportsMenu()
    {
        bool ok = Audit(logSummary: true, out string report);
        if (!ok)
        {
            throw new InvalidOperationException(report);
        }
    }

    [MenuItem("Candy/Theme1/Apply Theme1 Asset Import Policy")]
    public static void ApplyTheme1AssetImportPolicyMenu()
    {
        ApplyPolicy(logSummary: true);
    }

    public static void AuditTheme1AssetImportsCli()
    {
        bool ok = ValidatePolicy(logSummary: true, out string report);
        if (!ok)
        {
            throw new InvalidOperationException(report);
        }
    }

    public static void ApplyTheme1AssetImportPolicyCli()
    {
        ApplyPolicy(logSummary: true);
    }

    public static bool ValidatePolicy(bool logSummary, out string report)
    {
        return Audit(logSummary, out report);
    }

    private static void ApplyPolicy(bool logSummary)
    {
        string[] textureGuids = AssetDatabase.FindAssets("t:Texture2D", Roots);
        int updated = 0;

        for (int i = 0; i < textureGuids.Length; i++)
        {
            string path = AssetDatabase.GUIDToAssetPath(textureGuids[i]);
            TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null)
            {
                continue;
            }

            if (ApplyRecommendedTextureSettings(importer))
            {
                importer.SaveAndReimport();
                updated++;
            }
        }

        string[] svgMetaPaths = EnumerateSvgMetaPaths();
        for (int i = 0; i < svgMetaPaths.Length; i++)
        {
            if (ApplyRecommendedSvgMetaSettings(svgMetaPaths[i]))
            {
                updated++;
            }
        }

        if (logSummary)
        {
            Debug.Log($"{Prefix} Oppdaterte {updated} Theme1 textures til skarp gameplay-policy.");
        }
    }

    private static bool Audit(bool logSummary, out string report)
    {
        string[] textureGuids = AssetDatabase.FindAssets("t:Texture2D", Roots);
        StringBuilder builder = new StringBuilder();
        bool ok = true;

        for (int i = 0; i < textureGuids.Length; i++)
        {
            string path = AssetDatabase.GUIDToAssetPath(textureGuids[i]);
            TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null)
            {
                continue;
            }

            List<string> issues = CollectIssues(importer);
            if (issues.Count == 0)
            {
                continue;
            }

            ok = false;
            builder.AppendLine(path);
            for (int j = 0; j < issues.Count; j++)
            {
                builder.AppendLine("  - " + issues[j]);
            }
        }

        string[] svgMetaPaths = EnumerateSvgMetaPaths();
        for (int i = 0; i < svgMetaPaths.Length; i++)
        {
            List<string> issues = CollectSvgMetaIssues(svgMetaPaths[i]);
            if (issues.Count == 0)
            {
                continue;
            }

            ok = false;
            builder.AppendLine(GetAssetPathFromMeta(svgMetaPaths[i]));
            for (int j = 0; j < issues.Count; j++)
            {
                builder.AppendLine("  - " + issues[j]);
            }
        }

        report = ok
            ? $"{Prefix} OK"
            : $"{Prefix}{Environment.NewLine}{builder}";
        if (logSummary)
        {
            if (ok)
            {
                Debug.Log(report);
            }
            else
            {
                Debug.LogError(report);
            }
        }

        return ok;
    }

    private static bool ApplyRecommendedTextureSettings(TextureImporter importer)
    {
        bool changed = false;

        if (importer.textureCompression != TextureImporterCompression.Uncompressed)
        {
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            changed = true;
        }

        if (importer.compressionQuality != 100)
        {
            importer.compressionQuality = 100;
            changed = true;
        }

        if (importer.crunchedCompression)
        {
            importer.crunchedCompression = false;
            changed = true;
        }

        if (importer.mipmapEnabled)
        {
            importer.mipmapEnabled = false;
            changed = true;
        }

        if (importer.streamingMipmaps)
        {
            importer.streamingMipmaps = false;
            changed = true;
        }

        if (importer.maxTextureSize < TargetMaxTextureSize)
        {
            importer.maxTextureSize = TargetMaxTextureSize;
            changed = true;
        }

        if (importer.filterMode != FilterMode.Bilinear)
        {
            importer.filterMode = FilterMode.Bilinear;
            changed = true;
        }

        if (!importer.alphaIsTransparency)
        {
            importer.alphaIsTransparency = true;
            changed = true;
        }

        changed |= ConfigurePlatform(importer, "Standalone");
        changed |= ConfigurePlatform(importer, "WebGL");
        return changed;
    }

    private static List<string> CollectIssues(TextureImporter importer)
    {
        List<string> issues = new List<string>();
        if (importer.textureCompression != TextureImporterCompression.Uncompressed)
        {
            issues.Add($"textureCompression={importer.textureCompression}");
        }

        if (importer.compressionQuality != 100)
        {
            issues.Add($"compressionQuality={importer.compressionQuality}");
        }

        if (importer.crunchedCompression)
        {
            issues.Add("crunchedCompression=true");
        }

        if (importer.mipmapEnabled)
        {
            issues.Add("mipmapEnabled=true");
        }

        if (importer.streamingMipmaps)
        {
            issues.Add("streamingMipmaps=true");
        }

        if (importer.maxTextureSize < TargetMaxTextureSize)
        {
            issues.Add($"maxTextureSize={importer.maxTextureSize}");
        }

        TextureImporterPlatformSettings standalone = importer.GetPlatformTextureSettings("Standalone");
        AppendPlatformIssues("Standalone", standalone, issues);
        TextureImporterPlatformSettings webgl = importer.GetPlatformTextureSettings("WebGL");
        AppendPlatformIssues("WebGL", webgl, issues);
        return issues;
    }

    private static void AppendPlatformIssues(string platformName, TextureImporterPlatformSettings platform, List<string> issues)
    {
        if (!platform.overridden)
        {
            issues.Add($"{platformName}: overridden=false");
        }

        if (platform.maxTextureSize < TargetMaxTextureSize)
        {
            issues.Add($"{platformName}: maxTextureSize={platform.maxTextureSize}");
        }

        if (platform.textureCompression != TextureImporterCompression.Uncompressed)
        {
            issues.Add($"{platformName}: textureCompression={platform.textureCompression}");
        }

        if (platform.compressionQuality != 100)
        {
            issues.Add($"{platformName}: compressionQuality={platform.compressionQuality}");
        }
    }

    private static bool ConfigurePlatform(TextureImporter importer, string platformName)
    {
        TextureImporterPlatformSettings platform = importer.GetPlatformTextureSettings(platformName);
        bool changed = false;

        if (!platform.overridden)
        {
            platform.overridden = true;
            changed = true;
        }

        if (platform.maxTextureSize < TargetMaxTextureSize)
        {
            platform.maxTextureSize = TargetMaxTextureSize;
            changed = true;
        }

        if (platform.textureCompression != TextureImporterCompression.Uncompressed)
        {
            platform.textureCompression = TextureImporterCompression.Uncompressed;
            changed = true;
        }

        if (platform.compressionQuality != 100)
        {
            platform.compressionQuality = 100;
            changed = true;
        }

        if (platform.crunchedCompression)
        {
            platform.crunchedCompression = false;
            changed = true;
        }

        if (changed)
        {
            importer.SetPlatformTextureSettings(platform);
        }

        return changed;
    }

    private static string[] EnumerateSvgMetaPaths()
    {
        string projectRoot = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
        List<string> results = new List<string>();
        for (int i = 0; i < Roots.Length; i++)
        {
            string fullRoot = Path.GetFullPath(Path.Combine(projectRoot, Roots[i]));
            if (!Directory.Exists(fullRoot))
            {
                continue;
            }

            results.AddRange(Directory.GetFiles(fullRoot, "*.svg.meta", SearchOption.AllDirectories));
        }

        return results.ToArray();
    }

    private static bool ApplyRecommendedSvgMetaSettings(string fullMetaPath)
    {
        if (!File.Exists(fullMetaPath))
        {
            return false;
        }

        string original = File.ReadAllText(fullMetaPath);
        string updated = original;
        updated = ReplaceYamlValue(updated, "svgPixelsPerUnit", TargetSvgPixelsPerUnit.ToString());
        updated = ReplaceYamlValue(updated, "gradientResolution", TargetSvgGradientResolution.ToString());
        updated = ReplaceYamlValue(updated, "useSVGPixelsPerUnit", "1");
        if (string.Equals(original, updated, StringComparison.Ordinal))
        {
            return false;
        }

        File.WriteAllText(fullMetaPath, updated);
        string assetPath = GetAssetPathFromMeta(fullMetaPath);
        AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceUpdate);
        return true;
    }

    private static List<string> CollectSvgMetaIssues(string fullMetaPath)
    {
        List<string> issues = new List<string>();
        if (!File.Exists(fullMetaPath))
        {
            return issues;
        }

        string text = File.ReadAllText(fullMetaPath);
        int svgPixelsPerUnit = ReadYamlInt(text, "svgPixelsPerUnit");
        int gradientResolution = ReadYamlInt(text, "gradientResolution");
        int useSvgPixelsPerUnit = ReadYamlInt(text, "useSVGPixelsPerUnit");

        if (svgPixelsPerUnit < TargetSvgPixelsPerUnit)
        {
            issues.Add($"svgPixelsPerUnit={svgPixelsPerUnit}");
        }

        if (gradientResolution < TargetSvgGradientResolution)
        {
            issues.Add($"gradientResolution={gradientResolution}");
        }

        if (useSvgPixelsPerUnit != 1)
        {
            issues.Add($"useSVGPixelsPerUnit={useSvgPixelsPerUnit}");
        }

        return issues;
    }

    private static int ReadYamlInt(string yaml, string key)
    {
        string marker = key + ":";
        int markerIndex = yaml.IndexOf(marker, StringComparison.Ordinal);
        if (markerIndex < 0)
        {
            return 0;
        }

        int valueStart = markerIndex + marker.Length;
        int valueEnd = yaml.IndexOf('\n', valueStart);
        if (valueEnd < 0)
        {
            valueEnd = yaml.Length;
        }

        string rawValue = yaml.Substring(valueStart, valueEnd - valueStart).Trim();
        return int.TryParse(rawValue, out int parsedValue) ? parsedValue : 0;
    }

    private static string ReplaceYamlValue(string yaml, string key, string value)
    {
        string marker = key + ":";
        int markerIndex = yaml.IndexOf(marker, StringComparison.Ordinal);
        if (markerIndex < 0)
        {
            return yaml;
        }

        int valueStart = markerIndex + marker.Length;
        int valueEnd = yaml.IndexOf('\n', valueStart);
        if (valueEnd < 0)
        {
            valueEnd = yaml.Length;
        }

        return yaml.Substring(0, valueStart) + " " + value + yaml.Substring(valueEnd);
    }

    private static string GetAssetPathFromMeta(string fullMetaPath)
    {
        string projectRoot = Path.GetFullPath(Path.Combine(Application.dataPath, "..")) + Path.DirectorySeparatorChar;
        string fullAssetPath = fullMetaPath.EndsWith(".meta", StringComparison.Ordinal)
            ? fullMetaPath.Substring(0, fullMetaPath.Length - ".meta".Length)
            : fullMetaPath;
        string relative = fullAssetPath.Replace(projectRoot, string.Empty);
        return relative.Replace(Path.DirectorySeparatorChar, '/');
    }
}
