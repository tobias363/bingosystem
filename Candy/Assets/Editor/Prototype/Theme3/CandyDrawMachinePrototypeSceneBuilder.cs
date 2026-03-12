using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;

public static class CandyDrawMachinePrototypeSceneBuilder
{
    private const string ScenePath = "Assets/Scenes/Theme3_DrawMachinePrototype.unity";
    private const string TargetMachineAssetPath = "Assets/Resources/CandyPrototype/bingoballer.png";

    [MenuItem("Candy/Prototype/Build Theme3 Draw Machine Scene")]
    public static void BuildPrototypeSceneMenu()
    {
        BuildPrototypeScene(logSummary: true);
    }

    public static void BuildPrototypeSceneCli()
    {
        BuildPrototypeScene(logSummary: true);
    }

    private static void BuildPrototypeScene(bool logSummary)
    {
        EnsureMachineAssetImported();

        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        scene.name = "Theme3_DrawMachinePrototype";

        GameObject cameraObject = new GameObject("Main Camera");
        Camera camera = cameraObject.AddComponent<Camera>();
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.16f, 0.07f, 0.18f, 1f);
        camera.orthographic = true;
        camera.orthographicSize = 5f;
        camera.tag = "MainCamera";

        GameObject eventSystemObject = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
        eventSystemObject.transform.position = Vector3.zero;

        GameObject root = new GameObject("Theme3_DrawMachinePrototypeRoot");
        CandyDrawMachinePrototypeController controller = root.AddComponent<CandyDrawMachinePrototypeController>();
        controller.EditorRebuildPrototypeHierarchy();
        EditorUtility.SetDirty(root);

        Directory.CreateDirectory(Path.GetDirectoryName(ScenePath) ?? "Assets/Scenes");
        EditorSceneManager.SaveScene(scene, ScenePath, true);
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();

        if (logSummary)
        {
            Debug.Log($"[CandyPrototype] Built {ScenePath}");
        }
    }

    private static void EnsureMachineAssetImported()
    {
        string sourceMachinePath = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "bilder", "bingoballer.png"));
        if (!File.Exists(sourceMachinePath))
        {
            throw new FileNotFoundException($"Fant ikke kildefil for glasskule: {sourceMachinePath}");
        }

        string targetMachinePath = Path.GetFullPath(Path.Combine(Application.dataPath, "..", TargetMachineAssetPath));
        string targetDirectory = Path.GetDirectoryName(targetMachinePath);
        if (string.IsNullOrWhiteSpace(targetDirectory))
        {
            throw new InvalidOperationException("Klarte ikke løse target-directory for prototype-asset.");
        }

        Directory.CreateDirectory(targetDirectory);

        bool needsCopy = true;
        if (File.Exists(targetMachinePath))
        {
            byte[] sourceBytes = File.ReadAllBytes(sourceMachinePath);
            byte[] targetBytes = File.ReadAllBytes(targetMachinePath);
            needsCopy = sourceBytes.Length != targetBytes.Length;
            if (!needsCopy)
            {
                for (int index = 0; index < sourceBytes.Length; index++)
                {
                    if (sourceBytes[index] == targetBytes[index])
                    {
                        continue;
                    }

                    needsCopy = true;
                    break;
                }
            }
        }

        if (needsCopy)
        {
            File.Copy(sourceMachinePath, targetMachinePath, true);
        }

        AssetDatabase.ImportAsset(TargetMachineAssetPath, ImportAssetOptions.ForceUpdate);
        TextureImporter importer = AssetImporter.GetAtPath(TargetMachineAssetPath) as TextureImporter;
        if (importer == null)
        {
            throw new InvalidOperationException($"Klarte ikke hente TextureImporter for {TargetMachineAssetPath}");
        }

        bool importerDirty = false;
        if (importer.textureType != TextureImporterType.Sprite)
        {
            importer.textureType = TextureImporterType.Sprite;
            importerDirty = true;
        }

        if (importer.spriteImportMode != SpriteImportMode.Single)
        {
            importer.spriteImportMode = SpriteImportMode.Single;
            importerDirty = true;
        }

        if (!importer.alphaIsTransparency)
        {
            importer.alphaIsTransparency = true;
            importerDirty = true;
        }

        if (importer.mipmapEnabled)
        {
            importer.mipmapEnabled = false;
            importerDirty = true;
        }

        if (importer.filterMode != FilterMode.Bilinear)
        {
            importer.filterMode = FilterMode.Bilinear;
            importerDirty = true;
        }

        if (importer.textureCompression != TextureImporterCompression.Uncompressed)
        {
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importerDirty = true;
        }

        if (importerDirty)
        {
            importer.SaveAndReimport();
        }
    }
}
