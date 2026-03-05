#if UNITY_EDITOR
using System;
using System.Reflection;
using TMPro;
using UnityEditor;
using UnityEngine;

/// <summary>
/// Keeps TextMesh Pro essentials healthy across project clones / Unity upgrades.
/// </summary>
[InitializeOnLoad]
public static class TMPAutoRepair
{
    private const string SessionKey = "Candy.TMPAutoRepair.SessionExecuted";

    static TMPAutoRepair()
    {
        EditorApplication.delayCall += RunOncePerSession;
    }

    [MenuItem("Tools/Candy/Repair/Run TMP Auto Repair")]
    private static void RunFromMenu()
    {
        ExecuteRepair(forceRun: true);
    }

    private static void RunOncePerSession()
    {
        if (SessionState.GetBool(SessionKey, false))
        {
            return;
        }

        SessionState.SetBool(SessionKey, true);
        ExecuteRepair(forceRun: false);
    }

    private static void ExecuteRepair(bool forceRun)
    {
        if (EditorApplication.isCompiling || EditorApplication.isUpdating)
        {
            return;
        }

        TMP_Settings settings = Resources.Load<TMP_Settings>("TMP Settings");
        bool changed = false;

        if (settings == null)
        {
            Debug.LogWarning("[TMPAutoRepair] TMP Settings mangler. Importerer TMP Essentials automatisk.");
            TMP_PackageResourceImporter.ImportResources(importEssentials: true, importExamples: false, interactive: false);
            AssetDatabase.Refresh();
            settings = Resources.Load<TMP_Settings>("TMP Settings");
        }

        if (settings == null)
        {
            if (forceRun)
            {
                Debug.LogError("[TMPAutoRepair] Fant fortsatt ikke TMP Settings etter import.");
            }

            return;
        }

        changed |= EnsureAssetVersionIsCurrent(settings);
        changed |= EnsureDefaultFontAsset(settings);

        if (changed)
        {
            EditorUtility.SetDirty(settings);
            AssetDatabase.SaveAssets();
            Debug.Log("[TMPAutoRepair] TMP settings repaired.");
        }
    }

    private static bool EnsureAssetVersionIsCurrent(TMP_Settings settings)
    {
        Type settingsType = typeof(TMP_Settings);
        FieldInfo assetVersionField = settingsType.GetField("assetVersion", BindingFlags.Instance | BindingFlags.NonPublic);
        FieldInfo currentVersionField = settingsType.GetField("s_CurrentAssetVersion", BindingFlags.Static | BindingFlags.NonPublic);
        MethodInfo setAssetVersionMethod = settingsType.GetMethod("SetAssetVersion", BindingFlags.Instance | BindingFlags.NonPublic);

        if (assetVersionField == null || currentVersionField == null || setAssetVersionMethod == null)
        {
            return false;
        }

        string assetVersion = assetVersionField.GetValue(settings) as string;
        string currentVersion = currentVersionField.GetValue(null) as string;
        if (string.Equals(assetVersion, currentVersion, StringComparison.Ordinal))
        {
            return false;
        }

        setAssetVersionMethod.Invoke(settings, null);
        return true;
    }

    private static bool EnsureDefaultFontAsset(TMP_Settings settings)
    {
        SerializedObject serializedSettings = new SerializedObject(settings);
        SerializedProperty defaultFontProperty = serializedSettings.FindProperty("m_defaultFontAsset");
        if (defaultFontProperty == null || defaultFontProperty.objectReferenceValue != null)
        {
            return false;
        }

        string[] fontGuids = AssetDatabase.FindAssets("LiberationSans SDF t:TMP_FontAsset", new[]
        {
            "Assets/TextMesh Pro/Resources/Fonts _ Materials"
        });

        if (fontGuids == null || fontGuids.Length == 0)
        {
            return false;
        }

        string fontPath = AssetDatabase.GUIDToAssetPath(fontGuids[0]);
        TMP_FontAsset fontAsset = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(fontPath);
        if (fontAsset == null)
        {
            return false;
        }

        defaultFontProperty.objectReferenceValue = fontAsset;
        serializedSettings.ApplyModifiedPropertiesWithoutUndo();
        return true;
    }
}
#endif
