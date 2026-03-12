using System;
using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

public static class Theme1ProductionGuardrails
{
    private const string Prefix = "[Theme1Production]";
    private const string Theme1ScenePath = "Assets/Scenes/Theme1.unity";
    private const string ProductionRootName = "Theme1ProductionRoot";
    private static readonly HashSet<string> AllowedTmpShaderNames = new(StringComparer.Ordinal)
    {
        CandyTypographySystem.PreferredGameplayShaderName,
        CandyTypographySystem.MobileGameplayShaderName,
        CandyTypographySystem.BitmapShaderName,
        CandyTypographySystem.MobileBitmapShaderName
    };

    public static bool ValidateOpenTheme1Scene(bool logSummary, out string report)
    {
        Scene activeScene = SceneManager.GetActiveScene();
        if (!string.Equals(activeScene.path, Theme1ScenePath, StringComparison.Ordinal))
        {
            report = $"{Prefix} Aktiv scene er ikke Theme1.";
            return false;
        }

        StringBuilder builder = new StringBuilder();
        bool isValid = true;

        if (!CandyBallVisualCatalog.TryValidateComplete(out string ballCatalogError))
        {
            builder.AppendLine(ballCatalogError);
            isValid = false;
        }

        Theme1GameplayViewRoot[] roots = UnityEngine.Object.FindObjectsByType<Theme1GameplayViewRoot>(
            FindObjectsInactive.Include,
            FindObjectsSortMode.None);
        if (roots == null || roots.Length != 1)
        {
            builder.AppendLine($"Fant {roots?.Length ?? 0} Theme1GameplayViewRoot-komponent(er). Forventer eksakt 1.");
            isValid = false;
        }

        Theme1GameplayViewRoot root = roots != null && roots.Length > 0 ? roots[0] : null;
        APIManager apiManager = UnityEngine.Object.FindFirstObjectByType<APIManager>(FindObjectsInactive.Include);
        NumberGenerator generator = UnityEngine.Object.FindFirstObjectByType<NumberGenerator>(FindObjectsInactive.Include);
        BallManager ballManager = UnityEngine.Object.FindFirstObjectByType<BallManager>(FindObjectsInactive.Include);
        if (apiManager == null || generator == null || ballManager == null)
        {
            builder.AppendLine("Theme1 mangler APIManager, NumberGenerator eller BallManager.");
            isValid = false;
        }

        if (root != null)
        {
            if (!string.Equals(root.gameObject.name, ProductionRootName, StringComparison.Ordinal))
            {
                builder.AppendLine($"Theme1GameplayViewRoot må ligge på GameObject '{ProductionRootName}'. Fikk '{root.gameObject.name}'.");
                isValid = false;
            }

            if (root.gameObject == apiManager?.gameObject)
            {
                builder.AppendLine("Theme1GameplayViewRoot kan ikke ligge på APIManager etter produksjonsmigreringen.");
                isValid = false;
            }

            if (root.GetComponent<RectTransform>() == null)
            {
                builder.AppendLine("Theme1ProductionRoot mangler RectTransform.");
                isValid = false;
            }
            else
            {
                RectTransform rootRect = root.GetComponent<RectTransform>();
                if (rootRect.localScale != Vector3.one)
                {
                    builder.AppendLine($"Theme1ProductionRoot må ha unit localScale. Fikk {rootRect.localScale}.");
                    isValid = false;
                }

                if (rootRect.localPosition != Vector3.zero)
                {
                    builder.AppendLine($"Theme1ProductionRoot må ha localPosition=(0,0,0). Fikk {rootRect.localPosition}.");
                    isValid = false;
                }
            }

            if (root.GetComponentInParent<Canvas>(true) == null)
            {
                builder.AppendLine("Theme1ProductionRoot må ligge under en Canvas.");
                isValid = false;
            }

            if (root.GetComponent<Theme1LayoutController>() == null)
            {
                builder.AppendLine("Theme1ProductionRoot mangler Theme1LayoutController.");
                isValid = false;
            }

            if (!root.ValidateContract(out string contractReport))
            {
                builder.AppendLine(contractReport);
                isValid = false;
            }

            List<TMP_Text> textTargets = new List<TMP_Text>();
            root.CollectTextTargets(textTargets);
            HashSet<int> textIds = new HashSet<int>();
            for (int i = 0; i < textTargets.Count; i++)
            {
                TMP_Text target = textTargets[i];
                if (target == null)
                {
                    builder.AppendLine($"Theme1ProductionRoot textTargets[{i}] er null.");
                    isValid = false;
                    continue;
                }

                if (!textIds.Add(target.GetInstanceID()))
                {
                    builder.AppendLine($"TMP-target '{target.name}' gjenbrukes flere ganger i Theme1ProductionRoot.");
                    isValid = false;
                }

                string shaderName = target.fontSharedMaterial != null && target.fontSharedMaterial.shader != null
                    ? target.fontSharedMaterial.shader.name
                    : string.Empty;
                if (!string.IsNullOrWhiteSpace(shaderName) && !AllowedTmpShaderNames.Contains(shaderName))
                {
                    builder.AppendLine($"TMP-target '{target.name}' bruker ikke autorisert gameplay-shader ({shaderName}).");
                    isValid = false;
                }
            }
        }

        if (generator != null)
        {
            CandyCardViewBindingSet cardBindings = generator.GetComponent<CandyCardViewBindingSet>();
            if (cardBindings == null)
            {
                builder.AppendLine("CandyCardViewBindingSet mangler på NumberGenerator.");
                isValid = false;
            }
            else if (!cardBindings.Validate(out string cardReport))
            {
                builder.AppendLine(cardReport);
                isValid = false;
            }
        }

        if (ballManager != null)
        {
            CandyBallViewBindingSet ballBindings = ballManager.GetComponent<CandyBallViewBindingSet>();
            if (ballBindings == null)
            {
                builder.AppendLine("CandyBallViewBindingSet mangler på BallManager.");
                isValid = false;
            }
            else if (!ballBindings.Validate(out string ballReport))
            {
                builder.AppendLine(ballReport);
                isValid = false;
            }
        }

        if (apiManager != null)
        {
            SerializedObject serializedApiManager = new SerializedObject(apiManager);
            SerializedProperty rootProperty = serializedApiManager.FindProperty("theme1GameplayViewRoot");
            Theme1GameplayViewRoot serializedRoot = rootProperty != null
                ? rootProperty.objectReferenceValue as Theme1GameplayViewRoot
                : null;
            if (serializedRoot == null || serializedRoot != root)
            {
                builder.AppendLine("APIManager.theme1GameplayViewRoot peker ikke til Theme1ProductionRoot.");
                isValid = false;
            }

            CandyTheme1HudBindingSet hudBindings = apiManager.GetComponent<CandyTheme1HudBindingSet>();
            if (hudBindings == null)
            {
                builder.AppendLine("CandyTheme1HudBindingSet mangler på APIManager.");
                isValid = false;
            }
            else if (!hudBindings.Validate(out string hudReport))
            {
                builder.AppendLine(hudReport);
                isValid = false;
            }
        }

        ValidateCanvasPolicy(activeScene, builder, ref isValid);

        if (!Theme1AssetImportAudit.ValidatePolicy(logSummary: false, out string assetReport))
        {
            builder.AppendLine(assetReport);
            isValid = false;
        }

        if (!Theme1SceneScaleNormalizer.ValidatePolicy(activeScene, root, out string scaleReport))
        {
            builder.AppendLine(scaleReport);
            isValid = false;
        }

        report = builder.Length == 0
            ? $"{Prefix} OK"
            : $"{Prefix}{Environment.NewLine}{builder}";

        if (logSummary)
        {
            if (isValid)
            {
                Debug.Log(report);
            }
            else
            {
                Debug.LogError(report);
            }
        }

        return isValid;
    }

