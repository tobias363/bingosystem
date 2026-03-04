using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class RemoveMissingScriptsTool
{
    private const string AutoCleanupBeforePlayPrefKey = "Candy.AutoCleanupMissingScriptsBeforePlay";

    [MenuItem("Tools/Candy/Cleanup/Remove Missing Scripts (Open Scene)")]
    public static void RemoveMissingScriptsInOpenScene()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            Debug.LogWarning("[Cleanup] Stopp Play Mode før du kjører cleanup.");
            return;
        }

        RemoveMissingScriptsInOpenSceneInternal(markSceneDirty: true, logWhenNone: true);
    }

    [MenuItem("Tools/Candy/Cleanup/Remove Missing Scripts (Selected Prefabs)")]
    public static void RemoveMissingScriptsInSelectedPrefabs()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            Debug.LogWarning("[Cleanup] Stopp Play Mode før du kjører cleanup.");
            return;
        }

        Object[] selected = Selection.objects;
        if (selected == null || selected.Length == 0)
        {
            Debug.LogWarning("[Cleanup] Velg en eller flere prefabs i Project-vinduet først.");
            return;
        }

        int totalRemoved = 0;
        int touchedPrefabs = 0;
        foreach (Object obj in selected)
        {
            string assetPath = AssetDatabase.GetAssetPath(obj);
            if (string.IsNullOrWhiteSpace(assetPath) || !assetPath.EndsWith(".prefab"))
            {
                continue;
            }

            GameObject root = PrefabUtility.LoadPrefabContents(assetPath);
            int removedFromPrefab = RemoveMissingScriptsRecursively(root);
            if (removedFromPrefab > 0)
            {
                PrefabUtility.SaveAsPrefabAsset(root, assetPath);
                touchedPrefabs += 1;
                totalRemoved += removedFromPrefab;
            }
            PrefabUtility.UnloadPrefabContents(root);
        }

        if (totalRemoved > 0)
        {
            Debug.Log($"[Cleanup] Fjernet {totalRemoved} missing-script komponent(er) fra {touchedPrefabs} prefab(s).");
        }
        else
        {
            Debug.Log("[Cleanup] Fant ingen missing-script komponenter i valgte prefabs.");
        }
    }

    [MenuItem("Tools/Candy/Cleanup/Remove Missing Scripts (Selected Prefabs)", true)]
    public static bool ValidateRemoveMissingScriptsInSelectedPrefabs()
    {
        Object[] selected = Selection.objects;
        if (selected == null || selected.Length == 0)
        {
            return false;
        }

        foreach (Object obj in selected)
        {
            string assetPath = AssetDatabase.GetAssetPath(obj);
            if (!string.IsNullOrWhiteSpace(assetPath) && assetPath.EndsWith(".prefab"))
            {
                return true;
            }
        }

        return false;
    }

    [MenuItem("Tools/Candy/Cleanup/Remove Missing Scripts (Open Scene)", true)]
    public static bool ValidateRemoveMissingScriptsInOpenScene()
    {
        return EditorSceneManager.GetActiveScene().IsValid();
    }

    [MenuItem("Tools/Candy/Cleanup/Auto Cleanup Missing Scripts Before Play")]
    public static void ToggleAutoCleanupBeforePlay()
    {
        bool enabled = !IsAutoCleanupBeforePlayEnabled();
        EditorPrefs.SetBool(AutoCleanupBeforePlayPrefKey, enabled);
        Menu.SetChecked("Tools/Candy/Cleanup/Auto Cleanup Missing Scripts Before Play", enabled);
        Debug.Log(enabled
            ? "[Cleanup] Auto-cleanup før Play er aktivert."
            : "[Cleanup] Auto-cleanup før Play er deaktivert.");
    }

    [MenuItem("Tools/Candy/Cleanup/Auto Cleanup Missing Scripts Before Play", true)]
    public static bool ValidateToggleAutoCleanupBeforePlay()
    {
        Menu.SetChecked("Tools/Candy/Cleanup/Auto Cleanup Missing Scripts Before Play", IsAutoCleanupBeforePlayEnabled());
        return true;
    }

    internal static int RemoveMissingScriptsInOpenSceneInternal(bool markSceneDirty, bool logWhenNone)
    {
        int removed = 0;
        SceneAsset activeSceneAsset = AssetDatabase.LoadAssetAtPath<SceneAsset>(EditorSceneManager.GetActiveScene().path);
        if (activeSceneAsset == null)
        {
            Debug.LogWarning("[Cleanup] Ingen aktiv scene funnet.");
            return 0;
        }

        foreach (GameObject root in EditorSceneManager.GetActiveScene().GetRootGameObjects())
        {
            removed += RemoveMissingScriptsRecursively(root);
        }

        if (removed > 0)
        {
            if (markSceneDirty)
            {
                EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
            }
            Debug.Log($"[Cleanup] Fjernet {removed} missing-script komponent(er) fra åpen scene.");
        }
        else if (logWhenNone)
        {
            Debug.Log("[Cleanup] Fant ingen missing-script komponenter i åpen scene.");
        }

        return removed;
    }

    private static bool IsAutoCleanupBeforePlayEnabled()
    {
        return EditorPrefs.GetBool(AutoCleanupBeforePlayPrefKey, true);
    }

    private static int RemoveMissingScriptsRecursively(GameObject root)
    {
        int removed = 0;
        Queue<Transform> queue = new();
        queue.Enqueue(root.transform);

        while (queue.Count > 0)
        {
            Transform current = queue.Dequeue();
            removed += GameObjectUtility.RemoveMonoBehavioursWithMissingScript(current.gameObject);

            for (int i = 0; i < current.childCount; i++)
            {
                queue.Enqueue(current.GetChild(i));
            }
        }

        return removed;
    }
}

[InitializeOnLoad]
public static class RemoveMissingScriptsBeforePlayHook
{
    static RemoveMissingScriptsBeforePlayHook()
    {
        EditorApplication.playModeStateChanged -= HandlePlayModeStateChanged;
        EditorApplication.playModeStateChanged += HandlePlayModeStateChanged;
    }

    private static void HandlePlayModeStateChanged(PlayModeStateChange state)
    {
        if (state != PlayModeStateChange.ExitingEditMode)
        {
            return;
        }

        if (!EditorPrefs.GetBool("Candy.AutoCleanupMissingScriptsBeforePlay", true))
        {
            return;
        }

        RemoveMissingScriptsTool.RemoveMissingScriptsInOpenSceneInternal(markSceneDirty: true, logWhenNone: false);
    }
}
