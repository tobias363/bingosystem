using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;

public static class Theme3PrototypeMotionProbe
{
    private const string ScenePath = "Assets/Scenes/Theme3_DrawMachinePrototype.unity";
    private const double TimeoutSeconds = 12.0;
    private const string SessionActiveKey = "Theme3MotionProbe.Active";
    private const string SessionOutputPathKey = "Theme3MotionProbe.OutputPath";

    private static bool isRunning;
    private static string outputPath;
    private static double deadlineAt;
    private static double playEnteredAt;
    private static readonly List<Sample> Samples = new();

    private sealed class Sample
    {
        public double Time;
        public int ClusterCount;
        public Vector2[] ClusterPositions;
        public Vector3[] ClusterScales;
        public Vector2 EjectPosition;
        public Vector3 EjectScale;
        public bool EjectVisible;
    }

    [InitializeOnLoadMethod]
    private static void RestoreAfterReload()
    {
        if (!SessionState.GetBool(SessionActiveKey, false))
        {
            return;
        }

        outputPath = SessionState.GetString(SessionOutputPathKey, "/tmp/theme3-motion-probe.txt");
        isRunning = true;
        deadlineAt = EditorApplication.timeSinceStartup + TimeoutSeconds;
        Hook();
        Debug.Log("[Theme3MotionProbe] RESTORED");
    }

    public static void RunFromCommandLine()
    {
        outputPath = GetCommandLineArgValue("-theme3MotionProbePath", "/tmp/theme3-motion-probe.txt");
        SessionState.SetBool(SessionActiveKey, true);
        SessionState.SetString(SessionOutputPathKey, outputPath);
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
        Debug.Log("[Theme3MotionProbe] START");
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
        if (elapsed < 0.25d)
        {
            return;
        }

        if (elapsed > 4.4d)
        {
            WriteReport();
            Complete();
            return;
        }

        if (Samples.Count >= 10)
        {
            return;
        }

        float[] checkpoints = { 0.4f, 0.8f, 1.2f, 1.6f, 2.0f, 2.4f, 2.8f, 3.2f, 3.6f, 4.0f };
        int nextIndex = Samples.Count;
        if (elapsed < checkpoints[nextIndex])
        {
            return;
        }

        RecordSample(elapsed);
    }

    private static void RecordSample(double elapsed)
    {
        Transform cluster = FindDescendantByName("BallCluster");
        RectTransform ejectBall = FindDescendantByName("EjectBall") as RectTransform;
        Image ejectImage = ejectBall != null ? ejectBall.GetComponent<Image>() : null;
        var clusterChildren = cluster != null
            ? cluster.Cast<Transform>().OfType<RectTransform>().OrderBy(t => t.name).ToArray()
            : Array.Empty<RectTransform>();

        Sample sample = new Sample
        {
            Time = elapsed,
            ClusterCount = clusterChildren.Length,
            ClusterPositions = clusterChildren.Select(t => t.anchoredPosition).ToArray(),
            ClusterScales = clusterChildren.Select(t => t.localScale).ToArray(),
            EjectPosition = ejectBall != null ? ejectBall.anchoredPosition : Vector2.zero,
            EjectScale = ejectBall != null ? ejectBall.localScale : Vector3.zero,
            EjectVisible = ejectImage != null && ejectImage.enabled
        };
        Samples.Add(sample);
    }

