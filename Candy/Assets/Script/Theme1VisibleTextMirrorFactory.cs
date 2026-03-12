using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

internal static class Theme1VisibleTextMirrorFactory
{
    public static void EnsureVisibleTextMirror(TMP_Text source, string mirrorName, Color preferredColor, bool hideWhenBlank)
    {
        if (source == null || source.transform.parent == null || string.IsNullOrWhiteSpace(mirrorName))
        {
            return;
        }

        if (ShouldSuppressForActiveTheme1(source))
        {
            return;
        }

        Transform parent = source.transform.parent;
        Theme1VisibleTextBridge bridge = parent.Find(mirrorName)?.GetComponent<Theme1VisibleTextBridge>();
        if (bridge == null)
        {
            GameObject mirrorObject = new GameObject(mirrorName, typeof(RectTransform), typeof(Text), typeof(Theme1VisibleTextBridge));
            mirrorObject.layer = parent.gameObject.layer;
            mirrorObject.transform.SetParent(parent, false);
            bridge = mirrorObject.GetComponent<Theme1VisibleTextBridge>();
        }

        if (bridge == null)
        {
            return;
        }

        RectTransform sourceRect = source.rectTransform;
        RectTransform mirrorRect = bridge.GetComponent<RectTransform>();
        mirrorRect.anchorMin = sourceRect.anchorMin;
        mirrorRect.anchorMax = sourceRect.anchorMax;
        mirrorRect.pivot = sourceRect.pivot;
        mirrorRect.anchoredPosition = sourceRect.anchoredPosition;
        mirrorRect.sizeDelta = sourceRect.sizeDelta;
        mirrorRect.localScale = Vector3.one;
        mirrorRect.localRotation = Quaternion.identity;
        bridge.Bind(source, hideWhenBlank, preferredColor);
        PositionVisibleTextMirror(parent, bridge.transform, source.transform);
    }

    public static void SyncVisibleTextMirror(TMP_Text source)
    {
        if (source == null || source.transform.parent == null)
        {
            return;
        }

        if (ShouldSuppressForActiveTheme1(source))
        {
            return;
        }

        Theme1VisibleTextBridge[] bridges = source.transform.parent.GetComponentsInChildren<Theme1VisibleTextBridge>(true);
        for (int i = 0; i < bridges.Length; i++)
        {
            if (bridges[i] != null && bridges[i].Source == source)
            {
                bridges[i].SyncNow();
            }
        }
    }

    public static void PositionVisibleTextMirror(Transform parent, Transform mirror, Transform source)
    {
        if (parent == null || mirror == null || source == null)
        {
            return;
        }

        int targetIndex = source.GetSiblingIndex();
        for (int childIndex = 0; childIndex < parent.childCount; childIndex++)
        {
            Transform child = parent.GetChild(childIndex);
            if (child == null)
            {
                continue;
            }

            bool isOverlay =
                string.Equals(child.name, Theme1GameplayViewRepairUtils.SelectionMarkerName, StringComparison.Ordinal) ||
                string.Equals(child.name, Theme1GameplayViewRepairUtils.MissingOverlayName, StringComparison.Ordinal) ||
                string.Equals(child.name, Theme1GameplayViewRepairUtils.MatchedOverlayName, StringComparison.Ordinal);
            if (isOverlay)
            {
                targetIndex = Mathf.Min(targetIndex, childIndex);
                break;
            }
        }

        mirror.SetSiblingIndex(Mathf.Clamp(targetIndex, 0, Mathf.Max(0, parent.childCount - 1)));
    }

    private static bool ShouldSuppressForActiveTheme1(TMP_Text source)
    {
        if (source == null)
        {
            return false;
        }

        if (Theme1ManagedTypographyRegistry.BelongsToTheme1Presentation(source))
        {
            return true;
        }

        return source.gameObject.scene.IsValid() &&
               string.Equals(source.gameObject.scene.name, "Theme1", StringComparison.Ordinal);
    }
}
