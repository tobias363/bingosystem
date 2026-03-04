using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class RemoveMissingScriptsTool
{
    [MenuItem("Tools/Candy/Cleanup/Remove Missing Scripts (Open Scene)")]
    public static void RemoveMissingScriptsInOpenScene()
    {
        int removed = 0;
        SceneAsset activeSceneAsset = AssetDatabase.LoadAssetAtPath<SceneAsset>(EditorSceneManager.GetActiveScene().path);
        if (activeSceneAsset == null)
        {
            Debug.LogWarning("[Cleanup] Ingen aktiv scene funnet.");
            return;
        }

        foreach (GameObject root in EditorSceneManager.GetActiveScene().GetRootGameObjects())
        {
            removed += RemoveMissingScriptsRecursively(root);
        }

        if (removed > 0)
        {
            EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
            Debug.Log($"[Cleanup] Fjernet {removed} missing-script komponent(er) fra åpen scene.");
        }
        else
        {
            Debug.Log("[Cleanup] Fant ingen missing-script komponenter i åpen scene.");
        }
    }

    [MenuItem("Tools/Candy/Cleanup/Remove Missing Scripts (Selected Prefabs)")]
    public static void RemoveMissingScriptsInSelectedPrefabs()
    {
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
