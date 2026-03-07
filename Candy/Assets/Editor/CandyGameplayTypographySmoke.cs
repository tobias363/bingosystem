#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

public static class CandyGameplayTypographySmoke
{
    private enum SmokeStage
    {
        WaitingForPlayMode,
        ValidateScene,
        ExitPlayMode,
        Completed,
        Failed
    }

    private const double StageTimeoutSeconds = 8.0;
    private const double ValidationWarmupSeconds = 0.75;

    private static bool isRunning;
    private static bool shouldExitOnFinish;
    private static SmokeStage stage;
    private static int sceneIndex;
    private static double stageDeadlineAt;
    private static double validateAfterAt;
    private static bool previousEnterPlayModeOptionsEnabled;
    private static EnterPlayModeOptions previousEnterPlayModeOptions;

    [MenuItem("Tools/Candy/Tests/Run Gameplay Typography Smoke")]
    public static void RunFromMenu()
    {
        Start(exitOnFinish: false);
    }

    public static void RunFromCommandLine()
    {
        Start(exitOnFinish: true);
    }

    private static void Start(bool exitOnFinish)
    {
        if (isRunning)
        {
            return;
        }

        IReadOnlyList<string> scenePaths = CandyGameplayTypographyTools.GetGameplayScenePaths();
        if (scenePaths.Count == 0)
        {
            Debug.LogError("[TypographySmoke] Ingen gameplay-scener registrert.");
            if (exitOnFinish)
            {
                EditorApplication.Exit(1);
            }

            return;
        }

        shouldExitOnFinish = exitOnFinish;
        isRunning = true;
        sceneIndex = 0;
        stage = SmokeStage.WaitingForPlayMode;
        stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;

        previousEnterPlayModeOptionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
        previousEnterPlayModeOptions = EditorSettings.enterPlayModeOptions;
        EditorSettings.enterPlayModeOptionsEnabled = true;
        EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
        CandyTheme1BindingTools.SetSkipPlayModeValidation(true);

        EditorApplication.playModeStateChanged += HandlePlayModeStateChanged;
        EditorApplication.update += Tick;

        Debug.Log("[TypographySmoke] START");
        OpenCurrentSceneAndEnterPlayMode();
    }

    private static void Tick()
    {
        if (!isRunning || stage == SmokeStage.Completed || stage == SmokeStage.Failed)
        {
            return;
        }

        if (EditorApplication.timeSinceStartup > stageDeadlineAt)
        {
            Fail("stage timeout: " + stage);
            return;
        }

        if (stage != SmokeStage.ValidateScene || !EditorApplication.isPlaying)
        {
            return;
        }

        if (EditorApplication.timeSinceStartup < validateAfterAt)
        {
            return;
        }

        if (!TryValidateCurrentScene(out string validationError))
        {
            Fail(validationError);
            return;
        }

        stage = SmokeStage.ExitPlayMode;
        stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
        EditorApplication.isPlaying = false;
    }

    private static void HandlePlayModeStateChanged(PlayModeStateChange change)
    {
        if (!isRunning)
        {
            return;
        }

        switch (change)
        {
            case PlayModeStateChange.EnteredPlayMode:
                if (stage == SmokeStage.WaitingForPlayMode)
                {
                    stage = SmokeStage.ValidateScene;
                    validateAfterAt = EditorApplication.timeSinceStartup + ValidationWarmupSeconds;
                    stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                }

                break;

            case PlayModeStateChange.EnteredEditMode:
                if (stage == SmokeStage.ExitPlayMode)
                {
                    sceneIndex += 1;
                    if (sceneIndex >= CandyGameplayTypographyTools.GetGameplayScenePaths().Count)
                    {
                        Complete("all gameplay scenes passed runtime typography validation");
                    }
                    else
                    {
                        stage = SmokeStage.WaitingForPlayMode;
                        stageDeadlineAt = EditorApplication.timeSinceStartup + StageTimeoutSeconds;
                        OpenCurrentSceneAndEnterPlayMode();
                    }
                }

                break;
        }
    }

    private static void OpenCurrentSceneAndEnterPlayMode()
    {
        string scenePath = CandyGameplayTypographyTools.GetGameplayScenePaths()[sceneIndex];
        SceneAsset sceneAsset = AssetDatabase.LoadAssetAtPath<SceneAsset>(scenePath);
        if (sceneAsset == null)
        {
            Fail("scene not found: " + scenePath);
            return;
        }

        EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
        EditorApplication.isPlaying = true;
    }