    private static void WriteReport()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? "/tmp");
        using StreamWriter writer = new StreamWriter(outputPath, false);
        writer.WriteLine("Theme3MotionProbe");
        writer.WriteLine($"samples={Samples.Count}");
        for (int i = 0; i < Samples.Count; i++)
        {
            Sample sample = Samples[i];
            writer.WriteLine($"t={sample.Time:F2} clusterCount={sample.ClusterCount} ejectVisible={sample.EjectVisible} ejectPos={sample.EjectPosition.x:F1},{sample.EjectPosition.y:F1} ejectScale={sample.EjectScale.x:F2}");
            if (sample.ClusterPositions.Length > 0)
            {
                Vector2 first = sample.ClusterPositions[0];
                Vector2 mid = sample.ClusterPositions[Math.Min(5, sample.ClusterPositions.Length - 1)];
                Vector2 last = sample.ClusterPositions[sample.ClusterPositions.Length - 1];
                float minX = sample.ClusterPositions.Min(pos => pos.x);
                float maxX = sample.ClusterPositions.Max(pos => pos.x);
                float minY = sample.ClusterPositions.Min(pos => pos.y);
                float maxY = sample.ClusterPositions.Max(pos => pos.y);
                writer.WriteLine($" cluster0={first.x:F1},{first.y:F1} cluster5={mid.x:F1},{mid.y:F1} clusterLast={last.x:F1},{last.y:F1}");
                writer.WriteLine($" span={maxX - minX:F1}x{maxY - minY:F1} bounds={minX:F1},{minY:F1}..{maxX:F1},{maxY:F1}");
            }
        }

        if (Samples.Count >= 2 && Samples[0].ClusterPositions.Length > 0)
        {
            Vector2 a = Samples[0].ClusterPositions[0];
            Vector2 b = Samples[^1].ClusterPositions[0];
            float delta = Vector2.Distance(a, b);
            writer.WriteLine($"cluster0_delta={delta:F2}");
        }

        WriteAggregateMetrics(writer);
    }

    private static void WriteAggregateMetrics(StreamWriter writer)
    {
        if (Samples.Count < 2 || Samples[0].ClusterPositions.Length == 0)
        {
            return;
        }

        int ballCount = Samples.Min(sample => sample.ClusterPositions.Length);
        float overallMinX = float.MaxValue;
        float overallMaxX = float.MinValue;
        float overallMinY = float.MaxValue;
        float overallMaxY = float.MinValue;
        float accumulatedRangeX = 0f;
        float accumulatedRangeY = 0f;

        for (int ballIndex = 0; ballIndex < ballCount; ballIndex++)
        {
            float minX = float.MaxValue;
            float maxX = float.MinValue;
            float minY = float.MaxValue;
            float maxY = float.MinValue;
            for (int sampleIndex = 0; sampleIndex < Samples.Count; sampleIndex++)
            {
                Vector2 position = Samples[sampleIndex].ClusterPositions[ballIndex];
                minX = Mathf.Min(minX, position.x);
                maxX = Mathf.Max(maxX, position.x);
                minY = Mathf.Min(minY, position.y);
                maxY = Mathf.Max(maxY, position.y);
            }

            overallMinX = Mathf.Min(overallMinX, minX);
            overallMaxX = Mathf.Max(overallMaxX, maxX);
            overallMinY = Mathf.Min(overallMinY, minY);
            overallMaxY = Mathf.Max(overallMaxY, maxY);
            accumulatedRangeX += maxX - minX;
            accumulatedRangeY += maxY - minY;
        }

        float averageRangeX = accumulatedRangeX / ballCount;
        float averageRangeY = accumulatedRangeY / ballCount;
        float syncScore = ComputeSyncScore(ballCount);
        writer.WriteLine($"avg_ball_range={averageRangeX:F2}x{averageRangeY:F2}");
        writer.WriteLine($"overall_span={overallMaxX - overallMinX:F2}x{overallMaxY - overallMinY:F2}");
        writer.WriteLine($"sync_score={syncScore:F3}");
    }

    private static float ComputeSyncScore(int ballCount)
    {
        if (Samples.Count < 2 || ballCount <= 0)
        {
            return 0f;
        }

        float scoreTotal = 0f;
        int scoreCount = 0;
        for (int sampleIndex = 1; sampleIndex < Samples.Count; sampleIndex++)
        {
            Vector2 mean = Vector2.zero;
            int moving = 0;
            for (int ballIndex = 0; ballIndex < ballCount; ballIndex++)
            {
                Vector2 delta = Samples[sampleIndex].ClusterPositions[ballIndex] - Samples[sampleIndex - 1].ClusterPositions[ballIndex];
                if (delta.sqrMagnitude < 0.0001f)
                {
                    continue;
                }

                mean += delta.normalized;
                moving++;
            }

            if (moving == 0)
            {
                continue;
            }

            scoreTotal += mean.magnitude / moving;
            scoreCount++;
        }

        return scoreCount == 0 ? 0f : scoreTotal / scoreCount;
    }

    private static RectTransform FindDescendantByName(string name)
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
        Debug.Log("[Theme3MotionProbe] COMPLETE");
        Cleanup();
    }

    private static void Fail(string reason)
    {
        Debug.LogError("[Theme3MotionProbe] FAIL " + reason);
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
        EditorApplication.playModeStateChanged -= HandlePlayModeStateChanged;
        EditorApplication.update -= Tick;
        EditorSceneManager.playModeStartScene = null;
        if (EditorApplication.isPlaying)
        {
            EditorApplication.isPlaying = false;
        }

        EditorApplication.Exit(0);
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
