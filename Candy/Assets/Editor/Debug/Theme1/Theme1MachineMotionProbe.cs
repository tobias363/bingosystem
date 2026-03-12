using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;

public static class Theme1MachineMotionProbe
{
    private const string ScenePath = "Assets/Scenes/Theme1.unity";
    private const double TimeoutSeconds = 14.0;
    private const string SessionActiveKey = "Theme1MachineMotionProbe.Active";
    private const string SessionOutputPathKey = "Theme1MachineMotionProbe.OutputPath";
    private const string SessionExitKey = "Theme1MachineMotionProbe.ExitOnFinish";

    private static bool isRunning;
    private static bool shouldExitOnFinish;
    private static string outputPath;
    private static double deadlineAt;
    private static double playEnteredAt;
    private static readonly List<Sample> Samples = new();

    private sealed class Sample
    {
        public double Time;
        public Vector2[] Positions;
    }

    [InitializeOnLoadMethod]
    private static void RestoreAfterReload()
    {
        if (!SessionState.GetBool(SessionActiveKey, false))
        {
            return;
        }

        outputPath = SessionState.GetString(SessionOutputPathKey, "/tmp/theme1-machine-motion-probe.txt");
        shouldExitOnFinish = SessionState.GetBool(SessionExitKey, false);
        isRunning = true;
        deadlineAt = EditorApplication.timeSinceStartup + TimeoutSeconds;
        Hook();
        Debug.Log("[Theme1MachineMotionProbe] RESTORED");
    }

    public static void RunFromCommandLine()
    {
        string requestedOutput = GetCommandLineArgValue("-theme1MachineMotionProbePath", "/tmp/theme1-machine-motion-probe.txt");
        Start(requestedOutput, exitOnFinish: true);
    }

    public static void RunFromEditorRequest(string requestedOutputPath)
    {
        Start(requestedOutputPath, exitOnFinish: false);
    }

    private static void Start(string requestedOutputPath, bool exitOnFinish)
    {
        outputPath = string.IsNullOrWhiteSpace(requestedOutputPath) ? "/tmp/theme1-machine-motion-probe.txt" : requestedOutputPath.Trim();
        shouldExitOnFinish = exitOnFinish;
        SessionState.SetBool(SessionActiveKey, true);
        SessionState.SetString(SessionOutputPathKey, outputPath);
        SessionState.SetBool(SessionExitKey, shouldExitOnFinish);
        isRunning = true;
        deadlineAt = EditorApplication.timeSinceStartup + TimeoutSeconds;
        Samples.Clear();

        EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        SceneAsset playModeScene = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath);
        if (playModeScene != null)
        {
            EditorSceneManager.playModeStartScene = playModeScene;
        }

