using System;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class Theme1VisualCaptureRequestListener
{
    private static readonly string RequestPath = Path.GetFullPath(Path.Combine(
        Application.dataPath,
        "..",
        "..",
        "output",
        "css-preview",
        "theme1-editor-capture-request.txt"));

    private static double nextPollAt;

    [InitializeOnLoadMethod]
    private static void Initialize()
    {
        EditorApplication.update -= Poll;
        EditorApplication.update += Poll;
        Debug.Log("[Theme1VisualCapture] Request listener initialized.");
    }

    private static void Poll()
    {
        if (EditorApplication.timeSinceStartup < nextPollAt)
        {
            return;
        }

        nextPollAt = EditorApplication.timeSinceStartup + 0.75d;
        if (!File.Exists(RequestPath))
        {
            return;
        }

        if (EditorApplication.isCompiling ||
            EditorApplication.isUpdating ||
            EditorApplication.isPlaying ||
            EditorApplication.isPlayingOrWillChangePlaymode)
        {
            return;
        }

        string requestedOutputPath = null;
        string requestedScenario = null;
        bool? requestedFullFrame = null;
        try
        {
            string requestPayload = File.ReadAllText(RequestPath);
            string[] lines = requestPayload.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            requestedOutputPath = lines.Length > 0 ? lines[0].Trim() : string.Empty;
            requestedScenario = lines.Length > 1 ? lines[1].Trim() : null;
            if (lines.Length > 2)
            {
                requestedFullFrame = string.Equals(lines[2].Trim(), "1", StringComparison.Ordinal);
            }
            Debug.Log(
                "[Theme1VisualCapture] Request file detected: " +
                $"{requestedOutputPath} scenario={requestedScenario ?? "<default>"} fullFrame={(requestedFullFrame.HasValue ? (requestedFullFrame.Value ? "1" : "0") : "<default>")}");
        }
        catch (Exception ex)
        {
            Debug.LogWarning("[Theme1VisualCapture] Failed to read request: " + ex.Message);
        }
        finally
        {
            try
            {
                File.Delete(RequestPath);
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[Theme1VisualCapture] Failed to delete request: " + ex.Message);
            }
        }

        EditorApplication.delayCall += () => Theme1VisualRenderCapture.RunFromEditorRequest(requestedOutputPath, requestedScenario, requestedFullFrame);
    }
}