    private static bool TryValidateCurrentScene(out string error)
    {
        error = string.Empty;

        Scene activeScene = SceneManager.GetActiveScene();
        TMP_Text[] labels = UnityEngine.Object.FindObjectsByType<TMP_Text>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        if (labels == null || labels.Length == 0)
        {
            error = "[TypographySmoke] Ingen TMP labels funnet i " + activeScene.name;
            return false;
        }

        List<string> violations = new();
        HashSet<int> validatedCanvasIds = new();
        HashSet<GameplayTextSurface> loggedSurfaces = new();
        int validatedCount = 0;
        for (int i = 0; i < labels.Length; i++)
        {
            TMP_Text label = labels[i];
            if (label == null || label.gameObject.scene != activeScene)
            {
                continue;
            }

            validatedCount += 1;
            string objectPath = BuildObjectPath(label.transform);
            string fontPath = label.font != null ? AssetDatabase.GetAssetPath(label.font) : string.Empty;
            if (!CandyGameplayTypographyTools.IsAllowedGameplayFontPath(fontPath))
            {
                violations.Add(objectPath + " uses legacy font " + fontPath);
            }
            else if (!CandyGameplayTypographyTools.IsHealthyGameplayFontAsset(label.font, out string fontDetails))
            {
                violations.Add(objectPath + " uses unhealthy gameplay font (" + fontDetails + ")");
            }

            Material material = label.fontMaterial != null ? label.fontMaterial : label.fontSharedMaterial;
            string materialPath = material != null ? AssetDatabase.GetAssetPath(material) : string.Empty;
            if (!CandyGameplayTypographyTools.IsAllowedGameplayMaterialPath(materialPath))
            {
                violations.Add(objectPath + " uses legacy material " + materialPath);
            }

            if (CandyGameplayTypographyTools.HasForbiddenGameplayMaterialFeatures(material, out string details))
            {
                violations.Add(objectPath + " has forbidden material features (" + details + ")");
            }

            if (!IsUnitScale(label.transform.localScale))
            {
                violations.Add(objectPath + " has non-unit scale " + label.transform.localScale);
            }

            Canvas rootCanvas = label.canvas != null ? label.canvas.rootCanvas : label.GetComponentInParent<Canvas>(true);
            if (rootCanvas != null && validatedCanvasIds.Add(rootCanvas.GetInstanceID()) &&
                !CandyGameplayTypographyTools.ValidateGameplayCanvas(rootCanvas, out string canvasDetails))
            {
                violations.Add(objectPath + " is on invalid gameplay canvas (" + canvasDetails + ")");
            }

            GameplayTextSurface surface = RealtimeTextStyleUtils.ClassifyGameplaySurface(label);
            if (loggedSurfaces.Add(surface))
            {
                Debug.Log("[TypographySmoke] SAMPLE " + BuildSampleDiagnostic(activeScene.name, label, surface, rootCanvas));
            }
        }

        if (validatedCount == 0)
        {
            error = "[TypographySmoke] Fant ingen TMP labels i aktiv scene " + activeScene.name;
            return false;
        }

        if (violations.Count > 0)
        {
            error = "[TypographySmoke] " + activeScene.name + " validation failed:\n" +
                    string.Join("\n", violations.GetRange(0, Mathf.Min(12, violations.Count)));
            return false;
        }

        Debug.Log($"[TypographySmoke] PASS scene={activeScene.name} validatedLabels={validatedCount}");
        return true;
    }

    private static void Complete(string message)
    {
        stage = SmokeStage.Completed;
        Finish(0, "[TypographySmoke] RESULT status=PASS message=" + message);
    }

    private static void Fail(string message)
    {
        stage = SmokeStage.Failed;
        Finish(1, "[TypographySmoke] RESULT status=FAIL message=" + message);
    }

    private static void Finish(int exitCode, string message)
    {
        EditorApplication.playModeStateChanged -= HandlePlayModeStateChanged;
        EditorApplication.update -= Tick;
        EditorSettings.enterPlayModeOptionsEnabled = previousEnterPlayModeOptionsEnabled;
        EditorSettings.enterPlayModeOptions = previousEnterPlayModeOptions;
        CandyTheme1BindingTools.SetSkipPlayModeValidation(false);
        isRunning = false;

        if (exitCode == 0)
        {
            Debug.Log(message);
        }
        else
        {
            Debug.LogError(message);
        }

        if (shouldExitOnFinish)
        {
            if (EditorApplication.isPlaying)
            {
                EditorApplication.isPlaying = false;
            }

            EditorApplication.Exit(exitCode);
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

    private static bool IsUnitScale(Vector3 scale)
    {
        return Mathf.Abs(scale.x - 1f) <= 0.001f &&
               Mathf.Abs(scale.y - 1f) <= 0.001f &&
               Mathf.Abs(scale.z - 1f) <= 0.001f;
    }

    private static string BuildSampleDiagnostic(string sceneName, TMP_Text label, GameplayTextSurface surface, Canvas rootCanvas)
    {
        Material material = label != null
            ? (label.fontMaterial != null ? label.fontMaterial : label.fontSharedMaterial)
            : null;
        Shader shader = material != null ? material.shader : null;
        string shaderPath = shader != null ? AssetDatabase.GetAssetPath(shader) : string.Empty;
        string shaderGuid = !string.IsNullOrWhiteSpace(shaderPath) ? AssetDatabase.AssetPathToGUID(shaderPath) : string.Empty;
        CanvasScaler scaler = rootCanvas != null ? rootCanvas.GetComponent<CanvasScaler>() : null;
        string canvasMode = rootCanvas != null ? rootCanvas.renderMode.ToString() : "None";
        string cameraName = rootCanvas != null && rootCanvas.worldCamera != null ? rootCanvas.worldCamera.name : "null";
        float dynamicPixelsPerUnit = scaler != null ? scaler.dynamicPixelsPerUnit : -1f;

        return
            $"scene={sceneName} surface={surface} path={BuildObjectPath(label != null ? label.transform : null)} " +
            $"shader={(shader != null ? shader.name : "null")} guid={(string.IsNullOrWhiteSpace(shaderGuid) ? "n/a" : shaderGuid)} " +
            $"canvasMode={canvasMode} dppu={dynamicPixelsPerUnit:0.##} camera={cameraName}";
    }
}
#endif
