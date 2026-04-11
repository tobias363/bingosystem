using UnityEngine;
using UnityEditor;

[CustomEditor(typeof(TestScript))]
public class TestEditor : Editor
{
    public override void OnInspectorGUI()
    {
        base.OnInspectorGUI();
        TestScript ts = target as TestScript;
        if (GUILayout.Button("Test Button"))
        {
            ts.Test();
        }
    }
}