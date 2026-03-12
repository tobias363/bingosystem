using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class Theme3PrototypeVisualCapture
{
    private const string ScenePath = "Assets/Scenes/Theme3_DrawMachinePrototype.unity";
    private const double TimeoutSeconds = 10.0;
    private const int CaptureWidth = 1600;
    private const int CaptureHeight = 900;
    private static readonly string DefaultOutputPath = Path.GetFullPath(Path.Combine(
        Application.dataPath,
        "..",
        "..",
        "output",
        "prototype-captures",
        "theme3-capture.png"));

    private static bool isRunning;
    private static bool shouldExitOnFinish;
    private static string outputPath = DefaultOutputPath;
    private static double deadlineAt;
    private static double captureAt;
    private static double playStartedAt;
    private static double requestedDelaySeconds = 1.15d;
    private const string SessionActiveKey = "Theme3VisualCapture.Active";
    private const string SessionOutputPathKey = "Theme3VisualCapture.OutputPath";
    private const string SessionDelayKey = "Theme3VisualCapture.DelaySeconds";
    private const string SessionExitKey = "Theme3VisualCapture.ExitOnFinish";

    [InitializeOnLoadMethod]
    private static void RestoreStateAfterDomainReload()
    {
        if (!SessionState.GetBool(SessionActiveKey, false))
        {
            return;
        }

        outputPath = SessionState.GetString(SessionOutputPathKey, DefaultOutputPath);
        requestedDelaySeconds = SessionState.GetFloat(SessionDelayKey, 1.15f);
        shouldExitOnFinish = SessionState.GetBool(SessionExitKey, false);
        isRunning = true;
        deadlineAt = EditorApplication.timeSinceStartup + TimeoutSeconds;
        HookCallbacks();
        Debug.Log("[Theme3VisualCapture] RESTORED");
    }

    private readonly struct CanvasCaptureState
    {
        public readonly Canvas Canvas;
        public readonly RenderMode RenderMode;
        public readonly Camera WorldCamera;
        public readonly float PlaneDistance;

        public CanvasCaptureState(Canvas canvas)
        {
            Canvas = canvas;
            RenderMode = canvas != null ? canvas.renderMode : RenderMode.ScreenSpaceOverlay;
            WorldCamera = canvas != null ? canvas.worldCamera : null;
            PlaneDistance = canvas != null ? canvas.planeDistance : 0f;
        }

        public void Restore()
        {
            if (Canvas == null)
            {
                return;
            }

            Canvas.renderMode = RenderMode;
            Canvas.worldCamera = WorldCamera;
            Canvas.planeDistance = PlaneDistance;
        }
    }

    [MenuItem("Tools/Candy/Prototype/Capture Theme3 Frame")]
    public static void RunFromMenu()
    {
        Start(DefaultOutputPath, 1.15d, false);
    }

    public static void RunFromCommandLine()
    {
        string requestedOutput = GetCommandLineArgValue("-theme3CapturePath", DefaultOutputPath);
        string requestedDelay = GetCommandLineArgValue("-theme3CaptureDelaySeconds", "1.15");
        if (!double.TryParse(requestedDelay, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double parsedDelay))
        {
            parsedDelay = 1.15d;
        }

        Start(requestedOutput, parsedDelay, true);
    }

    private static void Start(string requestedOutputPath, double delaySeconds, bool exitOnFinish)
    {
        if (isRunning)
        {
            return;
        }

        outputPath = string.IsNullOrWhiteSpace(requestedOutputPath) ? DefaultOutputPath : requestedOutputPath.Trim();
        requestedDelaySeconds = Math.Max(0.05d, delaySeconds);
        shouldExitOnFinish = exitOnFinish;
        isRunning = true;
        deadlineAt = EditorApplication.timeSinceStartup + TimeoutSeconds;
        SessionState.SetBool(SessionActiveKey, true);
        SessionState.SetString(SessionOutputPathKey, outputPath);
        SessionState.SetFloat(SessionDelayKey, (float)requestedDelaySeconds);
        SessionState.SetBool(SessionExitKey, shouldExitOnFinish);

        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        SceneAsset playModeScene = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath);
        if (playModeScene != null)
        {
            EditorSceneManager.playModeStartScene = playModeScene;
        }

        HookCallbacks();
        Debug.Log("[Theme3VisualCapture] START");
        EditorApplication.isPlaying = true;
    }

    private static void HookCallbacks()
    {
        Application.logMessageReceived -= HandleLog;
        EditorApplication.playModeStateChanged -= HandlePlayModeStateChanged;
        EditorApplication.update -= Tick;
        Application.logMessageReceived += HandleLog;
        EditorApplication.playModeStateChanged += HandlePlayModeStateChanged;
        EditorApplication.update += Tick;
    }

    private static void HandlePlayModeStateChanged(PlayModeStateChange change)
    {
        if (!isRunning)
        {
            return;
        }

        if (change == PlayModeStateChange.EnteredPlayMode)
        {
            playStartedAt = EditorApplication.timeSinceStartup;
            captureAt = playStartedAt + requestedDelaySeconds;
        }
    }

    private static void Tick()
    {
        if (!isRunning)
        {
            return;
        }

        if (EditorApplication.timeSinceStartup > deadlineAt)
        {
            Fail("timeout");
            return;
        }

        if (!EditorApplication.isPlaying)
        {
            return;
        }

        if (EditorApplication.timeSinceStartup < captureAt)
        {
            return;
        }

        EditorApplication.update -= Tick;
        EditorApplication.delayCall += Capture;
    }

    private static void Capture()
    {
        try
        {
            Camera camera = UnityEngine.Object.FindFirstObjectByType<Camera>(FindObjectsInactive.Include);
            if (camera == null)
            {
                Fail("Camera mangler i Theme3.");
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? "/tmp");
            CaptureCameraViewToPng(camera);
            Debug.Log("[Theme3VisualCapture] WROTE " + outputPath);
            Complete();
        }
        catch (Exception ex)
        {
            Fail(ex.ToString());
        }
    }

    private static void CaptureCameraViewToPng(Camera camera)
    {
        Canvas[] canvases = UnityEngine.Object.FindObjectsByType<Canvas>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        List<CanvasCaptureState> canvasStates = new List<CanvasCaptureState>(canvases.Length);
        for (int i = 0; i < canvases.Length; i++)
        {
            Canvas canvas = canvases[i];
            if (canvas == null || !canvas.isActiveAndEnabled)
            {
                continue;
            }

            canvasStates.Add(new CanvasCaptureState(canvas));
            if (canvas.renderMode == RenderMode.ScreenSpaceOverlay)
            {
                canvas.renderMode = RenderMode.ScreenSpaceCamera;
                canvas.worldCamera = camera;
                canvas.planeDistance = 100f;
            }
            else if (canvas.renderMode == RenderMode.ScreenSpaceCamera && canvas.worldCamera == null)
            {
                canvas.worldCamera = camera;
            }
        }

        RenderTexture renderTexture = null;
        Texture2D texture = null;
        RenderTexture previousActive = RenderTexture.active;
        RenderTexture previousTarget = camera.targetTexture;

        try
        {
            renderTexture = new RenderTexture(CaptureWidth, CaptureHeight, 24, RenderTextureFormat.ARGB32)
            {
                antiAliasing = 4
            };
            texture = new Texture2D(CaptureWidth, CaptureHeight, TextureFormat.RGBA32, false);
            camera.targetTexture = renderTexture;
            RenderTexture.active = renderTexture;
            camera.Render();

            texture.ReadPixels(new Rect(0f, 0f, CaptureWidth, CaptureHeight), 0, 0, false);
            texture.Apply(false, false);
            byte[] png = texture.EncodeToPNG();
            if (png == null || png.Length == 0)
            {
                throw new InvalidOperationException("EncodeToPNG returnerte tomt resultat.");
            }

            File.WriteAllBytes(outputPath, png);
        }
        finally
        {
            camera.targetTexture = previousTarget;
            RenderTexture.active = previousActive;

            for (int i = 0; i < canvasStates.Count; i++)
            {
                canvasStates[i].Restore();
            }

            if (texture != null)
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }

            if (renderTexture != null)
            {
                UnityEngine.Object.DestroyImmediate(renderTexture);
            }
        }
    }

    private static void HandleLog(string condition, string stackTrace, LogType type)
    {
        if (!isRunning || type != LogType.Exception)
        {
            return;
        }

        if (condition.Contains("CandyDrawMachinePrototypeController") || condition.Contains("Theme3"))
        {
            Fail(condition);
        }
    }

    private static void Complete()
    {
        Debug.Log("[Theme3VisualCapture] COMPLETE");
        Cleanup();
    }

    private static void Fail(string reason)
    {
        Debug.LogError("[Theme3VisualCapture] FAIL " + reason);
        Cleanup();
    }

    private static void Cleanup()
    {
        if (!isRunning)
        {
            return;
        }

        isRunning = false;
        SessionState.EraseBool(SessionActiveKey);
        SessionState.EraseString(SessionOutputPathKey);
        SessionState.EraseFloat(SessionDelayKey);
        SessionState.EraseBool(SessionExitKey);
        Application.logMessageReceived -= HandleLog;
        EditorApplication.playModeStateChanged -= HandlePlayModeStateChanged;
        EditorApplication.update -= Tick;
        EditorSceneManager.playModeStartScene = null;
        if (EditorApplication.isPlaying)
        {
            EditorApplication.isPlaying = false;
        }

        if (shouldExitOnFinish)
        {
            EditorApplication.Exit(0);
        }
    }

    private static string GetCommandLineArgValue(string key, string fallback)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int index = 0; index < args.Length - 1; index++)
        {
            if (!string.Equals(args[index], key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return args[index + 1];
        }

        return fallback;
    }
}