    public static bool ValidateTheme1SceneAtPath(bool logSummary, out string report)
    {
        Scene scene = EditorSceneManager.OpenScene(Theme1ScenePath, OpenSceneMode.Single);
        if (!scene.IsValid())
        {
            report = $"{Prefix} Klarte ikke åpne Theme1-scenen.";
            return false;
        }

        return ValidateOpenTheme1Scene(logSummary, out report);
    }

    public static void AssertBuildReady()
    {
        if (!ValidateTheme1SceneAtPath(logSummary: true, out string report))
        {
            throw new InvalidOperationException(report);
        }
    }

    private static void ValidateCanvasPolicy(Scene scene, StringBuilder builder, ref bool isValid)
    {
        CanvasScaler[] scalers = UnityEngine.Object.FindObjectsByType<CanvasScaler>(
            FindObjectsInactive.Include,
            FindObjectsSortMode.None);
        Canvas[] canvases = UnityEngine.Object.FindObjectsByType<Canvas>(
            FindObjectsInactive.Include,
            FindObjectsSortMode.None);

        bool foundSceneScaler = false;
        for (int i = 0; i < scalers.Length; i++)
        {
            CanvasScaler scaler = scalers[i];
            if (scaler == null || scaler.gameObject.scene != scene)
            {
                continue;
            }

            foundSceneScaler = true;
            if (scaler.uiScaleMode != CanvasScaler.ScaleMode.ScaleWithScreenSize)
            {
                builder.AppendLine($"CanvasScaler '{scaler.name}' må bruke ScaleWithScreenSize.");
                isValid = false;
            }

            if (scaler.referenceResolution != new Vector2(1920f, 1080f))
            {
                builder.AppendLine($"CanvasScaler '{scaler.name}' må bruke referenceResolution 1920x1080.");
                isValid = false;
            }

            if (scaler.screenMatchMode != CanvasScaler.ScreenMatchMode.MatchWidthOrHeight)
            {
                builder.AppendLine($"CanvasScaler '{scaler.name}' må bruke MatchWidthOrHeight.");
                isValid = false;
            }

            if (!Mathf.Approximately(scaler.matchWidthOrHeight, 0.5f))
            {
                builder.AppendLine($"CanvasScaler '{scaler.name}' må bruke matchWidthOrHeight=0.5.");
                isValid = false;
            }

            if (scaler.dynamicPixelsPerUnit < CandyTypographySystem.MinimumGameplayCameraCanvasDynamicPixelsPerUnit)
            {
                builder.AppendLine($"CanvasScaler '{scaler.name}' må ha dynamicPixelsPerUnit >= {CandyTypographySystem.MinimumGameplayCameraCanvasDynamicPixelsPerUnit:0.##}.");
                isValid = false;
            }
        }

        if (!foundSceneScaler)
        {
            builder.AppendLine("Theme1-scenen mangler CanvasScaler.");
            isValid = false;
        }

        for (int i = 0; i < canvases.Length; i++)
        {
            Canvas canvas = canvases[i];
            if (canvas == null || canvas.gameObject.scene != scene)
            {
                continue;
            }

            if (canvas.pixelPerfect)
            {
                builder.AppendLine($"Canvas '{canvas.name}' må ha pixelPerfect=false.");
                isValid = false;
            }
        }
    }
}