        Hook();
        Debug.Log("[Theme1MachineMotionProbe] START");
        EditorApplication.isPlaying = true;
    }

    private static void Hook()
    {
        EditorApplication.playModeStateChanged -= HandlePlayModeStateChanged;
        EditorApplication.update -= Tick;
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
            playEnteredAt = EditorApplication.timeSinceStartup;
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

        double elapsed = EditorApplication.timeSinceStartup - playEnteredAt;
        if (elapsed < 0.35d)
        {
            return;
        }

        if (elapsed > 4.2d)
        {
            WriteReport();
            Complete();
            return;
        }

        if (Samples.Count >= 10)
        {
            return;
        }

        float[] checkpoints = { 0.5f, 0.85f, 1.2f, 1.55f, 1.9f, 2.25f, 2.6f, 2.95f, 3.3f, 3.65f };
        int nextIndex = Samples.Count;
        if (elapsed < checkpoints[nextIndex])
        {
            return;
        }

        RecordSample(elapsed);
    }

    private static void RecordSample(double elapsed)
    {
        RectTransform cluster = FindNamedRectTransform("BallOutMachineAnim");
        RectTransform[] clusterChildren = cluster != null
            ? cluster.Cast<Transform>()
                .OfType<RectTransform>()
                .Where(rect => rect != null && rect.GetComponent<Image>() != null)
                .OrderBy(rect => rect.name, StringComparer.Ordinal)
                .ToArray()
            : Array.Empty<RectTransform>();

        Sample sample = new Sample
        {
            Time = elapsed,
            Positions = clusterChildren.Select(t => t.anchoredPosition).ToArray()
        };
        Samples.Add(sample);
    }

    private static void WriteReport()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? "/tmp");
        using StreamWriter writer = new StreamWriter(outputPath, false);
        writer.WriteLine("Theme1MachineMotionProbe");
        writer.WriteLine($"samples={Samples.Count}");

        if (Samples.Count == 0 || Samples[0].Positions.Length == 0)
        {
            writer.WriteLine("status=NO_DATA");
            return;
        }

        int count = Samples[0].Positions.Length;
        float totalXRange = 0f;
        float totalYRange = 0f;
        float minX = float.PositiveInfinity;
        float maxX = float.NegativeInfinity;
        float minY = float.PositiveInfinity;
        float maxY = float.NegativeInfinity;

        for (int i = 0; i < count; i++)
        {
            float localMinX = float.PositiveInfinity;
            float localMaxX = float.NegativeInfinity;
            float localMinY = float.PositiveInfinity;
            float localMaxY = float.NegativeInfinity;

            for (int s = 0; s < Samples.Count; s++)
            {
                Vector2 p = Samples[s].Positions[i];
                localMinX = Mathf.Min(localMinX, p.x);
                localMaxX = Mathf.Max(localMaxX, p.x);
                localMinY = Mathf.Min(localMinY, p.y);
                localMaxY = Mathf.Max(localMaxY, p.y);
            }

            totalXRange += localMaxX - localMinX;
            totalYRange += localMaxY - localMinY;
            minX = Mathf.Min(minX, localMinX);
            maxX = Mathf.Max(maxX, localMaxX);
            minY = Mathf.Min(minY, localMinY);
            maxY = Mathf.Max(maxY, localMaxY);
        }

        float avgXRange = totalXRange / count;
        float avgYRange = totalYRange / count;
        float totalStepDistance = 0f;
        float totalStepX = 0f;
        float totalStepY = 0f;
        int stepCount = 0;

        for (int s = 1; s < Samples.Count; s++)
        {
            for (int i = 0; i < count; i++)
            {
                Vector2 previous = Samples[s - 1].Positions[i];
                Vector2 current = Samples[s].Positions[i];
                Vector2 delta = current - previous;
                totalStepDistance += delta.magnitude;
                totalStepX += Mathf.Abs(delta.x);
                totalStepY += Mathf.Abs(delta.y);
                stepCount++;
            }
        }

        writer.WriteLine($"ball_count={count}");
        writer.WriteLine($"avg_x_range={avgXRange:F2}");
        writer.WriteLine($"avg_y_range={avgYRange:F2}");
        writer.WriteLine($"overall_span_x={(maxX - minX):F2}");
        writer.WriteLine($"overall_span_y={(maxY - minY):F2}");
        if (stepCount > 0)
        {
            writer.WriteLine($"avg_step_distance={(totalStepDistance / stepCount):F2}");
            writer.WriteLine($"avg_step_dx={(totalStepX / stepCount):F2}");
            writer.WriteLine($"avg_step_dy={(totalStepY / stepCount):F2}");
        }

        Vector2 firstA = Samples[0].Positions[0];
        Vector2 firstB = Samples[^1].Positions[0];
        writer.WriteLine($"ball0_delta={Vector2.Distance(firstA, firstB):F2}");
    }

    private static RectTransform FindNamedRectTransform(string name)
    {
        foreach (Transform root in UnityEngine.SceneManagement.SceneManager.GetActiveScene().GetRootGameObjects().Select(go => go.transform))
        {
            RectTransform found = FindRecursive(root, name);
            if (found != null)
            {
                return found;
            }
        }

        return null;
    }

    private static RectTransform FindRecursive(Transform root, string name)
    {
        if (root.name == name)
        {
            return root as RectTransform;
        }

        for (int i = 0; i < root.childCount; i++)
        {
            RectTransform found = FindRecursive(root.GetChild(i), name);
            if (found != null)
            {
                return found;
            }
        }

        return null;
    }

    private static void Complete()
    {
        Debug.Log("[Theme1MachineMotionProbe] COMPLETE");
        Cleanup();
    }

    private static void Fail(string reason)
    {
        Debug.LogError("[Theme1MachineMotionProbe] FAIL " + reason);
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
        SessionState.EraseBool(SessionExitKey);
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
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], key, StringComparison.OrdinalIgnoreCase))
            {
                return args[i + 1];
            }
        }

        return fallback;
    }
}
