using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class WebGLBuild
{
    [MenuItem("Tools/Candy/Build/WebGL")]
    public static void BuildWebGLFromMenu()
    {
        BuildWebGLInternal(GetDefaultOutputPath());
    }

    public static void BuildWebGLFromCommandLine()
    {
        string outputPath = GetCommandLineArgValue("-customBuildPath");
        if (string.IsNullOrWhiteSpace(outputPath))
        {
            outputPath = GetDefaultOutputPath();
        }

        string releaseVersion = GetCommandLineArgValue("-releaseVersion");
        if (string.IsNullOrWhiteSpace(releaseVersion))
        {
            releaseVersion = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        }

        string releaseCommit = GetCommandLineArgValue("-releaseCommit");
        if (string.IsNullOrWhiteSpace(releaseCommit))
        {
            releaseCommit = "unknown";
        }

        BuildWebGLInternal(outputPath, releaseVersion, releaseCommit);
    }

    private static string GetDefaultOutputPath()
    {
        return Path.GetFullPath(Path.Combine(Application.dataPath, "..", "CandyBuilds", "WebGL"));
    }

    private static string GetCommandLineArgValue(string key)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], key, StringComparison.Ordinal))
            {
                return args[i + 1];
            }
        }

        return string.Empty;
    }

    private static void BuildWebGLInternal(string outputPath)
    {
        BuildWebGLInternal(outputPath, "local-editor", "workspace");
    }

    private static void BuildWebGLInternal(string outputPath, string releaseVersion, string releaseCommit)
    {
        Theme1ProductionGuardrails.AssertBuildReady();

        string[] scenes = EditorBuildSettings.scenes
            .Where(scene => scene.enabled)
            .Select(scene => scene.path)
            .ToArray();

        if (scenes.Length == 0)
        {
            throw new Exception("[WebGLBuild] Ingen aktive scener i Build Settings.");
        }

        Directory.CreateDirectory(outputPath);

        Debug.Log($"[WebGLBuild] Starter build til: {outputPath}");
        Debug.Log($"[WebGLBuild] Scener: {string.Join(", ", scenes)}");
        Debug.Log($"[WebGLBuild] ReleaseVersion: {releaseVersion} | Commit: {releaseCommit}");

        BuildPlayerOptions options = new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = outputPath,
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        };

        BuildReport report = BuildPipeline.BuildPlayer(options);
        BuildSummary summary = report.summary;

        Debug.Log(
            $"[WebGLBuild] Resultat: {summary.result} | Tid: {summary.totalTime} | " +
            $"Warnings: {summary.totalWarnings} | Errors: {summary.totalErrors} | Size: {summary.totalSize} bytes"
        );

        if (summary.result != BuildResult.Succeeded)
        {
            throw new Exception($"[WebGLBuild] Build feilet med status: {summary.result}");
        }

        string cacheBustToken = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        PostProcessWebGLTemplate(outputPath, cacheBustToken);
        WriteReleaseMetadata(outputPath, releaseVersion, releaseCommit, summary.totalSize);
    }

    [Serializable]
    private sealed class ReleaseMetadata
    {
        public string releaseVersion;
        public string releaseCommit;
        public string builtAtUtc;
        public string unityVersion;
        public string bundleVersion;
        public string productName;
        public long buildSizeBytes;
    }

    private static void WriteReleaseMetadata(string outputPath, string releaseVersion, string releaseCommit, ulong buildSizeBytes)
    {
        ReleaseMetadata metadata = new ReleaseMetadata
        {
            releaseVersion = string.IsNullOrWhiteSpace(releaseVersion) ? "unknown" : releaseVersion.Trim(),
            releaseCommit = string.IsNullOrWhiteSpace(releaseCommit) ? "unknown" : releaseCommit.Trim(),
            builtAtUtc = DateTime.UtcNow.ToString("o"),
            unityVersion = Application.unityVersion,
            bundleVersion = PlayerSettings.bundleVersion,
            productName = PlayerSettings.productName,
            buildSizeBytes = (long)buildSizeBytes
        };

        string releaseFile = Path.Combine(outputPath, "release.json");
        string json = JsonUtility.ToJson(metadata, true);
        File.WriteAllText(releaseFile, json);
        Debug.Log($"[WebGLBuild] Skrev release metadata: {releaseFile}");
    }

    private static void PostProcessWebGLTemplate(string outputPath, string cacheBustToken)
    {
        string indexPath = Path.Combine(outputPath, "index.html");
        if (File.Exists(indexPath))
        {
            string indexHtml = File.ReadAllText(indexPath);
            string normalizedCacheBustToken = string.IsNullOrWhiteSpace(cacheBustToken)
                ? DateTime.UtcNow.ToString("yyyyMMddHHmmss")
                : cacheBustToken.Trim();
            indexHtml = indexHtml.Replace(
                "<canvas id=\"unity-canvas\" width=960 height=600 tabindex=\"-1\"></canvas>",
                "<canvas id=\"unity-canvas\" tabindex=\"-1\"></canvas>");
            indexHtml = indexHtml.Replace(
                "var loaderUrl = buildUrl + \"/theme1-stabilization-webgl.loader.js\";",
                $"var loaderUrl = buildUrl + \"/theme1-stabilization-webgl.loader.js?v={normalizedCacheBustToken}\";");
            indexHtml = indexHtml.Replace(
                "dataUrl: buildUrl + \"/theme1-stabilization-webgl.data\",",
                $"dataUrl: buildUrl + \"/theme1-stabilization-webgl.data?v={normalizedCacheBustToken}\",");
            indexHtml = indexHtml.Replace(
                "frameworkUrl: buildUrl + \"/theme1-stabilization-webgl.framework.js\",",
                $"frameworkUrl: buildUrl + \"/theme1-stabilization-webgl.framework.js?v={normalizedCacheBustToken}\",");
            indexHtml = indexHtml.Replace(
                "codeUrl: buildUrl + \"/theme1-stabilization-webgl.wasm\",",
                $"codeUrl: buildUrl + \"/theme1-stabilization-webgl.wasm?v={normalizedCacheBustToken}\",");
            indexHtml = indexHtml.Replace(
                "canvas.style.width = \"960px\";\n        canvas.style.height = \"600px\";",
                "canvas.style.width = \"100vw\";\n        canvas.style.height = \"100vh\";\n        canvas.style.maxWidth = \"100vw\";\n        canvas.style.maxHeight = \"100vh\";");
            indexHtml = indexHtml.Replace(
                "                document.querySelector(\"#unity-fullscreen-button\").onclick = () => {\n                  unityInstance.SetFullscreen(1);\n                };\n",
                "                const requestFullscreen = () => {\n" +
                "                  if (document.fullscreenElement || document.webkitFullscreenElement) {\n" +
                "                    return;\n" +
                "                  }\n" +
                "                  const target = document.documentElement;\n" +
                "                  const enterFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;\n" +
                "                  if (enterFullscreen) {\n" +
                "                    const result = enterFullscreen.call(target);\n" +
                "                    if (result && typeof result.catch === \"function\") {\n" +
                "                      result.catch(() => {});\n" +
                "                    }\n" +
                "                    return;\n" +
                "                  }\n" +
                "                  unityInstance.SetFullscreen(1);\n" +
                "                };\n" +
                "                const bindAutoFullscreen = () => {\n" +
                "                  const handleFirstInteraction = () => requestFullscreen();\n" +
                "                  canvas.addEventListener(\"pointerdown\", handleFirstInteraction, { once: true });\n" +
                "                  canvas.addEventListener(\"touchstart\", handleFirstInteraction, { once: true });\n" +
                "                };\n" +
                "                bindAutoFullscreen();\n" +
                "                document.querySelector(\"#unity-fullscreen-button\").onclick = () => {\n" +
                "                  requestFullscreen();\n" +
                "                };\n");

            if (!indexHtml.Contains("theme1-responsive-webgl"))
            {
                indexHtml = indexHtml.Replace(
                    "<meta charset=\"utf-8\">",
                    "<meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, height=device-height, initial-scale=1.0, viewport-fit=cover\">");
                indexHtml = indexHtml.Replace(
                    "<body>",
                    "<body class=\"theme1-responsive-webgl\">");
            }

            File.WriteAllText(indexPath, indexHtml);
            Debug.Log($"[WebGLBuild] Postprosesserte HTML shell: {indexPath}");
        }

        string stylePath = Path.Combine(outputPath, "TemplateData", "style.css");
        if (File.Exists(stylePath))
        {
            string styleCss = File.ReadAllText(stylePath);
            styleCss = Regex.Replace(styleCss, @"body\s*\{\s*padding:\s*0;\s*margin:\s*0\s*\}", "html, body { width: 100%; height: 100%; padding: 0; margin: 0; overflow: hidden; background: #231F20 }");
            styleCss = Regex.Replace(styleCss, @"#unity-container\s*\{\s*position:\s*absolute\s*\}", "#unity-container { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: hidden }");
            styleCss = Regex.Replace(styleCss, @"#unity-container\.unity-desktop\s*\{\s*left:\s*50%;\s*top:\s*50%;\s*transform:\s*translate\(-50%,\s*-50%\)\s*\}", "#unity-container.unity-desktop { left: 0; top: 0; transform: none; width: 100vw; height: 100vh }");
            styleCss = Regex.Replace(styleCss, @"#unity-canvas\s*\{\s*background:\s*#231F20\s*\}", "#unity-canvas { display: block; width: 100%; height: 100%; background: #231F20 }");

            if (!styleCss.Contains("#unity-footer { position: absolute; left: 0; right: 0; bottom: 0;"))
            {
                styleCss += "\n#unity-footer { position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; pointer-events: none }\n";
                styleCss += "#unity-logo-title-footer, #unity-build-title, #unity-fullscreen-button { pointer-events: auto }\n";
                styleCss += "#unity-loading-bar, #unity-warning { z-index: 4 }\n";
            }

            File.WriteAllText(stylePath, styleCss);
            Debug.Log($"[WebGLBuild] Postprosesserte CSS shell: {stylePath}");
        }
    }
}
