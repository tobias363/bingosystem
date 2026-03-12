using System.Collections.Generic;
using TMPro;
using UnityEngine;

internal static class Theme1RuntimeViewCommon
{
    internal static void EnsureListCapacity<T>(List<T> items, int requiredCount)
    {
        if (items == null)
        {
            return;
        }

        while (items.Count < requiredCount)
        {
            items.Add(default);
        }
    }

    internal static void DeactivateSiblingTextTargets(Transform parent, TextMeshProUGUI keepLabel)
    {
        Theme1OverlayLabelFactory.DeactivateSiblingTextTargets(parent, keepLabel);
    }

    internal static string ReadText(TMP_Text target, string fallback)
    {
        return Theme1OverlayLabelFactory.ReadText(target, fallback);
    }

    internal static void SetActiveIfNeeded(GameObject target, bool active)
    {
        if (target != null && target.activeSelf != active)
        {
            target.SetActive(active);
        }
    }

    internal static Vector2 ResolvePreferredCellSize(Transform cellRoot)
    {
        return Theme1CardBoardBuilder.ResolvePreferredCellSize(cellRoot);
    }
}
