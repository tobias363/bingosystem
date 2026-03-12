using System;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class Theme1MachineMotionProbeRequestListener
{
    private static readonly string RequestPath = Path.GetFullPath(Path.Combine(
        Application.dataPath,
        "..",
        "..",
        "output",
        "theme1-machine-motion-probe-request.txt"));

    private static double nextPollAt;

    [InitializeOnLoadMethod]
    private static void Initialize()
    {
        EditorApplication.update -= Poll;
        EditorApplication.update += Poll;
        Debug.Log("[Theme1MachineMotionProbe] Request listener initialized.");
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
        try
        {
            requestedOutputPath = File.ReadAllText(RequestPath).Trim();
            Debug.Log("[Theme1MachineMotionProbe] Request file detected: " + requestedOutputPath);
        }
        catch (Exception ex)
        {
            Debug.LogWarning("[Theme1MachineMotionProbe] Failed to read request: " + ex.Message);
        }
        finally
        {
            try
            {
                File.Delete(RequestPath);
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[Theme1MachineMotionProbe] Failed to delete request: " + ex.Message);
            }
        }

        EditorApplication.delayCall += () => Theme1MachineMotionProbe.RunFromEditorRequest(requestedOutputPath);
    }
}
